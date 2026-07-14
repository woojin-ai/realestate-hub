# QA 독립검증 리포트 — AI 맞춤 추천 MVP

- 대상 프로젝트: `C:\bitcoin_vdcode\realestate_claude code` (Next.js 16 + Supabase + Vercel)
- 검증일: 2026-07-14
- 기준 문서: `docs/design/ai-recommend-section.md`(수용 기준), `docs/planning/ai-recommend.md`
- 대조 원본: `C:\bitcoin_vdcode\realestate\recommender.py`, `app.py` `/api/recommend`(1004~1153)
- 검증 파일(신규): `lib/recommender.ts`, `app/api/recommend/route.ts`, `supabase/apt_geo.sql`,
  `components/AiRecommendSection.tsx`, `RecommendForm.tsx`, `RecommendCard.tsx`, `RecommendCardSkeleton.tsx`
- 검증 파일(수정): `app/page.tsx`

## 최종 판정: PASS (수정 필요 FAIL 0, LOW 관찰 6건)

### 1. 빌드/타입/린트 — PASS
`npx tsc --noEmit` exit 0, `npx eslint`(7개 파일) exit 0, `npx next build` 성공(`/api/recommend` ƒ dynamic 등록).

### 2. 점수 산식 원본 대조 + 독립 재검산 — PASS
강남구 매매(year=2015, 45/35/20) 실응답 8건 손계산 대조.
- 역세권 8/8 거리구간 정확(318→85, 750→65, 1060→40, 1459→15, 9999→15) — 원본 구간 일치.
- 신축 8/8 정확(2019→100, 2006→40, 2012·2014→70), 필터 `<40 제외`와 정합.
- 종합점수 = MVP 3요소 정규화 `Σwᵢ·raw/Σwᵢ`(design §7) 8/8 일치(예 래미안블레스티지 (67·45+65·35+100·20)/100=73), Math.round 반올림 일치.
- 가격점수 min/max를 **필터 이전 top-200 후보 풀 기준**으로 잡음을 역산으로 실측 확인(원본 계승).

### 3. 데이터계약 §7 — PASS
응답 `items[]`에 원점수 3필드(`price_score/subway_score/newbuild_score`) 포함(무호출 재정렬 가능).
이번 수정으로 `items[].apt`(전체 AptStat, area_stats 포함) 실려 top-30 rows 밖 단지도 모달이 rows 비의존으로 오픈.

### 4. 실호출(포트 3100) — PASS
- 강남 매매: 200/4.9s, `filled=8, total_candidates=69, pending=true, items=8`.
- 극단예산(1억 이하): 200, items=0(빈결과 트리거).
- 전세: 200, items=8.
- 엣지: 음수예산·가중치 0/0/0 모두 200 무크래시. dev 서버(3100) 종료 확인.

### 5. 회복력(apt_geo 미적용) — PASS
`apt_geo` 테이블 부재(PGRST205)에도 조회/upsert try/catch 흡수, 전 호출 200 유지.

### 6. 시크릿 노출 0 — PASS
소스/SQL/로그에 평문 키·토큰 없음. `KakaoAK ` 접두사(런타임 `process.env` 주입)만 존재 — 비밀값 소스에 없음.

### 7. dev 보고 이탈 3건 실검증 — PASS
- (a) `react-hooks/set-state-in-effect` 규칙 실재 → 렌더 중 `prevCtx` 비교 대체가 §6(탭/지역 변경 시 폐기·접힘·모달닫기) 정확 이행.
- (b) sleep 총 1.6s(K=8×0.2s), 실측 wall 4.9s로 10초 예산 내.
- (c) 연도 기본값 CUR_YEAR−10.

### 8. §9 체크리스트 코드 실사 — PASS
노출조건(빌라/단독·조회전·빈결과 미노출), 무호출 재정렬(useMemo), 평지/세대수/평수미니표 완전 부재,
빈결과 문구, 에러 배너+다시시도, 반응형(1/2/3열), 44px 컨트롤 모두 확인.

## LOW 관찰 항목 (FAIL 아님)
- **L1 (운영 선결 · 사용자 액션):** `apt_geo` 테이블 미적용 → 추천이 매 라운드 콜드(최대 8건, `pending` 항상 true,
  "더 불러오기"가 캐시 미영속으로 동일 8건 반복). `supabase/apt_geo.sql` 적용 후에야 점진 채움·웜 즉시응답 동작. 코드결함 아님.
- **L2:** 라우트 `newYear` 폴백 하드코딩 2015 vs 클라 전송 2016(CUR_YEAR−10). 클라가 항상 year 전송 → 기능영향 없음(상수 통일 권장).
- **L3:** `COLD_FILL_LIMIT=8 < 상위10` → 콜드 1라운드 최대 8카드. "상위 10"은 캐시 웜 이후 실현(배치 설계 수용).
- **L4:** `KakaoAK ` 접두사 문자열 소스 존재(불가피, 비밀값 없음).
- **L5:** `apt_geo.sql` 공개읽기 정책만, service_role 쓰기 정책 미기재(service_role RLS 우회로 쓰기 정상). 무영향.
- **L6:** 음수 예산 입력검증 없이 조용히 빈결과(graceful하나 검증 미비, 경미).

## 마스터 재검증(별도)
`git status`로 변경파일셋 확인(app/page.tsx 수정 + 신규 6파일, 동시세션 오염 없음),
`npx tsc --noEmit` exit 0, `npx next build` exit 0(`/api/recommend` dynamic 등록), 시크릿 grep 0건.
