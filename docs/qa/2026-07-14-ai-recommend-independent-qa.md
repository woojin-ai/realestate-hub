# QA 독립검증 리포트 — AI 맞춤 추천(MVP)

- 일자: 2026-07-14
- 검증자: QA팀(구현 미관여 독립 검증)
- 대상(미커밋): `lib/recommender.ts`, `app/api/recommend/route.ts`, `components/AiRecommendSection.tsx`, `components/RecommendForm.tsx`, `components/RecommendCard.tsx`, `components/RecommendCardSkeleton.tsx`, `supabase/apt_geo.sql`, `app/page.tsx`
- 기준문서: `docs/planning/ai-recommend.md`, `docs/design/ai-recommend-section.md`
- 원본로직: `C:\bitcoin_vdcode\realestate\recommender.py`, `app.py` /api/recommend(1004~1153)
- 결론: **FAIL 없음.** 전 항목 PASS. LOW 관찰 8건(정보성, 대부분 설계상 의도된 트레이드오프).

---

## 1. 점수 산식 원본 재현성 — PASS

| 산식 | 원본(Python) | TS | 판정 |
|---|---|---|---|
| 가격 | `round((max-price)/price_range*100)`, `price=avg or max`(app.py 1098-1100) | recommender.ts 56-63 동일 | 일치 |
| max/range | `prices=[avg if avg]; max; max-min or 1`(1058-1063) | computePriceRange(69-82) `p>0` 필터, `max-min || 1` | 일치 |
| 역세권 | ≤300 100/≤500 85/≤800 65/≤1200 40/else 15(1128-1132) | subwayScore 88-94 동일 | 일치 |
| 신축 newYear>0 | ≥y 100/≥y-5 70/≥y-10 40/>0 10/else 0(1114-1118) | newbuildScore 113-117 동일 | 일치 |
| 신축 newYear==0 | cur=2026; ≥-5 100/-10 80/-15 60/-20 40/-30 20/>0 10/else 0(1105-1112) | newbuildScore 103-111 동일 | 일치 |
| 종합 | 4요소 `Σ raw·(w/100)`+slope0.10(1135-1140) | 3요소 정규화 `Σ(w·raw)/Σw`(compositeScore 125-136) | **MVP 의도 변경**(평지 제외, 기획§1) |

손계산 재검산(독립):
- 가격: pool avg=[50000,80000,120000]만원 → max12만·range7만. avg50000 → (120000-50000)/70000*100=**100**; avg80000 → 40000/70000*100=57.14→**57**; avg120000 → **0**. TS 일치.
- 역세권: 250→100, 700→65, 1500→15, 9999→15. 일치.
- 신축(y=2015): 2018→100, 2012→70, 2007→40, 2004→10, ""→0. 일치.
- 신축(y=0): 2018→80, 2012→60, 2008→40, 1998→20, 1990→10. 일치.
- 종합(w45/35/20, p100·s85·n40): (4500+2975+800)/100=82.75→**83**. server/AiRecommendSection/RecommendCard 3곳 동일식 → 83.

## 2. 필터 로직 — PASS
- 예산 max=이하/min=이상: route 106-109·147-150. 원본 1067-1070과 동일(avg=`avg or 0` 기준).
- 신축 컷오프 `newYear>0 && score<40 제외`: route 151, 원본 1072-1078과 동일.
- 상위 10 절단: `slice(0,10)`(route 253) = 원본 `scored[:10]`(1148). 일치.
- max/range는 필터 이전 전체 pool(top-200) 기준: route 142-143 = 원본 1058-1063. 일치.

## 3. 엣지케이스 — PASS(LOW 별기)
- avg_price null/0: range계산서 제외(p>0), priceScore는 `avg||max`→0점. 필터 avg=`avg||0`. 원본 동일. 무크래시.
- priceRange=0(동일가): `max-min || 1`→1, 전 단지 0점. 무크래시.
- 가중치합=0: compositeScore·client 3곳 모두 `(p+s+n)/3` 폴백. 무크래시.
- budget 빈값: budgetRaw ""→null→필터 미적용.
- year=0: 절대연도 브랜치+컷오프 미적용. 정상.
- 후보 0건: totalCandidates===0→empty 응답. 정상.
- 카카오 키 없음: hasKakaoKey()=false→라이브 스킵, 라우트 무크래시(→ L3 참고).
- Supabase/apt_geo 없음: getSupabaseServerClient try/catch·select/upsert try/catch로 라이브 폴백. 무크래시.

## 4. 데이터계약(design §7) — PASS
- 응답에 price_score/subway_score/newbuild_score 원점수 포함(route 242-244). 슬라이더 무호출 재정렬 가능.
- compositeScore 3곳 동일공식: recommender.ts 125-136 / AiRecommendSection.tsx 32-40 / RecommendCard.tsx 37-46. 문자단위 동일(sum<=0 폴백 포함).
- 편차(문서화됨): 응답에 `apt: AptStat` 전체 포함(§4-C 옵션b, rows 비의존 모달) → L8.

## 5. 디자인 체크리스트(§9) — PASS(14/14)
노출조건(page.tsx 162-168 + AiRecommendSection 156), 상태전이 collapsed→form→running→result, 슬라이더 3종·기본 45/35/20·평지 없음, dealType 라벨만, 스켈레톤+진행배지 N/M, **무호출 즉시 재정렬**(useMemo 88-92)+마이크로카피, 카드요소(평지막대·평수표 없음), 카드클릭 AptDetailModal(item.apt), dirty "다시 추천 받기", ctx변경 폐기·접힘·모달닫기(77-85), 빈결과 문구, 에러배너+다시시도(부분결과 유지), 반응형 1/2/3열·44px, 원점수 포함 — 전부 확인.

## 6. 예산 단위 정합성 — PASS
폼 억입력→`Math.round(n*10000)` 만원(RecommendForm 52) → state 만원 → route Number(만원) → analyzer avg_price(만원)와 직접 비교. 8억→80000, avg_price 80000. 정합.

## 7. 빌드/타입/린트 독립 재실행 — PASS
- `npx tsc --noEmit` → EXIT 0.
- `npx eslint <7개 파일>` → EXIT 0.
- `npx next build`(next 16.2.10) → Compiled successfully, `/api/recommend` = ƒ(Dynamic) 등록, EXIT 0.

## 8. 시크릿 노출 — PASS
grep(KAKAO_API_KEY/KakaoAK/VWORLD/MOLIT/Authorization): 소스에 평문 키 없음. `KakaoAK ${key}`(recommender.ts 150)는 런타임 `process.env` 주입뿐. 로그/응답에 키 미노출.

---

## LOW 관찰(정보성 · 비차단)
- **L1** Python `round`(banker's) vs JS `Math.round`(half-up): 정확히 .5 경계인 price_score에서 원본 대비 ±1 가능. 실데이터 희소·표시용 원점수. 기능영향 없음.
- **L2** budget=0 & type=max: 원본은 falsy로 "필터 없음", TS는 `avg>0` 전건 제외(0건). design상 예산은 0 초과 입력이라 비정상 입력 경로. 무크래시.
- **L3** KAKAO 키 부재 + 캐시 없음: items=[]·pending=true 반환 → 클라가 에러배너 대신 스켈레톤+"더 불러오기"에 고착(에러문구 없음). .env 미설정(배포 환경설정) 경로. 후속 가드 권고(canLive=false & filled=0 시 명시 안내). 무크래시.
- **L4** Supabase 영속 없이 "남은 단지 더 불러오기": 캐시 미영속이라 매번 동일 first-K 재채움→진행 안 됨. DB가 의도된 캐시라 정상 전제하 무해.
- **L5** 콜드스타트 top-10: 원본은 전 후보 스코어 후 진짜 top-10(1~2분), MVP는 first≤K(count순)만 채워 부분 top-10+pending. 기획§2(a+b+d) 명시 트레이드오프.
- **L6** 서버가 10건만 반환→슬라이더 대폭 변경 시 11위 이하 편입 불가(재실행 필요). design§3-B 수용범위.
- **L7** 신축연도 기본값: design 본문 "2015" vs 클라 `현재-10`(2026→2016) vs route 폴백 2015. 미세 불일치(모두 대략 현재-10). 표시상 무해.
- **L8** 응답 payload에 `apt: AptStat`(area_stats 포함) 실림 → §7은 area_stats 선택. §4-C 옵션b 의도적 편차. 비밀 아님, payload만 증가.
