# 마이그레이션 아키텍처: Flask+ngrok → Next.js+Supabase+Vercel

## 왜 바꾸나
원본(`C:\bitcoin_vdcode\realestate`)은 로컬 PC에서 `python app.py`(Flask, 포트 5000/5001)를 상시 실행하고 ngrok으로 외부 노출하는 구조였다. PC가 꺼지거나 ngrok 세션이 끊기면 서비스가 중단된다. Vercel(상시 배포, HTTPS 자동)과 Supabase(관리형 Postgres)로 옮기면 로컬 PC 의존 없이 24시간 운영 가능하다.

## 컴포넌트 대응표

| 원본 (Flask) | 새 구조 | 비고 |
|---|---|---|
| `app.py` (Flask 라우트 + HTML 템플릿) | Next.js App Router 페이지 + React 컴포넌트 | `render_template_string` → React 컴포넌트, `/api/refresh` 등 → Route Handler |
| `fetcher.py` (국토부 API 호출 + JSON 파일 캐시) | Route Handler(`app/api/collect/route.ts`) + Supabase `deals` 테이블 | 파일 캐시 → DB 저장. 서비스키 이중인코딩 방지 등 원본의 API 호출 방식 그대로 이관 |
| `analyzer.py` (통계/필터 로직) | TypeScript 유틸(`lib/analyzer.ts`)로 포팅, 결과는 `monthly_stats` 테이블에 캐시 | 오피스텔/도시형 필터 키워드 리스트는 원본 그대로 이관(임의 축소 금지) |
| `recommender.py` (AI 맞춤 추천) | `lib/recommender.ts` | 2차 우선순위 (핵심 대시보드 이관 후) |
| `scheduler.py` (매일 9시 실행, `schedule` 라이브러리로 상시 루프) | **Vercel Cron Jobs** (`vercel.json`의 `crons`) → 매일 지정 시각에 Route Handler 호출 | 서버리스는 상시 루프 불가 — cron이 짧은 단위 작업을 트리거하는 방식으로 전환 |
| `notifier.py` (텔레그램 발송) | Cron이 호출하는 Route Handler에서 Telegram Bot API 직접 호출 | 텔레그램 봇 토큰 발급 필요(원본도 미발급 상태) |
| `data/*.json` 파일 캐시 | Supabase `deals`, `fetch_cache_status`, `monthly_stats` 테이블 | `supabase/schema.sql` 참고 |
| `config.py` (평문 API 키) | `.env.local`(로컬) + Vercel 프로젝트 환경변수(배포) | git에 커밋 안 함 |
| ngrok | Vercel 자동 HTTPS 도메인 | 실행 필요 없음 |

## 서버리스 제약과 대응
- **실행시간 제한**: 최초 13개월치 수집이 1~2분 걸렸던 원본과 달리, Vercel 서버리스 함수는 기본 실행시간이 짧다(플랜에 따라 10~60초, Cron으로 트리거되는 함수는 더 길게 설정 가능하나 여전히 유한). → 지역 1곳씩, 월 단위로 쪼개서 여러 번의 함수 호출로 점진적 수집(`fetch_cache_status.months_collected`로 진행 상태 추적). 사용자가 처음 보는 지역은 "수집 중" 상태를 보여주고 백그라운드에서 채운다.
- **무상태(stateless)**: 파일 캐시 대신 Supabase가 유일한 진실의 원천(source of truth). 함수 재실행마다 DB에서 진행 상태를 읽어야 한다.
- **동시 실행**: 여러 사용자가 동시에 같은 지역을 조회해 중복 수집 API 호출이 발생하지 않도록 `fetch_cache_status.status`(collecting/ready)로 락 역할을 하게 한다.

## 단계별 로드맵
1. **1단계 (인프라)**: Supabase 프로젝트 생성, 스키마 적용, Next.js 스캐폴드, 환경변수 세팅 — 완료 시 로컬 개발 가능.
2. **2단계 (핵심 조회 기능)**: 지역 선택 → 국토부 API 직접 호출(캐시 없이) → 요약카드+차트+목록 표시. Supabase 저장 없이도 동작하는 최소 기능(MVP)부터.
3. **3단계 (캐시/영속화)**: Supabase 저장 붙이기, Route Handler가 DB 우선 조회 → 없으면 API 호출 후 저장.
4. **4단계 (자동 수집 + 알림)**: Vercel Cron으로 관심 지역 정기 수집, 변동률 임계값 초과 시 텔레그램 알림.
5. **5단계 (부가기능)**: AI 추천(recommender.py 이관), 주간 리포트, 관심 지역 저장.

## 원본과 다르게 가는 점 (의도적 변경)
- 모바일 반응형을 원본보다 강화한다(원본은 데스크톱 중심 고정폭 레이아웃).
- 최초 수집 대기시간을 "로딩 스피너로 1~2분 대기"에서 "우선 캐시/부분 데이터라도 즉시 표시 후 점진적 갱신"으로 UX 개선.

## 참고
- 원본 코드는 삭제하지 않고 `C:\bitcoin_vdcode\realestate`에 그대로 남겨 로직 대조용으로 계속 참조한다.
- 지역코드/시군구코드 매핑(`config.py`의 `REGION_CODES`, `LAWD_TO_SIGUNGU`)은 그대로 이관 대상 — 재입력 시 오타 위험이 크므로 원본 파일을 스크립트로 변환해 재사용할 것.
