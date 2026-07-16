# 전국 시세 랭킹 보드 `/ranking` — 화면 구성안 (디자인 스펙)

> **문서 상태: 디자인 초안 — 사용자 승인 전, 구현/배포 없음.**
> 기획 `docs/planning/next-features-2026-07-17.md`의 **1순위** 항목에 대한 사전 준비용 와이어프레임/스펙이다.
> 이 문서는 개발 착수 근거가 아니라 **승인 대기 중 사전 검토용**이며, 실제 코드(page.tsx / route.ts 등)는 아직 만들지 않는다.

- 작성: 디자인팀 / 2026-07-17
- 대상: 신규 최상위 페이지 `app/ranking/page.tsx` (사이트 정보구조 변경 — 기획 문서 마스터 확인요청 3번 참조)
- 재사용 근거(실측): `components/DealTypeTabs.tsx`, `components/DealsTable.tsx`, `components/SummaryCards.tsx`, `components/RegionSelector.tsx`, `lib/analyzer.ts`(`formatPrice`/`formatChange`/`pctChange`/`getMonthKey`), `lib/regions.ts`(`REGION_CODES`), `lib/supabase.ts`(`getSupabaseServerClient`), `lib/db-cache.ts`(monthly_stats read 패턴, PAGE_SIZE=1000 페이지네이션), `supabase/schema.sql`(`monthly_stats` 스키마), `app/globals.css`(색상 토큰), `app/page.tsx`(레이아웃 패턴).

---

## 0. 실측 근거 (추측 아님)

### monthly_stats 스키마 (`supabase/schema.sql` L50–59)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `lawd_cd` | text | 법정동 시군구코드 (PK) |
| `building_type` | text | **랭킹은 `'아파트'` 고정** (PK) |
| `deal_type` | text | `'매매'` / `'전세'` (PK) — 월세는 monthly_stats에 미집계 |
| `deal_ym` | text | `YYYYMM` (PK) |
| `avg_price` | numeric **nullable** | 매매=평균 매매가 / 전세=평균 보증금. **null 가능** |
| `deal_count` | int (default 0) | 해당 월 거래건수 |
| `computed_at` | timestamptz | 집계 시각 |
- RLS: `public read monthly_stats` 켜짐(L84). 단 서버 컴포넌트에서는 `getSupabaseServerClient()`(service role, 서버 전용) 사용.

### analyzer.ts 실제 시그니처 (그대로 재사용)
- `formatPrice(wonMan: number | null): string` → 예 `"12억 3,000만원"`, null이면 `"-"` (L481).
- `formatChange(pct: number | null, diff: number | null): string` → 예 `"▲ +1.2% (+3,000만원)"`, pct null이면 `"데이터 없음"` (L491).
- `pctChange(current: number | null, previous: number | null): number | null` → 소수 2자리 반올림, `previous`가 null/0이면 null (L218).
- `getMonthKey(offset = 0): string` → offset개월 전 `YYYYMM` (L184).
- 상승/하락 트렌드 판정 관례: pct>0 상승, <0 하락, 0/`null` 유지 (SummaryCards `trendOf`, DealsTable `trendOf` 동일).

### REGION_CODES 구조 (`lib/regions.ts` L12–172)
```ts
REGION_CODES: Record<시도명, { code: string; 구: Record<시군구명, lawdCd> }>
// 예: REGION_CODES["서울특별시"].구["강남구"] === "11680"
```
- 시/도 키 9개: 서울특별시 · 경기도 · 인천광역시 · 부산광역시 · 대구광역시 · 대전광역시 · 광주광역시 · 울산광역시 · 세종특별자치시.
- **주의: lawd_cd → 지역명 역방향 맵이 없다.** `LAWD_TO_SIGUNGU`(L176)는 이름이 아니라 건축HUB 코드 매핑이라 랭킹 표기에 쓸 수 없다. → **신규 역참조 헬퍼 필요**(§4, §7-주의①).
- 렌더 정렬 관례: 시/도·시군구는 `localeCompare(…, "ko")` 가나다순(RegionSelector L13,17).

### 색상 토큰 (`app/globals.css` @theme inline — Tailwind v4, tailwind.config 아님)
`--color-brand:#3f51b5` · `--color-brand-dark:#1a237e` · `--color-up:#e53935`(상승/빨강) · `--color-down:#1e88e5`(하락/파랑) · `--color-flat:#888888`(유지/회색). Tailwind 유틸: `bg-brand` `text-brand-dark` `text-up` `text-down` `text-flat` `from-brand-dark`. 상승 배지 배경 `#ffebee`, 하락 `#e3f2fd`, 유지 `bg-gray-100`(DealsTable 관례 그대로).

### 레이아웃 관례 (`app/page.tsx`)
- 컨테이너: `max-w-[1200px] mx-auto px-4 py-5 md:px-5`.
- 카드: `bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5`.
- 헤더: `bg-gradient-to-br from-brand-dark to-[#283593] text-white`.
- 최소 터치타깃 `min-h-[44px]`.

---

## 1. 레이아웃 와이어프레임

정보 위계(위→아래): **헤더 → 안내/중립카피 → 매매·전세 탭 → 필터·정렬 컨트롤 → 상승/하락 TOP10 하이라이트 → 랭킹 리그테이블 → 집계 준비중 지역 → 면책/출처**. 메인 대시보드와 동일한 "요약 → 상세" 흐름을 유지한다.

### 데스크톱 (≥768px)

```
┌───────────────────────────────────────────────────────────────────────┐
│ 🏘️ 전국 아파트 시세 랭킹 보드           (그라디언트 헤더, 대시보드 톤 재사용) │
│ 국토교통부 공공데이터 기반 · 아파트 매매/전세 · 기준월 2026.06            │
└───────────────────────────────────────────────────────────────────────┘
  max-w-[1200px] 중앙 컨테이너
  ┌─ 안내 카드 (중립 카피 + "평균가 ≠ 평단가" 주석) ───────────────────────┐
  │ 전국 시·군·구 아파트 실거래 평균가를 단순 비교한 통계표입니다. 순위가     │
  │ 높다고 더 좋은 지역이라는 의미가 아닙니다. ⓘ 평균가는 면적 구성에…       │
  └─────────────────────────────────────────────────────────────────────┘
  [ 매매 | 전세 ]  ← DealTypeTabs 재사용

  ┌─ 컨트롤 행 ──────────────────────────────────────────────────────────┐
  │  시/도: [전체 ▾]        정렬: (평균가 ↓) (변화율 ↕) (거래량 ↕)          │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ 상승 TOP10 ─────────────────┐   ┌─ 하락 TOP10 ─────────────────┐
  │ ▲ 1  OO구   +3.1%  (평균 8.2억)│   │ ▼ 1  △△시  -2.4% (평균 3.1억)│
  │ ▲ 2  □□시   +2.7% …           │   │ ▼ 2  ◇◇구  -2.0% …          │
  │ … (10행, 변화율 기준)          │   │ …                            │
  └──────────────────────────────┘   └──────────────────────────────┘
     (변화율 산출 가능한 지역만; 두 컬럼 나란히 grid-cols-2)

  ┌─ 랭킹 리그테이블 (RankingTable) ─────────────────────────────────────┐
  │ 순위 │ 지역(시/도·시군구) │ 평균 매매가 │ 전월대비 │ 거래량 │ 기준월    │
  │  1   │ 서울 강남구        │ 22억 …      │ ▲+1.2%  │  312   │ 2026.06  │← 행 클릭
  │  2   │ 서울 서초구        │ 20억 …      │ ▲+0.8%  │  248   │ 2026.06  │  → /?lawd_cd=11650
  │  …   │ …                 │ …           │ …       │ …      │ …        │
  │ 정렬 헤더 클릭 = 해당 열 ↑↓ 토글(활성 헤더에 ▲/▼ 표기)                  │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─ 집계 준비 중 (avg_price=null 또는 거래량 0) ─────────────────────────┐
  │ 아래 지역은 최신월 집계가 아직 확보되지 않아 순위에서 제외했습니다.       │
  │ 화성시 · … (회색, 순위·수치 미표기, 클릭은 딥링크 유지)                  │
  └─────────────────────────────────────────────────────────────────────┘

  데이터 출처: 국토교통부 실거래가 공개시스템 · 마지막 집계: HH:MM (면책 문구)
```

### 모바일 (<768px)

```
[헤더 축소: 아이콘+타이틀, 서브텍스트 text-xs 줄바꿈]
[안내 카드 — 전체폭, ⓘ 주석 펼침]
[ 매매 | 전세 ]  (flex-1 2등분, min-h-44)
[시/도 전체폭 select]
[정렬 토글: 가로 스크롤 한 줄 pill  (평균가↓)(변화율↕)(거래량↕)]
[상승 TOP10]  ← 세로 스택 (카드 1열)
[하락 TOP10]  ← 세로 스택 (카드 1열)
[리그테이블]  ← 가로 스크롤 테이블, 첫 열(순위+지역) sticky left-0
[집계 준비중]
[출처/면책]
```

### 하이라이트/표기 규칙
- **정렬 토글**: `평균가 · 변화율 · 거래량` 3버튼, 각 버튼이 현재 활성이면 방향 화살표(↑/↓)를 표기하고 다시 누르면 방향 반전(DealsTable `handleSort` 관례 그대로: 같은 키 재클릭=방향 토글, 다른 키 클릭=해당 키+내림차순 시작). 리그테이블 컬럼 헤더 클릭도 동일 동작으로 동기화.
- **기본 정렬**: `평균가 ↓`(내림차순). 탭 전환(매매↔전세) 시 정렬 상태는 유지, 데이터셋만 교체.
- **집계중 표기**: `avg_price === null` **또는** `deal_count === 0` 인 지역은 **순위 부여 대상에서 제외**하고 리그테이블 하단 "집계 준비 중" 블록에 회색으로 분리한다. 빈 값이 정렬상 1위/최하위로 튀어 오정보가 되는 것을 막는다(기획 리스크 "커버리지" 대응). 문구는 "수집 중"/"집계 준비 중"으로 `text-flat` 회색(SummaryCards `수집 중` 톤 통일).
- **변화율 없음**: current만 있고 prev가 없어 `pctChange`가 null인 지역은 리그테이블엔 정상 노출(변화율 셀만 `데이터 없음`), 단 **상승/하락 TOP10에서는 제외**(변화율 정렬 대상 아님).
- **"평균가 ≠ 평단가" 주석 위치**: (1) 안내 카드 본문에 1줄, (2) 리그테이블 `평균가` 컬럼 헤더 옆 ⓘ 툴팁, (3) TOP10 하이라이트 영역 상단 캡션. 세 곳 모두 동일 문안(§6).

---

## 2. 컴포넌트 트리

```
app/ranking/page.tsx                      ← ★신규 · Server Component(async, ISR)
   │  · getSupabaseServerClient()로 monthly_stats 직접 조회(§3)
   │  · 매매/전세 두 데이터셋 + 기준월 + updatedAt 계산 후 props로 전달
   └─ <RankingBoard>                      ← ★신규 · Client("use client") · 탭/정렬/시도 상태 보유
        ├─ <header>                        (정적, 대시보드 헤더 클래스 재사용 — 컴포넌트화는 선택)
        ├─ 안내/중립카피 카드              (정적)
        ├─ <DealTypeTabs>                  ← ♻재사용 (그대로)
        ├─ <SidoFilter>                    ← ★신규
        ├─ <SortToggle>                    ← ★신규
        ├─ <RankingHighlights>             ← ★신규 (상승/하락 TOP10 두 컬럼)
        ├─ <RankingTable>                  ← ★신규
        │     └─ <RankingRow> * N          ← ★신규 (행 클릭 = 딥링크)
        ├─ <PendingRegions>                ← ★신규 (집계중 지역)
        └─ <footer>                        (정적, 출처/면책)
```

- **♻ 재사용**: `DealTypeTabs`(props `value: DealType`, `onChange`)는 매매/전세 탭에 무수정 재사용. `formatPrice`/`formatChange`/`pctChange`는 로직/포맷에 그대로 사용. 헤더/카드/색상 클래스는 대시보드 관례 재사용. `SummaryCards`·`MonthlyChart`·`DealsTable`은 이 페이지에서 직접 쓰지 않으나 스타일 톤을 참조.
- **왜 Server + Client 분리**: 데이터 조회·집계는 서버(ISR 캐싱, Supabase read를 방문당→주기당으로 수렴, molit 0콜)에서 끝내고, 탭/정렬/필터 같은 클라이언트 인터랙션만 `RankingBoard`가 담당. 매매·전세 두 데이터셋을 서버에서 함께 넘겨 클라 토글 시 **재요청 0**.

### 신규 컴포넌트 props 개략
```ts
// 공통 행 데이터 타입 (page.tsx에서 생성 → 하위로 전달)
interface RankingRegionStat {
  lawdCd: string;              // 딥링크 키
  sido: string;                // 표시명 (예: "서울")
  gu: string;                  // 시군구 표시명 (예: "강남구")
  avgPrice: number | null;     // 기준월 avg_price
  changePct: number | null;    // pctChange(current, prev)
  changeDiff: number | null;   // current - prev (formatChange용)
  dealCount: number;           // 기준월 deal_count
  refYm: string;               // 기준(최근) deal_ym  "YYYYMM"
  prevYm: string | null;
  isPending: boolean;          // avgPrice===null || dealCount===0
}

interface RankingDataset { 매매: RankingRegionStat[]; 전세: RankingRegionStat[]; }

<RankingBoard
  datasets={RankingDataset}   // 매매·전세 모두
  referenceMonth={string}     // 대표 기준월 라벨 "2026.06"
  updatedAt={string}          // computed_at 최신값(ISO)
/>

type SortKey = "avgPrice" | "changePct" | "dealCount";
type SortDir = "asc" | "desc";

<SidoFilter
  value={string}              // "" = 전체, 그 외 REGION_CODES 시도 키
  onChange={(sido: string) => void}
/>                            // REGION_CODES 키를 localeCompare(ko)로 정렬해 옵션 렌더

<SortToggle
  sortKey={SortKey} sortDir={SortDir}
  onChange={(key: SortKey) => void}  // 같은 키 재클릭=방향 토글, 다른 키=desc로 시작
/>

<RankingHighlights
  up={RankingRegionStat[]}    // 변화율 내림차순 상위 10 (changePct!=null)
  down={RankingRegionStat[]}  // 변화율 오름차순 상위 10 (changePct!=null)
  dealType={DealType}
/>

<RankingTable
  rows={RankingRegionStat[]}  // isPending 제외, 정렬 적용된 목록
  dealType={DealType}
  sortKey={SortKey} sortDir={SortDir}
  onSort={(key: SortKey) => void}   // 헤더 클릭 → SortToggle과 동일 콜백
/>
  └─ <RankingRow
       rank={number} stat={RankingRegionStat} dealType={DealType}
     />                        // 렌더: <a href={`/?lawd_cd=${lawdCd}`}> 로 행 전체 감싸 딥링크

<PendingRegions rows={RankingRegionStat[]} />  // isPending===true 목록, 회색·순위 없음
```

---

## 3. 데이터 흐름 (서버 컴포넌트 · molit 0콜)

1. `const supabase = getSupabaseServerClient();` (server 전용).
2. **읽기 범위 한정**: `monthly_stats`에서 `building_type='아파트'` 그리고 `deal_ym >= getMonthKey(3)`(최근 약 3개월; 지역별 최신 2개월을 안전히 포함) 행만 select. 컬럼: `lawd_cd, deal_type, deal_ym, avg_price, deal_count`.
   - PostgREST 기본 1000행 상한이 있으므로 `lib/db-cache.ts`의 `PAGE_SIZE=1000` 페이지네이션 패턴을 그대로 따른다(3개월×매매/전세×약117지역이면 상한 이내지만, 방어적으로 페이지 루프 권장).
3. **지역·거래유형별 그룹핑** → 각 그룹의 `deal_ym`을 내림차순 정렬:
   - `current` = avg_price!=null **그리고** deal_count>0 인 가장 최근 `deal_ym`.
   - `prev` = current 바로 아래 `deal_ym`의 avg_price(없으면 null).
   - `changePct = pctChange(currentAvg, prevAvg)` / `changeDiff = currentAvg!=null && prevAvg!=null ? currentAvg-prevAvg : null` (DealsTable mom 로직과 동일 관례).
   - current를 만족하는 달이 하나도 없으면 `isPending=true`(그 지역 최신 avg가 null이거나 거래 0).
4. **지역명 매핑**: `lawd_cd` → `{sido, gu}` 역참조(§7-주의①의 신규 헬퍼). 매칭 실패 코드는 목록에서 제외(오표기 방지).
5. 매매·전세 각각 `RankingRegionStat[]` 완성 → `RankingBoard`로 전달. 정렬/필터/TOP10 추출은 클라이언트(`RankingBoard`)에서 in-memory 처리(데이터가 작음 ≈ 지역당 1행).
6. **기준월 라벨**: 대다수 지역의 current `deal_ym` 최빈값 또는 최댓값을 헤더 "기준월"로 표기. 지역마다 최신월이 다를 수 있으므로 각 행의 `기준월` 컬럼으로 개별 투명 표기(집계 지연 지역이 같은 달로 오해되지 않게).
7. **ISR**: `export const revalidate = 21600;`(6시간) 권장. 프리워밍이 하루 1회이므로 6시간이면 신선도 충분하고 Supabase read가 주기당으로 수렴. 허용 범위 3600~21600(1~6시간). `dynamic = 'force-static'`은 쓰지 말 것(monthly_stats 갱신 반영 필요).
8. **국토부 API 콜: 0.** monthly_stats read만 수행 → 콜예산/레이트리밋과 무관.

---

## 4. 반응형 (모바일 / 데스크톱)

| 영역 | 데스크톱(≥768px) | 모바일(<768px) |
|---|---|---|
| 헤더 | 가로 배치, 패딩 `md:px-8 md:py-5`, 기준월 서브텍스트 노출 | 아이콘 축소, 타이틀 `text-base`, 서브텍스트 `text-xs` 줄바꿈 |
| 탭 | `DealTypeTabs` 그대로(flex 2등분) | 동일, 높이 `min-h-[44px]` |
| 컨트롤 | 시/도 select + 정렬 pill 한 줄 `flex-row` 정렬(우측) | 시/도 `w-full` 1줄, 정렬 pill은 `overflow-x-auto` 가로 스크롤 한 줄 |
| TOP10 | 상승·하락 2열 `grid-cols-2 gap-4` | 세로 스택 1열(상승 → 하락 순), 각 카드 `w-full` |
| 리그테이블 | `<table>` 그대로, `overflow-x-auto` + `max-h-[600px]` 세로 스크롤, `thead` sticky(DealsTable 관례) | **가로 스크롤 테이블 채택**(카드 스택 아님). 이유: 순위·평균가·변화율·거래량 다열 비교와 정렬 유지에는 테이블이 유리(DealsTable와 동일 판단). 첫 열(순위+지역명 묶음)을 `sticky left-0 bg-white z-10`으로 고정, `text-xs`·`px-2 py-2.5`로 축소 |
| 집계중 | 리스트 나열 | 동일, 회색 |

- **가로 스크롤 vs 카드 스택 결정**: 리그테이블은 **가로 스크롤 테이블**(DealsTable 선례 준수 — 정렬·다열 비교 보존). 단 **상승/하락 TOP10**은 순위 강조가 목적이므로 모바일에서 **카드/리스트 스택**으로 시각화(테이블 아님).

---

## 5. 시각적 위계 / 스타일

- 헤더 타이틀 `text-base md:text-2xl font-bold`, 서브 `text-xs md:text-sm opacity-80`(대시보드 관례).
- 리그테이블 헤더 `sticky top-0 bg-[#f5f7ff] text-gray-600 border-b-2 border-[#e0e4f0]`, 정렬 활성열에 ` ▲/▼`.
- 순위: 1~3위만 강조(`font-bold text-brand-dark`), 4위 이하 일반 `text-gray-700`. 금·은·동 색상 등 과한 게이미피케이션은 지양(YMYL 중립성).
- 변화율 셀: DealsTable 배지 그대로 — 상승 `bg-[#ffebee] text-up`, 하락 `bg-[#e3f2fd] text-down`, 유지 `bg-gray-100 text-flat`, 화살표 `▲/▼/━`, null이면 `text-flat 데이터 없음`.
- 평균가: `formatPrice(avgPrice)` 그대로("12억 3,000만원"). 지역명: `{sido축약} {gu}` (예: "서울 강남구"). 시/도 축약 매핑은 표기용 상수로 별도(서울특별시→서울 등) — 신규 헬퍼에 포함 권장.
- 행 클릭 영역: 행 전체를 `<a href="/?lawd_cd=...">`로 감싸 `min-h-[44px]` 터치타깃 확보, `focus-visible:outline-2 outline-brand`.
- **광고 배치(참고)**: 이 페이지에 광고를 넣는다면 리그테이블과 "집계 준비 중" 사이 **본문 흐름 구분선 위치 1개**만 권장. TOP10 하이라이트 내부·행 사이·정렬 버튼 근처 삽입 금지(클릭 유도/오클릭 유발). 현재 사이트에 애드센스 유닛이 없으면 이번 범위에서는 광고 미배치.

---

## 6. 카피 / 중립성 (YMYL 낮음 유지)

- **안내 카드(상단)**:
  > "전국 시·군·구 아파트 실거래가 평균을 단순 비교한 통계표입니다. 순위가 높다고 더 좋은/투자에 유리한 지역이라는 의미가 아닙니다."
- **"평균가 ≠ 평단가" 주석(ⓘ 툴팁·캡션 공통 문안)**:
  > "시·군·구 평균가는 그 달 거래된 아파트의 **면적 구성**에 크게 좌우됩니다(대형 평형 거래가 많으면 평균가가 올라갑니다). 따라서 평균가 순위는 **평(3.3㎡)당 가격 순위와 다릅니다.**"
- **집계 준비 중 안내**:
  > "아래 지역은 최신월 집계가 아직 확보되지 않아 순위에서 제외했습니다. 수집이 끝나면 다음 갱신에 반영됩니다."
- **면책(footer)**:
  > "데이터 출처: 국토교통부 실거래가 공개시스템(공공데이터포털). 신고 지연·정정이 반영되며, 특정 지역·자산의 시세를 단정하거나 투자를 권유하지 않습니다."
- 전망/추천/등급("저평가", "매수 추천" 등) 표현 **금지** — 사실(평균·건수·변화율)만 표기.

---

## 7. 빌라/단독 제약 준수

- 모든 monthly_stats 쿼리에 `building_type='아파트'` **고정**(§3-2). 빌라/단독 데이터는 조회하지 않는다.
- **UI에 건물유형 선택(BuildingTypeToggle) 미노출.** 랭킹은 아파트 전용 화면이며, 헤더 서브텍스트에 "아파트" 명시로 범위를 밝힌다. 2026-07-14 "빌라·단독 준비중 유지" 지시 준수.
- 탭은 **거래유형(매매/전세)만** 노출한다(건물유형 탭 아님).

---

## 8. 개발팀 착수 시 주의점 (승인 후)

1. **lawd_cd → 지역명 역참조 헬퍼가 없다.** `LAWD_TO_SIGUNGU`는 이름 맵이 아니다(건축HUB 코드). `REGION_CODES`를 뒤집어 `{ [lawdCd]: { sido, gu } }` + 시/도 축약 라벨을 만드는 헬퍼를 `lib/regions.ts`에 신규로 추가해야 한다. 매칭 실패 코드는 표에서 제외(오표기 방지).
2. **딥링크가 지금은 동작하지 않는다.** 현재 `app/page.tsx`는 클라이언트 `useState`로만 지역을 관리하고 **URL의 `?lawd_cd`를 읽지 않는다**(버튼 클릭으로만 조회). `/?lawd_cd=...` 딥링크가 실제로 해당 지역을 자동 선택·조회하려면 메인 대시보드가 `searchParams`(또는 `useSearchParams`)로 `lawd_cd`를 받아 초기 지역/조회를 세팅하는 **선행 작업**이 필요하다. 이 연동 없이는 랭킹 행 클릭이 빈 대시보드로 이동한다. (딥링크 UX는 랭킹 페이지의 핵심 가치이므로 함께 스코프에 넣을 것을 권고.)
3. **지역별 최신월이 다를 수 있다.** 집계 지연 지역 때문에 "기준월"을 단일 전역월로 강제하면 오해가 생긴다 → §3-6대로 행별 `기준월` 컬럼 노출 + 집계중 분리로 처리.
4. **PostgREST 1000행 상한**: 방어적으로 페이지네이션(`lib/db-cache.ts` PAGE_SIZE 패턴) 적용.
5. **avg_price는 nullable**: 정렬/포맷 시 null 가드(`pctChange`·`formatPrice`가 이미 처리하나 정렬 비교에서 null을 항상 뒤로 — DealsTable `sorted` 관례 참고).
6. **신규 최상위 라우트**는 사이트 정보구조 변경이므로, 메인/헤더에 `/ranking` 진입 링크를 어디에 둘지(글로벌 내비 부재 상태)는 별도 협의 필요 — 본 스펙 범위 밖(구성안 후속).

---

## 검수 체크리스트 (구현 후 디자인팀 확인용)
- [ ] 섹션 순서: 헤더 → 안내카피 → 매매/전세 탭 → 시도필터·정렬 → 상승/하락 TOP10 → 리그테이블 → 집계중 → 면책
- [ ] `building_type='아파트'` 고정, 건물유형 선택 UI 미노출
- [ ] `avg_price=null` 또는 `deal_count=0` 지역 = 순위 제외 + "집계 준비 중" 분리
- [ ] "평균가 ≠ 평단가" 주석 3곳(안내카드·컬럼 ⓘ·TOP10 캡션)
- [ ] 상승/하락 색상 `#e53935`/`#1e88e5`, 화살표 `▲▼━`
- [ ] 행 클릭 → `/?lawd_cd=...` 딥링크(+메인 페이지 searchParams 연동 확인)
- [ ] 모바일 리그테이블 가로 스크롤 + 첫 열 sticky / TOP10 카드 스택
- [ ] ISR `revalidate` 설정 · molit 0콜 유지
- [ ] 중립 카피/면책 문구 반영, 전망·추천 표현 없음
