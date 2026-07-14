# Supabase + Vercel 설정 가이드 (사용자 직접 진행 필요)

계정 생성/로그인이 필요한 단계라 에이전트가 대신할 수 없습니다. 아래 순서대로 진행해주세요. 완료 후 각 값을 알려주시면 바로 연결하겠습니다.

## 1. Supabase 프로젝트 생성
1. https://supabase.com 접속 → 로그인(GitHub 계정으로 로그인 권장, woojin-ai와 동일 계정이면 편함)
2. "New Project" 클릭
3. 프로젝트 이름: `realestate-hub` (자유롭게 정해도 됨)
4. DB 비밀번호: 강력한 비밀번호 생성 후 **별도로 안전하게 보관** (분실 시 재설정 가능하지만 번거로움)
5. Region: `Northeast Asia (Seoul)` 선택 (지연시간 최소화)
6. 프로젝트 생성 완료 대기 (1~2분)

## 2. 스키마 적용 (SQL 4개 파일 순서대로)
Supabase 대시보드 좌측 메뉴 → **SQL Editor** → `New query`에서 아래 4개 파일 내용을 **각각 붙여넣고 `Run`** 하세요. 순서는 무관하지만 4개 모두 적용해야 캐시가 전부 동작합니다(미적용이어도 각 기능은 라이브 폴백으로 동작하나, 매 조회마다 외부 API를 재호출해 느립니다).

| 순서 | 파일 | 생성 테이블 | 용도 |
|---|---|---|---|
| 1 | `supabase/schema.sql` | `deals`, `fetch_cache_status`, `monthly_stats`, `alert_log` | 실거래 데이터 본체·통계·알림 로그 |
| 2 | `supabase/apt_geo.sql` | `apt_geo` | 상세모달 **위치**(좌표·지하철) 캐시 |
| 3 | `supabase/apt_info.sql` | `apt_info` | 상세모달 **단지정보**(세대수·주차 등) 캐시 |
| 4 | `supabase/apt_nearby.sql` | `apt_nearby` | 상세모달 **주변시설**(학교) 캐시 |

각 실행이 에러 없이 끝나면 좌측 **Table Editor**에서 위 7개 테이블이 모두 보이는지 확인하세요. (2~4번 파일은 각 파일 상단 주석대로 RLS 공개읽기가 함께 설정됩니다.)

## 3. API 키 확인
1. 대시보드 → **Project Settings → API**
2. 아래 3개 값을 복사해서 알려주세요 (또는 직접 `.env.local`에 채워도 됩니다):
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 이 키는 절대 클라이언트/공개 저장소에 노출 금지, 서버 전용)

## 4. GitHub 저장소 (에이전트가 진행 예정)
`woojin-ai` 계정으로 새 저장소를 만들고 이 코드를 push할 예정입니다(계산기 허브와 동일 방식). 별도 승인이 필요하면 그때 다시 여쭤보겠습니다.

## 5. Vercel 프로젝트 연동 (사용자 진행)
1. https://vercel.com 접속 → GitHub 계정으로 로그인/가입
2. "Add New... → Project" → 방금 만든 GitHub 저장소 선택 → Import
3. Framework Preset: Next.js (자동 감지됨)
4. **Environment Variables**에 아래 값을 모두 등록 (Production/Preview/Development 전체 체크 권장):
   - `MOLIT_API_KEY`, `BLDRGST_API_KEY`, `KAKAO_API_KEY`, `VWORLD_API_KEY` (기존 값 재사용)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (발급 후)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (임의의 랜덤 문자열 직접 생성 — Vercel Cron 요청 검증용)
   - `ALERT_THRESHOLD_PCT` (기본 3.0)
5. Deploy 클릭 → 배포 완료되면 `*.vercel.app` 주소가 발급됨 (계산기 허브처럼 원하는 이름이 이미 선점됐다면 다른 이름으로 재시도)

## 6. 이후 자동 배포
Vercel-GitHub 연동이 완료되면, 이후 `git push origin main`할 때마다 자동으로 재배포됩니다. 에이전트는 이 연동 이후 Vercel CLI로 직접 배포하지 않고 항상 `git push`만 사용합니다.

## 7. 텔레그램 봇 (선택, 알림 기능에 필요)
1. 텔레그램에서 `@BotFather` 검색 → `/newbot` → 이름 설정 → 토큰 발급받기
2. 발급받은 토큰을 봇과 대화 시작 후, `@userinfobot` 등으로 본인 chat_id 확인
3. 두 값을 `.env.local`과 Vercel 환경변수에 등록
