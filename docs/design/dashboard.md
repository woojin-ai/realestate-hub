# 메인 대시보드 화면 구성안

- 대상: 원본(`C:\bitcoin_vdcode\realestate\app.py`)의 유일한 화면(단일 페이지 대시보드)을 Next.js로 재설계
- 범위: 헤더 ~ 아파트 목록 테이블까지 (지역선택 → 건물유형 → 매매/전세 탭 → 요약카드 → 월별차트 → 목록)
- 범위 밖(별도 구성안 필요, 이 문서에서 다루지 않음): 평수별 상세 모달, AI 맞춤 추천 섹션(recommend-box) — 로드맵 5단계 부가기능이므로 핵심 대시보드 안정화 후 별도 설계
- 원본 정보 구조(지역선택→탭→요약→차트→목록)는 그대로 유지한다. 사용자가 이미 이 순서에 익숙하고, 위→아래로 "선택 → 결과 요약 → 추이 → 상세"라는 자연스러운 탐색 흐름이라 바꿀 이유가 없음.

## 1. 레이아웃 구조 (섹션 순서)

1. **헤더 (Header)** — 브랜드/타이틀. 원본의 그라디언트(#1a237e → #283593) 유지.
2. **지역 및 건물유형 선택 (RegionBox)** — 시/도 → 구 드롭다운 + 건물유형 토글(아파트/빌라/단독) + 조회 버튼. 하나의 카드 안에 묶는다(원본과 동일).
3. **현재 조회 상태 라벨 (CurrentLabel)** — "현재 보는 유형: 🏢 아파트" 등. 매매/전세 탭 바로 위.
4. **매매/전세 탭 (DealTypeTabs)**
5. **요약 카드 그리드 (SummaryCards)** — 현재 평균가 + 전월/3개월/6개월/1년 변동
6. **월별 평균가 차트 (MonthlyChart)**
7. **아파트 목록 테이블 (DealsTable)**

데스크톱에서는 이 순서를 세로 1열로 배치(원본과 동일, `max-width: 1200px` 중앙 정렬 컨테이너 유지). 모바일도 동일한 순서를 유지하되(정보 위계상 순서를 바꿀 이유 없음), 각 섹션 내부 레이아웃만 반응형으로 조정한다.

## 2. 반응형 규칙 (데스크톱 / 모바일)

공통 브레이크포인트: Tailwind 기본값 사용 — `sm:640px`, `md:768px`, `lg:1024px`. 모바일 기준(<640px)을 기본값으로 설계하고 `md:` 이상에서 데스크톱 레이아웃 적용(모바일 퍼스트).

### 헤더
- 데스크톱: 로고+타이틀 가로 배치, 패딩 `20px 30px`
- 모바일: 로고 아이콘 축소, 타이틀 `text-base`, 서브텍스트는 `text-xs`로 줄바꿈 허용. 패딩 `12px 16px`.

### 지역/건물유형 선택 박스
- 데스크톱: 시/도·구 드롭다운 가로 나열(`flex-row`), 건물유형 버튼 가로 나열
- 모바일: 드롭다운 2개를 세로 스택(`flex-col`, 각 `w-full`) — 원본은 가로 나열이라 좁은 화면에서 잘림 발생했을 것. 건물유형 버튼은 가로 스크롤 가능한 `overflow-x-auto` 한 줄 또는 3열 그리드로 줄바꿈. 조회 버튼은 `w-full`로 확대(터치 타깃 확보, 최소 44px 높이).

### 매매/전세 탭
- 데스크톱/모바일 공통: `flex`로 2등분(`flex-1`), 탭 자체는 반응형 이슈가 적어 원본 구조 유지. 모바일에서 탭 높이를 44px 이상으로(터치 타깃).

### 요약 카드 그리드
- 데스크톱: `grid-cols-[repeat(auto-fit,minmax(200px,1fr))]` (원본과 동일, 대략 4~5열)
- 태블릿(`md`): 2열 (`grid-cols-2`)
- 모바일(`<640px`): **1열** 기본. 단, 카드 5개(현재평균가+전월/3개월/6개월/1년)가 세로로 길어지는 문제를 줄이기 위해 "현재 평균가" 카드만 전체폭 1열로 강조하고, 나머지 4개 변동 카드는 **2열 그리드**로 배치(`grid-cols-2 gap-2`). → 모바일에서 총 1(현재가) + 2x2(변동 4개) 구성.

### 월별 평균가 차트
- 데스크톱: `canvas` `max-height: 300px`, 카드 패딩 20px
- 모바일: 차트 높이를 `220~240px`로 축소(라벨 밀도 낮추기 위해 x축 라벨 회전 또는 3~4개월 간격 라벨만 표시하는 옵션을 차트 라이브러리 설정으로 처리 — 로직은 개발팀 몫이나 UI상 라벨 겹침 방지가 필요함을 명시). 카드 좌우 패딩 `12px`로 축소, 차트가 카드 폭을 벗어나지 않도록 `w-full`.

### 아파트 목록 테이블
- 데스크톱: 원본과 동일한 `<table>` 그대로, `overflow-x-auto` 래퍼 + `max-height: 600px` 세로 스크롤(헤더 sticky)
- 모바일: **가로 스크롤 테이블 방식 채택**(카드형 전환 대신). 이유: 정렬 기능(동/연식/평균가/전월대비/거래건수/최근거래월)을 유지하려면 테이블 구조가 유리하고, 카드형으로 바꾸면 6개 컬럼 비교가 어려워짐.
  - 테이블 전체를 `overflow-x-auto` 컨테이너로 감싸고, 첫 번째 컬럼(건물명)은 `sticky left-0 bg-white z-10`으로 고정해 스크롤해도 어느 행인지 식별 가능하게 함.
  - 폰트 크기 `text-xs`로 축소, 셀 패딩 `px-2 py-2`로 축소.
  - 정렬 화살표(▲▼)는 유지하되 터치 타깃 확보를 위해 th 전체를 탭 가능 영역으로.
  - 대안(향후 검토): 필요 시 "가로 스크롤 테이블" ↔ "요약 카드형 리스트" 토글 버튼 추가 가능 — 1차 구현은 가로 스크롤 방식으로 시작.

## 3. 컴포넌트 구조 제안 (React 컴포넌트 트리)

```
<DashboardPage>                         // app/page.tsx — 최상위 클라이언트 상태 보유
 ├─ <Header />                          // 정적, props 없음
 ├─ <RegionBox>                         // 지역선택+건물유형+조회버튼 컨테이너
 │   ├─ <RegionSelector
 │   │     regionCodes={REGION_CODES}   // 시/도→구 코드맵 (config.py 이관본)
 │   │     value={{ sido, gu }}
 │   │     onChange={(sido, gu, lawdCd) => void}
 │   │   />
 │   ├─ <BuildingTypeToggle
 │   │     value={buildingType}          // '아파트' | '빌라' | '단독'
 │   │     onChange={(type) => void}
 │   │   />
 │   ├─ <LoadButton
 │   │     disabled={!lawdCd}
 │   │     loading={isLoading}
 │   │     onClick={fetchData}
 │   │   />
 │   └─ <UpdatedAtLabel updatedAt={data?.updatedAt} />
 │
 ├─ <FetchStatusBanner                  // 로딩/부분데이터/에러 상태 표시 (섹션 5 참고)
 │     status={'idle'|'collecting'|'partial'|'ready'|'error'}
 │     monthsCollected={n} monthsTotal={13}
 │   />
 │
 ├─ <CurrentLabel buildingType={buildingType} />
 │
 ├─ <DealTypeTabs
 │     value={dealType}                  // '매매' | '전세'
 │     onChange={setDealType}
 │   />
 │
 ├─ <SummaryCards
 │     summary={summary[buildingType]?.[dealType]}   // { current_avg, current_ym, changes, diffs }
 │     dealType={dealType}
 │   />
 │
 ├─ <MonthlyChart
 │     monthly={summary.monthly}         // { ym: { avg, count } }
 │     dealType={dealType}
 │     loadingMonths={partialMonths}     // 점진적 갱신 시 아직 안 채워진 개월 표시용
 │   />
 │
 └─ <DealsTable
       rows={aptStats[`${buildingType}_${dealType}`]}
       dealType={dealType}
       sortKey={sortKey} sortAsc={sortAsc}
       onSort={(key) => void}
       onRowClick={(apt) => void}        // 추후 상세 모달 연결 지점(현재 범위 밖)
     />
```

### 컴포넌트별 역할 요약
| 컴포넌트 | 역할 | 주요 props |
|---|---|---|
| `RegionSelector` | 시/도→구 2단 드롭다운, 선택 시 `lawd_cd` 확정 | `regionCodes`, `value`, `onChange` |
| `BuildingTypeToggle` | 아파트/빌라/단독 3버튼 토글(원본 `.type-btn`) | `value`, `onChange` |
| `LoadButton` | 조회하기 버튼, 지역 미선택 시 비활성 | `disabled`, `loading`, `onClick` |
| `FetchStatusBanner` | 최초 수집/부분 데이터/완료 상태를 사용자에게 노출 (신규, 원본에 없음) | `status`, `monthsCollected`, `monthsTotal` |
| `DealTypeTabs` | 매매/전세 탭 전환 | `value`, `onChange` |
| `SummaryCards` | 현재 평균가 + 전월/3개월/6개월/1년 변동 카드 | `summary`, `dealType` |
| `MonthlyChart` | 월별 평균가 라인 차트(Chart.js 또는 대체 라이브러리) | `monthly`, `dealType`, `loadingMonths` |
| `DealsTable` | 정렬 가능한 아파트 목록 테이블 | `rows`, `sortKey`, `sortAsc`, `onSort`, `onRowClick` |

상태 보유 원칙: 지역/건물유형/탭/정렬 상태는 `DashboardPage`(클라이언트 컴포넌트, `'use client'`)가 보유하고 하위 컴포넌트는 최대한 프레젠테이셔널(순수 props 기반)로 유지한다. 데이터 페칭은 `DashboardPage`에서 Route Handler(`/api/data`)를 호출.

## 4. 색상/상태 규칙 (원본 그대로 유지)

- 상승: `#e53935` (빨강) — 텍스트/배지에 사용, 배지 배경은 `#ffebee`
- 하락: `#1e88e5` (파랑) — 텍스트/배지, 배지 배경은 `#e3f2fd` (원본 `.badge.down`은 `#1565c0` 톤 사용, 카드 텍스트는 `#1e88e5`를 기준값으로 통일)
- 유지/변동없음: `#888` (회색) — 배지 배경 `#f5f5f5`
- 화살표: 상승 `▲`, 하락 `▼`, 유지 `━`
- 브랜드 프라이머리: `#3f51b5` (버튼/탭 활성/링크), 다크 배리언트 `#1a237e`(헤더 그라디언트 시작, 카드 강조 텍스트)
- 재건축 배지: 25~29년차 `rebuild-soon`(주황 `#e65100`/배경 `#fff3e0`), 30년↑ `rebuild-ready`(빨강 `#c62828`/배경 `#fce4ec`, pulse 애니메이션 유지)
- Tailwind 커스텀 컬러 등록 예 (`tailwind.config`): `up: '#e53935'`, `down: '#1e88e5'`, `flat: '#888888'`, `brand: '#3f51b5'`, `brandDark: '#1a237e'`

## 5. 로딩 / 빈 데이터 / 최초 수집 중 상태 UX

마이그레이션 아키텍처 문서의 "부분 데이터 즉시 표시 + 점진적 갱신" 원칙을 다음과 같이 화면에 반영한다.

### 상태 정의 (`FetchStatusBanner` 기준)
1. **idle**: 지역 미선택. 조회 버튼 비활성.
2. **cache-hit (즉시 표시)**: Supabase에 이미 캐시된 데이터가 있으면 로딩 스피너 없이 즉시 요약카드/차트/목록을 렌더링. 배너 없음 또는 "최근 갱신: n분 전" 정도만 조용히 표시.
3. **collecting (최초 수집 / 부분 데이터)**: 캐시가 없거나 일부 개월만 채워진 상태.
   - 원본처럼 "1~2분 대기" 풀스크린 로딩을 쓰지 않는다.
   - 대신 **확보된 개월 수만큼 요약카드/차트/목록을 즉시 렌더링**하고, 차트 우측 끝과 상단에 "13개월 중 n개월 수집됨 · 자동 갱신 중" 배너를 표시.
   - 배너는 원본 스피너 스타일(`spinner` 회전 아이콘) 재사용 + 진행률 바(원본 추천 섹션의 `rec-progress-bar` 패턴 재사용) 형태 제안.
   - 백그라운드에서 짧은 간격(예: polling 또는 SSE)으로 갱신된 개월 수를 받아 차트/목록/카드를 점진적으로 다시 채운다. 데이터가 늘어날 때 차트는 자연스럽게 라인이 이어지는 애니메이션(Chart.js 기본 transition 활용).
   - 요약카드 중 아직 계산 불가한 값(예: "1년 대비"인데 12개월치가 아직 없음)은 값 대신 "수집 중"을 표시(원본의 `데이터 없음` 문구 톤 유지, 색상은 `flat` 회색).
4. **ready**: 목표 개월 수(13개월) 모두 수집 완료. 배너 사라짐, "마지막 업데이트: HH:MM" 텍스트만 남김(원본 `updated-at` 유지).
5. **empty**: 수집은 완료됐지만 해당 지역/유형/기간에 실거래가 자체가 없음. 테이블에는 원본처럼 "데이터 없음" 중앙 정렬 행, 차트/카드는 "-" 또는 "거래 없음" 표시. 에러(예: API 실패)와는 구분되는 문구 사용.
6. **error**: API/DB 오류. 원본의 `alert()` 대신 인라인 에러 배너(재시도 버튼 포함)로 대체 — alert()는 모바일 UX에 부적합.

### 원칙
- 사용자가 "화면이 멈췄다"고 느끼지 않도록, 뭔가는 항상 화면에 보이게 한다(스켈레톤보다 실제 부분 데이터 우선 노출).
- 진행 상태는 텍스트+숫자(n/13개월)로 명확히 표시해 원본의 막연한 "1~2분 소요" 문구보다 신뢰도를 높인다.
- 같은 지역을 여러 사용자가 동시에 조회할 때는(아키텍처 문서상 `fetch_cache_status.status` 락) 화면에서는 동일하게 "수집 중" 배너로 보이면 되고, 별도 UI 분기 불필요.

## 6. Tailwind CSS 클래스/스타일 가이드 (대략)

색상은 5번의 커스텀 컬러(`brand`, `brandDark`, `up`, `down`, `flat`)를 `tailwind.config`에 등록했다고 가정.

```
Header
  <header class="bg-gradient-to-br from-brandDark to-[#283593] text-white px-4 py-3 md:px-8 md:py-5 flex items-center gap-3">
  <h1 class="text-base md:text-2xl font-bold">
  <p class="text-xs md:text-sm opacity-80">

Container
  <div class="max-w-[1200px] mx-auto px-4 py-5 md:px-5">

RegionBox
  <section class="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
  드롭다운 행: <div class="flex flex-col md:flex-row gap-3 mb-3">
  select: <select class="w-full md:w-auto min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm">
  건물유형 버튼: <button class="rounded-full border-2 px-4 py-2 text-sm transition-colors
      data-[active=true]:border-brand data-[active=true]:bg-brand data-[active=true]:text-white
      border-gray-200 hover:border-[#9fa8da]">
  조회버튼: <button class="w-full md:w-auto mt-3 rounded-lg bg-brand px-7 py-2.5 text-sm text-white
      hover:bg-[#303f9f] disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]">

DealTypeTabs
  <div class="flex bg-white rounded-xl shadow-sm overflow-hidden mb-5">
  <button class="flex-1 py-3.5 text-sm md:text-base min-h-[44px] border-b-[3px] border-transparent
      data-[active=true]:border-brand data-[active=true]:text-brand data-[active=true]:font-semibold
      data-[active=true]:bg-[#f5f7ff]">

SummaryCards
  grid: <div class="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-4 mb-5">
  (모바일 4개 변동카드만 2열로 묶고 싶다면 별도 wrapper: <div class="grid grid-cols-2 gap-2 col-span-full md:contents">)
  card: <div class="bg-white rounded-xl shadow-sm p-4 md:p-5">
  label: <div class="text-xs text-gray-400 mb-1.5">
  value: <div class="text-lg md:text-2xl font-bold text-brandDark">
  up/down/flat: text-up / text-down / text-flat

MonthlyChart
  <section class="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
  <h3 class="text-sm text-gray-600 mb-4">
  <div class="h-[220px] md:h-[300px] w-full"> // canvas 래퍼로 높이 제어

DealsTable
  <section class="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
  스크롤 래퍼: <div class="overflow-x-auto"><div class="max-h-[600px] overflow-y-auto">
  table: <table class="w-full border-collapse text-xs md:text-sm">
  th: <th class="sticky top-0 z-10 bg-[#f5f7ff] px-2 py-2.5 md:px-3 text-left text-gray-600 border-b-2 border-[#e0e4f0] cursor-pointer whitespace-nowrap">
  첫 컬럼 sticky(모바일 가로스크롤용): <th class="sticky left-0 z-20 bg-[#f5f7ff]"> / <td class="sticky left-0 bg-white">
  td: <td class="px-2 py-2.5 md:px-3 border-b border-gray-100">
  badge: <span class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold
      data-[trend=up]:bg-[#ffebee] data-[trend=up]:text-up
      data-[trend=down]:bg-[#e3f2fd] data-[trend=down]:text-down
      data-[trend=flat]:bg-gray-100 data-[trend=flat]:text-flat">

FetchStatusBanner (신규)
  <div class="bg-[#f5f7ff] border border-[#dde1f5] rounded-lg px-4 py-3 mb-4 flex items-center gap-3 text-sm text-brand">
  진행바: <div class="flex-1 bg-[#e8eaf6] rounded-full h-2"><div class="bg-gradient-to-r from-brand to-[#7986cb] h-2 rounded-full transition-[width]" style="width: n%">
```

## 요약 체크리스트 (개발팀 구현 시 확인용)
- [ ] 섹션 순서: 헤더 → 지역선택(+건물유형+조회버튼) → 상태배너 → 현재라벨 → 매매/전세탭 → 요약카드 → 월별차트 → 목록테이블
- [ ] 모바일 요약카드: 현재평균가 1열 + 변동 4개 2열
- [ ] 모바일 테이블: 가로 스크롤 + 첫 컬럼(건물명) sticky
- [ ] 상승/하락/유지 색상 `#e53935` / `#1e88e5` / `#888` 그대로 사용
- [ ] alert() 대신 인라인 에러 배너
- [ ] 최초 수집 시 "n/13개월 수집됨" 진행 배너 + 부분 데이터 즉시 표시
