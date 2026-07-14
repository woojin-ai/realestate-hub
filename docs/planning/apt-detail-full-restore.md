# 아파트 상세 모달 — 원본 4섹션 전체 복원 기획안

- 대상: `realestate_claude code`(Next.js+Supabase+Vercel) — 원본 Flask `C:\bitcoin_vdcode\realestate\app.py` name-btn 모달 재현
- 배경: 2026-07-14 마스터/사용자 지시 = "빌라·단독·알림 확장 금지, 원본 핵심 기능부터 전부 복원". 복원 우선순위 ①이 아파트 상세보기.
- 현 상태: 모달(`components/AptDetailModal.tsx`)이 **평형별 분석(area_stats)만** 복원됨. 원본 모달이 함께 보여주던 **위치 / 주변 시설 / 단지 정보 3섹션이 누락** → 원본 대비 빈약. 이 갭을 메우는 것이 과제.
- 이 문서는 **개발 착수 전 기획/구조/우선순위 확정안**. 코드는 개발팀 몫.

## 근거로 삼은 원본/신 프로젝트 파일 (모두 직접 대조 완료)
- 원본: `app.py` 1156-1184(/api/nearby), 1187-1273(kaptCode·세대수 캐시 로직), 1276-1414(/api/aptinfo), 1454-1470(/api/location); `recommender.py` 93-166(schools), 169-218(big_hospital), 221-237(vet), 240-290(convenience), 293-315(elevations_batch), 318-330(slope), 333-374(subway_coord·route_slope)
- 신: `lib/recommender.ts`(getCoordinates/getNearestSubway/fillGeo 포팅됨), `supabase/apt_geo.sql`(좌표·지하철 영속캐시), `app/api/recommend/route.ts`(apt_geo 캐시-우선+라이브폴백 패턴), `components/AptDetailModal.tsx`, `lib/analyzer.ts`(AptStat: name/dong/build_year/count/avg_price/area_stats), `docs/design/apt-detail-modal.md`, `docs/planning/ai-recommend.md`(§평지 MVP 제외 결정)

---

## 0. 사실 정정 2건 (기존 메모/지시와 다름 — 개발팀 필독)

1. **경사도는 "VWorld"가 아니다.** 함수명은 `get_slope_score_vworld`지만 실제 구현(`recommender.py` 293-330)은 VWorld를 호출하지 않고 **opentopodata `srtm30m` → 실패 시 open-elevation POST 폴백**으로 고도 배치를 받아 고도범위로 점수화한다. 마스터 지시서의 "경사도점수(VWorld API)"는 명칭 오해다. 안정성 리스크의 주체는 opentopodata/open-elevation(공개 무료, rate limit·가용성 불안정)이며, 이는 AI추천 기획(`ai-recommend.md` §고도 API)에서 평지를 MVP에서 뺀 바로 그 소스다.
2. **원본 nearby의 카카오 호출 수는 "6~7회"가 아니라 최대 ~16-19회다.** 학교 SC4(1) + 미검출 학교급별 키워드 폴백(최대 3) + 어린이집 국공립/전체(2) + 대형병원 키워드 5종(5) + 병원 HP8(1) + 동물병원(1) + 편의시설 카테고리 6종(6) = **모달 1회 열 때 16~19 카카오 콜**. 캐싱 없이는 카카오 쿼터·응답시간 부담이 지시서 추정보다 훨씬 크다. → nearby 캐시는 "검토"가 아니라 **필수**로 상향한다.

---

## 1. 복원할 3개 섹션 — 원본 필드·데이터원·우선순위

평형별 분석(area_stats)은 이미 복원됨 → **손대지 않음**. 아래 3섹션을 추가한다.

### 1-A. 위치 (`/api/location`, app.py 1454-1470)

| 필드 | 원본 소스 | 신 프로젝트 조달 | MVP |
|---|---|---|---|
| `subway_name` 최근접 지하철역명 | recommender.get_nearest_subway (카카오 SW8) | **apt_geo 캐시에 이미 있음** → 재조회 0 | ✅ 필수 |
| `subway_dist` 도보거리(m) | 〃 | **apt_geo 캐시** | ✅ 필수 |
| `lat`/`lng` 좌표 | get_coordinates (카카오 키워드) | **apt_geo 캐시** (없으면 recommender.ts getCoordinates 라이브) | ✅ 필수(지도/이후확장 근거) |
| `slope_score` 단지 주변 평지점수 | get_slope_score_vworld (opentopodata) | 신규 포팅 필요 | ❌ 제외(§3) |
| `route_slope` 역까지 경로 경사 {score,label,elev_diff...} | get_subway_coordinates + get_route_slope_score (opentopodata) | 신규 포팅 필요 | ❌ 제외(§3) |

핵심: **위치 섹션의 MVP 표시분(역명·거리·좌표)은 apt_geo에 이미 영속 캐시돼 있어 신규 외부호출이 사실상 0이다.** 가장 싸고 가장 먼저 붙일 섹션. 표시 카피(권장): `🚇 {subway_name} · 도보 {subway_dist}m` (미확인 시 `subway_name==="-" || dist>=9999` → "지하철 정보 없음"). 원본 규약(`-`/`9999`)을 그대로 계승.

### 1-B. 단지 정보 (`/api/aptinfo`, app.py 1276-1414)

| 필드 | 원본 키 | 데이터원 | MVP |
|---|---|---|---|
| 세대수 `households` | kaptdaCnt / hoCnt | MOLIT getAphusBassInfoV4 | ✅ 필수 |
| 동수 `buildings` | kaptDongCnt | getAphusBassInfoV4 | ✅ 필수 |
| 복도유형 `hallway` | codeHallNm | getAphusBassInfoV4 | ✅ 필수 |
| 난방방식 `heating` | codeHeatNm | getAphusBassInfoV4 | ✅ 필수 |
| 승강기수 `elev_pass` | kaptdEcntp / kaptdEcnt | Bass/Dtl | 🔶 후순위 |
| 세대당승강기 `elev_per_hh` | elev/households 파생 | 서버 계산 | 🔶 후순위 |
| 주차 `park_above/under/total` | kaptdPcnt/kaptdPcntu | getAphusDtlInfoV4 | ✅ 필수(총주차대수) |
| 용적률 `far_ratio` | vlRat | 건축HUB getBrRecapTitleInfo | 🔶 후순위(§아래) |
| 건폐율 `cov_ratio` | bcRat | 건축HUB getBrRecapTitleInfo | 🔶 후순위(§아래) |
| 주소 `addr` | kaptAddr/doroJuso | getAphusBassInfoV4 | ✅ 필수(헤더 보강) |

- MVP 필수: 세대수/동수/복도/난방/총주차/주소. 이 6개는 MOLIT Bass+Dtl **2콜**로 확보(kaptCode만 있으면).
- 용적률/건폐율(건축HUB)은 **후순위**로 분리 권고. 근거: (1) 건축HUB는 kaptAddr 번지 정규식 파싱·bjdCode 절단에 의존해 **매칭 실패율이 구조적으로 높다**(app.py 1344-1349 번지 파싱 실패 시 조회 자체 스킵). (2) 추가 외부 콜 1회. (3) 없어도 단지정보 섹션 본질(세대·동·주차·난방)은 성립. MVP는 `far/cov`가 null이면 해당 행을 아예 숨기는 방식으로 붙이고, 정확도 검증 후 정식 노출.
- 승강기/세대당승강기도 후순위: Dtl 응답 편차가 커 null 빈발. null이면 행 숨김.

### 1-C. 주변 시설 (`/api/nearby`, app.py 1156-1184)

| 필드 | 원본 반환 | recommender.py 소스 | MVP |
|---|---|---|---|
| `elementary`/`middle`/`high` | [{name,distance}] 배열 | get_nearby_schools (SC4+키워드폴백) | ✅ 필수(각 최근접 1~2개) |
| `daycare_public`/`daycare_private` | 개수(int) | 〃 (키워드 카운트) | 🔶 후순위 |
| `hospital` | {name,distance,address} | get_nearest_big_hospital (키워드5+HP8) | 🔶 후순위 |
| `vet_hospital` | {name,distance} | get_nearest_vet_hospital | 🔶 후순위 |
| `convenience` | {supermarket,convenience,cafe,restaurant,pharmacy,bank} 개수 | get_nearby_convenience (카테고리6) | 🔶 후순위 |

- MVP 필수: **학교(초/중/고)만.** 실거주 판단 최상위 관심사이자, 카카오 호출도 학교군만 하면 SC4 1콜(+폴백 최대3)로 제한 가능. 나머지(병원·동물병원·편의시설·어린이집)는 호출량 대부분을 차지하므로(§0-2) 2차로 분리.
- 표시 카피(학교): `🏫 초등 {name} {dist}m / 중 … / 고 …`. 없으면 "반경 1km 내 없음".

---

## 2. 서버리스 캐싱 전략 (구체적 테이블·컬럼)

원본은 Flask 프로세스 메모리(`_kapt_list_cache`, `_kapt_households_cache`)에 의존한다. **Vercel 서버리스는 인보케이션 간 메모리가 소멸**하므로 이 캐시는 매 콜드 실행마다 재구축된다 → 원본의 "구 전체 단지목록 페이지네이션 로드"(getSigunguAptList3, 1000행/페이지)가 **매 aptinfo 요청마다 반복**되어 10~60초 상한을 넘길 위험. 따라서 메모리 캐시를 전부 **Supabase 영속 테이블**로 승격한다. 모든 캐시는 `apt_geo`와 동일하게 "테이블 없어도 try/catch로 라이브 폴백"(recommend route.ts 165-192 패턴 계승).

### 2-A. 위치 → `apt_geo` 재활용 (신규 테이블 불필요)
`supabase/apt_geo.sql`이 이미 `(lawd_cd,name,dong)` 자연키로 `lat/lng/subway_name/subway_dist`를 영속 저장한다. 모달 위치 섹션은 이 테이블을 **조회만** 하면 되고, 미스 시 `recommender.ts` getCoordinates+getNearestSubway로 라이브 채운 뒤 동일 테이블에 upsert(추천 라우트와 캐시 공유 → 추천에서 이미 채운 단지는 모달도 즉시 히트). **추가 스키마 0.**

### 2-B. 단지정보 → 신규 `apt_info` 테이블
```
apt_info (
  id uuid pk default gen_random_uuid(),
  lawd_cd text not null,          -- 시군구코드 5자리
  name text not null,             -- AptStat.name (원본 정규화 전 원문)
  dong text not null default '',
  kapt_code text,                 -- 해결된 kaptCode (null=매칭실패 캐시, 재시도 억제)
  households int, buildings int,
  hallway text, heating text,
  elev_pass int, elev_per_hh double precision,
  park_above int, park_under int, park_total int,
  far_ratio text, cov_ratio text, -- 건축HUB(후순위). 미확보 시 null
  addr text,
  found boolean not null default false, -- 원본 {found:false} 계승(음성 캐시)
  fetched_at timestamptz not null default now(),
  unique (lawd_cd, name, dong)
)
```
- **kaptCode 매핑을 이 행에 함께 저장**하는 것이 핵심. 원본은 kaptCode를 찾으려고 구 전체 목록을 로드했지만, 신 프로젝트는 단지별 kaptCode를 apt_info에 1회만 영속화 → 두 번째부터 getSigunguAptList3 재로드 불필요.
- **음성 캐시(found=false, kapt_code=null)** 도 저장해 매칭 실패 단지의 무한 재조회를 막는다(원본 {found:false} 계승). 단, TTL 없이 영구 null이면 API 개선 후에도 갱신 안 되므로 `fetched_at` 기준 30일 지난 found=false는 재시도 허용 권고.
- (선택) 구 단위 `getSigunguAptList3` 원본 목록을 `apt_kapt_list(sigungu_cd, payload jsonb, fetched_at)`로 별도 캐시하면 최초 콜드에서 여러 단지를 한 번에 매칭 가능. **다만 첫 요청 1건은 여전히 전체 목록 로드 비용을 치른다** → 이는 §4의 "선(先) 배경 워밍" 또는 "aptinfo는 별도 라우트로 분리해 타임아웃 격리"로 대응.

### 2-C. 주변시설 → 신규 `apt_nearby` 테이블
```
apt_nearby (
  id uuid pk default gen_random_uuid(),
  lawd_cd text not null, name text not null, dong text not null default '',
  payload jsonb not null,   -- {elementary,middle,high,daycare_*,hospital,vet_hospital,convenience} 원본 응답 형태 그대로
  fetched_at timestamptz not null default now(),
  unique (lawd_cd, name, dong)
)
```
- 자연키를 좌표 반올림이 아니라 `(lawd_cd,name,dong)`로 두어 apt_geo/apt_info와 조인 키 통일. 좌표는 apt_geo에서 얻어 nearby 카카오 호출 입력으로 쓴다(위치 섹션이 먼저 lat/lng을 확보하는 순서 이점).
- 주변시설은 상권 변동으로 값이 변하지만 실거주 판단 정밀도상 **장기 캐시(예 90일 TTL)** 로 충분. `fetched_at` 초과 시 백그라운드 재검증 권고.

### 캐싱 요약
| 섹션 | 캐시 | 신규스키마 | 콜드 미스 시 외부콜 |
|---|---|---|---|
| 위치 | apt_geo(**재활용**) | 없음 | 카카오 2(좌표+지하철) — 대개 이미 히트 |
| 단지정보 | apt_info(신규) | 있음 | MOLIT 2~3 + 최초 구목록1(이후 영속) |
| 주변시설 | apt_nearby(신규) | 있음 | 카카오 최대 16~19(학교만 MVP면 1~4) |

---

## 3. 경사도(고도 기반) 포함/제외 — 최종 권고

**권고: MVP·풀버전 모두 상세 모달에서 경사도(slope_score / route_slope) 제외.** 근거 4가지:
1. **소스 불안정 (사실 정정 §0-1).** opentopodata `srtm30m`은 공개 무료 rate limit(초당 1회·일 1000회급)·간헐 가용성 장애, open-elevation 폴백도 불안정. 이미 `ai-recommend.md`가 이 소스 때문에 평지점수를 MVP에서 뺐다 — 상세 모달도 **같은 결정을 일관 적용**하는 것이 맞다(한 사이트에서 추천은 평지 빼고 모달만 넣으면 정합성·유지보수 혼선).
2. **모달은 lazy·동기 응답이다.** 추천은 SSE 진행바로 1~2분을 버텼지만, 모달은 클릭 즉시 응답을 기대하는 UI. 고도 배치(단지 5점 + 경로 6점 = 배치 2회, 각 timeout 12s)가 모달 응답에 얹히면 체감 지연이 크고 타임아웃 위험.
3. **캐싱해도 콜드 채움 비용이 그대로.** 캐시로 재방문은 빨라지나 최초 사용자는 항상 불안정 API를 기다린다. 신뢰 못 할 소스를 첫인상 화면에 두는 것은 리스크.
4. **정보 가치 대비 리스크 과다.** 위치 섹션 MVP는 역세권(역명·거리)만으로 이미 핵심 가치를 전달. 경사는 부가 정보.

대안(만약 사용자가 강하게 원할 경우): 풀버전에서 apt_geo에 `slope_score int` 컬럼을 추가하고 **Cron 배경작업으로만 콜드 채움**(모달 응답 경로에서 절대 라이브 호출 안 함), 값 있으면 표시·없으면 숨김. 이 방식은 `ai-recommend.md` §고도 API 권고와 동일. **단, 이는 별도 트랙이며 이번 복원 범위 밖 — 마스터 확인 필요(§6).**

---

## 4. API 라우트 설계 (원본 3fetch → 신 구조)

원본 프론트는 모달 열릴 때 `/api/location`·`/api/nearby`·`/api/aptinfo`를 **병렬 3fetch(lazy)** 했다. 신 구조 권고:

**권고안: 3개 라우트를 유지하되 카카오/MOLIT를 각각 격리 + 프론트는 병렬 lazy fetch 유지 + 섹션별 독립 로딩/에러.**

- `app/api/apt-location/route.ts` — apt_geo 캐시-우선, 미스 시 recommender.ts로 라이브(경사도 없음). **가장 빠름 → 먼저 뜸.**
- `app/api/apt-info/route.ts` — apt_info 캐시-우선, 미스 시 MOLIT Bass/Dtl(+건축HUB 후순위). kaptCode 목록 로드가 있는 **가장 느린 라우트를 별도 함수로 격리**해, 이게 느려도 location/nearby 섹션 렌더를 막지 않게 한다.
- `app/api/apt-nearby/route.ts` — apt_nearby 캐시-우선, 미스 시 카카오(MVP: 학교만).

왜 통합(단일 `/api/apt-detail`) 안 하나: 세 소스의 지연 특성이 극단적으로 다르다(위치 ≈0s 캐시히트 vs 단지정보 콜드 수초~수십초 vs 주변시설 다수콜). 통합하면 **가장 느린 섹션이 전체 응답을 볼모로 잡아** 빠른 위치 섹션까지 지연된다. 분리하면 프론트가 섹션별로 스켈레톤→도착 순서대로 채워 체감 반응성이 좋고, 한 섹션 실패가 다른 섹션을 죽이지 않는다(부분 성공). 서버리스 콜드스타트 3회 비용은 있으나, 캐시 히트 후에는 무의미하고 타임아웃 격리 이득이 더 크다.

- 각 라우트: `dynamic="force-dynamic"`, `runtime="nodejs"`, 쿼리 `?lawd_cd=&gu=&name=&dong=`. (모달은 현재 `apt:AptStat`만 받고 lawd_cd/gu가 없음 → **DealsTable/page에서 lawd_cd·gu를 모달 props로 내려줘야 함.** 개발팀 반영 필요.)
- 실패/미확보는 원본 규약 계승: location 404/`-`·9999, aptinfo `{found:false}`, nearby 빈 배열/0.

---

## 5. 단계적 구현 순서 + 완료 기준

**1단계 — 위치 섹션 (가장 먼저).** 이유: apt_geo 캐시·recommender.ts 로직이 이미 있어 신규 외부의존 0, 스키마 0, 리스크 최소.
- 완료 기준: 모달에 `🚇 역명 · 도보 Nm` 표시; 미확인 단지는 "지하철 정보 없음"; apt_geo 히트 시 추가 fetch 없음; props로 lawd_cd/gu 전달 경로 확립.

**2단계 — 단지정보 섹션.** MOLIT 2콜 + apt_info 신규 캐시 + kaptCode 영속화.
- 완료 기준: 세대수/동수/복도/난방/총주차/주소 표시(null 필드 행 숨김); kaptCode·결과가 apt_info에 upsert되고 재방문 시 MOLIT 재호출 없음; 매칭 실패는 found=false 음성캐시로 저장; 최초 콜드에서도 Vercel 함수 상한 내 응답(구목록 로드 타임아웃 시 partial/{found:false} 반환). 용적률·건폐율·승강기는 이 단계에서 null 허용, 검증 후 노출.

**3단계 — 주변시설 섹션(학교 MVP).** apt_nearby 신규 캐시 + 카카오 학교만.
- 완료 기준: 초/중/고 최근접 표시; apt_nearby 캐시 히트 시 카카오 미호출; 없으면 "반경 1km 내 없음".

**후순위(2차) — 주변시설 확장(병원·동물병원·편의시설·어린이집) + 단지정보 건축HUB/승강기 정식노출.** 카카오 호출량·정확도 검증 후.

각 단계는 독립 배포 가능(섹션별 라우트 분리 덕). 위치→단지정보→주변시설 순으로 "빈약함" 체감이 가장 크게 줄어드는 순서이기도 하다.

---

## 6. 범위 밖 / 사용자(마스터) 확인 필요

1. **경사도 복원 여부 — 확인 요청.** 기획 권고는 "제외"(§3, ai-recommend 결정과 일관). 사용자가 원본 화면의 경사/평지 표기를 반드시 원하면 풀버전 Cron 채움 트랙으로 별도 승인 필요. **이 문서는 제외를 전제로 설계했음.**
2. **주변시설 전체 vs 학교만 — 확인 요청.** MVP를 학교로 좁힌 이유는 카카오 16~19콜/모달(§0-2) 부담. 병원·편의시설까지 즉시 원하면 쿼터·응답시간 리스크 명시하고 2차 일정으로 넣거나 캐시 선워밍 필요.
3. **로컬 검증 가능성 — 프로덕션 env 블로커와 무관.** 세 섹션 모두 외부 키(`MOLIT API_KEY`, `BLDRGST_KEY`, `KAKAO_API_KEY`)가 `.env.local`에 있으면 **로컬에서 완전 검증 가능**하며, Vercel 환경변수 미적용(프로덕션 블로커)과 독립이다. Supabase 캐시가 없어도 라이브 폴백으로 동작하므로(apt_geo 패턴) 캐시 테이블 미적용 상태에서도 기능 검증은 된다. 단 **캐시 성능/타임아웃 격리 효과는 프로덕션(Supabase 적용) 조건에서만 실측 가능** → 캐시 스키마 3종(apt_info/apt_nearby, apt_geo는 기존)의 Supabase 적용은 사용자 몫.
4. **사용자 우선순위 재확인 — 경미하지만 명시.** 복원 ①이 상세보기임은 확정. 다만 "MVP를 위치+단지정보(핵심6)+학교로 먼저 릴리스하고 나머지는 2차"라는 단계 축소를 사용자가 수용하는지 1회 확인 권고(원본과 즉시 100% 동일을 원하면 3단계+후순위를 한 번에 요구할 수 있음 → 그 경우 카카오/고도 리스크를 다시 고지).
5. **모달 props 확장(개발팀 인터페이스 변경).** 현재 `AptDetailModal(apt, onClose, budgetMax)`에 `lawd_cd`·`gu` 추가 필요. 추천 카드 경로(RecommendItem.apt)와 대시보드(DealsTable) 경로 양쪽에서 이 두 값을 넘길 수 있는지 개발팀 확인 필요(대시보드는 현재 선택 lawd_cd/gu 보유, 추천은 요청 파라미터로 보유 → 양쪽 다 가능하나 배선 작업 있음).
