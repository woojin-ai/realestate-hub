# 아파트 상세보기(평수별 상세) 모달 — 화면 구성안

- 대상: 부동산 실거래가 대시보드(신 프로젝트 `realestate_claude code`)에 원본 Flask 앱(`C:\bitcoin_vdcode\realestate\app.py`)의 "평수별 상세 모달"을 복원
- 단계: **개발 전 구성안**. 개발팀은 이 문서만 보고 추가 조사 없이 구현할 수 있어야 한다.
- 복원 범위: **평수별 상세 표 + 단지 요약 헤더만**. 원본 모달에 있던 카카오 기반 "위치 분석" 영역(`.modal-location`, app.py 309~311줄, 588~630줄)은 **이번 범위에서 제외**한다(별도 AI추천 트랙에서 다룸). 개발 시 위치 분석 관련 DOM/로직은 넣지 않는다.
- 데이터는 이미 준비됨: `DealsTable`이 받는 각 row(`AptStat`)에 `area_stats: AreaStat[]`가 들어 있다. **추가 API 호출·추가 fetch 없음.** 클릭 시 이미 메모리에 있는 row 객체를 그대로 모달에 넘긴다.

원본 근거 위치(사실 확인 완료):
- 모달 마크업: app.py 303~317줄 / 렌더 로직: 576~610줄 / 오버레이 닫기: 845~847줄
- name-btn 렌더: app.py 555, 563줄 / 관련 CSS: 71~72, 84~97줄

---

## 0. 원본 대비 결정 요약 (개발팀 필독)

| 항목 | 원본(app.py) | 신 프로젝트 복원안 |
|---|---|---|
| 건물명 셀 | `<button class="name-btn" onclick="openAreaModal(...)">` | 클릭 가능한 `<button>` (Tailwind, 점선 밑줄 유지) |
| 모달 표 헤더 | 평수 구간 / 전용/공급 / 평균가 / 거래건수 / 비율 | **동일하게 5컬럼 유지** |
| 위치 분석 영역 | 있음(카카오) | **제외** |
| 비율 컬럼 | count/maxCount 막대 | 막대 + 퍼센트 텍스트 병기(아래 §4-비율 참고) |
| 열림/닫힘 | `.open` 클래스 토글, 전역 함수 | React state(선택된 row)로 제어 |
| 컴포넌트 | 단일 HTML/JS | `components/AptDetailModal.tsx` 신규 분리 |

---

## 1. 건물명 셀 → 클릭 가능한 버튼

현재 `DealsTable.tsx`(103~106줄)는 건물명을 텍스트로만 렌더한다. 이를 버튼으로 교체한다.

### 마크업/스타일 스펙
- `<td>` 내부 기존 `<div className="font-medium">{row.name}</div>`를 **`<button>`으로 교체**한다. 동(`row.dong`)은 버튼 밖에 그대로 둔다(클릭 대상은 단지명만).
- 버튼 스타일(원본 `.name-btn` 느낌 유지 — app.py 71줄: `color:#1a237e; font-weight:700; text-decoration: underline dotted`):
  ```
  text-left font-bold text-brand-dark underline decoration-dotted underline-offset-2
  hover:text-brand
  focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded
  min-h-[44px] py-1
  ```
  - `text-brand-dark`(≈#1a237e), hover `text-brand`(≈#3f51b5) — 원본 색 대응. 프로젝트에 해당 토큰이 없으면 `text-[#1a237e]` / `hover:text-[#3f51b5]`로 대체.
  - **모바일 44px 터치 타깃**: 버튼 자체에 `min-h-[44px]`. 단지명 텍스트가 짧아도 세로 터치영역을 확보. (셀 패딩과 겹쳐 시각적으로 과하면 `min-h-[44px] flex items-center`로 처리.)
- 셀은 sticky(왼쪽 고정) 유지 — 기존 `sticky left-0 bg-white` 그대로. 버튼은 `bg-transparent`.

### 접근성
- `type="button"` 명시(폼 submit 방지).
- `aria-haspopup="dialog"` 부여(모달을 여는 트리거임을 명시).
- 접근 라벨: `aria-label={`${row.name} 평수별 상세 보기`}` (스크린리더가 "○○아파트 평수별 상세 보기, 버튼"으로 읽도록).
- 키보드: `<button>`이므로 Tab 포커스/Enter·Space 활성화가 기본 지원됨. 별도 keydown 핸들러 불필요.
- 시각적 포커스: 위 `focus-visible:outline` 유지(키보드 사용자 식별 가능).

---

## 2. 모달 레이아웃 (와이어프레임)

```
┌──────────────────────────────────────────────┐  ← 오버레이(반투명 #000/50, 화면 중앙 정렬)
│  ┌────────────────────────────────────┐  ✕  │  ← ✕ 닫기 버튼(모달 우상단)
│  │ 🏢 ○○아파트 — 평수별 실거래가        │      │  ← 헤더 타이틀(h2/h3)
│  │ 2005년 준공 · 21년차 · △△동           │      │  ← meta 라인(회색 소형)
│  │ · 전체 42건 · 평균 8억 5,000만원        │      │
│  ├────────────────────────────────────┤      │
│  │ 평수구간 │전용/공급│ 평균가 │건수│  비율   │      │  ← 표 헤더(sticky)
│  │ 24~30평 │59평(전용46평)│8억…│ 30건│▓▓▓ 71%│      │
│  │ 31~40평 │77평(전용60평)│11억…│ 12건│▓ 29%  │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

### 오버레이(backdrop)
- 원본 `.modal-overlay`(app.py 84줄) 대응: `fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4`.
- **바깥(오버레이) 클릭 시 닫기**: 오버레이 요소의 `onClick`에서 `e.target === e.currentTarget`일 때만 닫는다(원본 closeModal 845~847줄과 동일 개념 — 모달 내부 클릭은 무시).
- **✕ 클릭 시 닫기**, **ESC 키 닫기**: `useEffect`로 `keydown` 리스너 등록, `e.key === "Escape"` 시 닫기. 언마운트 시 리스너 해제.
- **스크롤 락**: 모달이 열려있는 동안 `document.body.style.overflow = "hidden"`, 닫힐 때 원복(cleanup). 배경 대시보드가 뒤에서 스크롤되지 않게.
- 모달 열릴 때 포커스를 모달(또는 ✕ 버튼)으로 이동, 닫히면 트리거였던 건물명 버튼으로 포커스 복귀(권장). 최소한 ✕ 버튼에 초기 포커스.

### 모달 박스
- 원본 `.modal`(app.py 86줄) 대응: `bg-white rounded-2xl shadow-2xl w-[90%] max-w-[560px] max-h-[80vh] overflow-y-auto relative p-6 md:p-7`.
- 접근성: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`로 헤더 타이틀 id 연결.

### ✕ 닫기 버튼
- 원본 `.modal-close`(app.py 92줄) 대응: `absolute top-4 right-5 text-2xl text-gray-400 hover:text-gray-600 leading-none`.
- 접근성: `type="button"`, `aria-label="닫기"`. 터치 타깃 확보 위해 `w-11 h-11`(44px) 정도 클릭영역 권장(아이콘은 시각적으로 우상단 정렬).

### 헤더(타이틀 + meta)
원본 렌더(app.py 583~586줄)를 그대로 재현:
- **타이틀**(`aria-labelledby` 대상): `🏢 {name} — 평수별 실거래가` / 스타일 `text-lg font-bold text-brand-dark mb-1`.
- **meta 라인**: 아래 순서로 ` · `(가운뎃점) 구분해 한 줄(모바일에서 줄바꿈 허용):
  - `{build_year}년 준공` (build_year 있을 때만)
  - `{2026 - Number(build_year)}년차` (build_year 있을 때만) — 원본은 하드코딩 2026 사용. 신 프로젝트에선 `new Date().getFullYear()` 사용 권장(연도 넘어가도 정확).
  - `{dong}`
  - `전체 {count}건`
  - `평균 {formatPrice(avg_price)}`
  - 스타일: `text-xs text-gray-500 mb-3`.
  - 예시 출력: `2005년 준공 · 21년차 · 역삼동 · 전체 42건 · 평균 8억 5,000만원`

---

## 3. 평수별 표 — 컬럼 정의 및 데이터 매핑

표 헤더는 원본과 **동일하게 5컬럼 유지**(app.py 313줄): `평수 구간 | 전용/공급 | 평균가 | 거래건수 | 비율`.

`area_stats: AreaStat[]`를 순회하며 각 행 렌더. `AreaStat = { range, repr_py, avg, count }`.

| 컬럼 | 헤더 | 데이터 매핑 | 비고 |
|---|---|---|---|
| 1 | 평수 구간 | `s.range` | 예: `"24~30평"` (이미 공급 기준 구간 문자열) |
| 2 | 전용/공급 | 공급평 강조 + 전용평 보조 | 아래 상세 |
| 3 | 평균가 | `formatPrice(s.avg)` | `s.avg`가 null이면 `formatPrice`가 `"-"` 반환(analyzer.ts 481~482줄) — 별도 분기 불필요 |
| 4 | 거래건수 | `${s.count}건` | |
| 5 | 비율 | 막대 + 퍼센트 | 아래 상세 |

### 컬럼 2 "전용/공급" 표기 방식 (권장안)
원본(app.py 599~603줄)은 `공급 = repr_py * 1.28`, `전용 = repr_py`로 계산해 다음처럼 표기했다:
- 표기: **`{공급}평`**(굵게) + **` (전용{전용}평)`**(회색 보조)
  - 공급평 = `Math.round(s.repr_py * 1.28)` (원본은 `.toFixed(0)`)
  - 전용평 = `Math.round(s.repr_py)` (원본은 `.toFixed(0)`)
  - 예: `59평 (전용46평)`
- 스타일: 공급 `font-semibold text-gray-800`, 보조 `text-gray-400 text-[0.78rem]`.
- **주의(중복 방지)**: 1번 컬럼 `range`가 이미 공급 기준 "구간 밴드"(예 24~30평)다. 2번 컬럼은 그 구간의 **대표 1개 값**(repr_py 기반 공급/전용 포인트값)이므로 역할이 다르다 — `range`를 2번에 그대로 재출력하지 말 것. 위 계산식(repr_py 기반)을 사용한다.

### 컬럼 5 "비율" — 막대 시각화 (권장)
원본(app.py 592, 598, 606줄)은 `count / maxCount` 폭의 막대만 표시했다. 신 프로젝트에서는 **막대 + 퍼센트 텍스트 병기**를 권장(수치 접근성 향상):
- 분모: `total = area_stats.reduce((a, s) => a + s.count, 0)` (전체 area_stats count 합). 마스터 지시 = "해당 구간 count / 전체 area_stats count 합".
- 퍼센트: `pct = total > 0 ? Math.round(s.count / total * 100) : 0` → `{pct}%` 텍스트.
- 막대 폭(시각 스케일): 원본과 동일하게 **최댓값 기준 정규화**로 대비를 살린다 — `maxCount = Math.max(...counts, 1)`, `barW = Math.round(s.count / maxCount * 100)`.
  - 즉 **막대 폭은 maxCount 기준**(시각 대비용), **표기 퍼센트는 total 기준**(의미상 점유율). 두 값의 근거를 주석으로 남길 것.
- 막대 스타일(원본 `.area-bar-wrap`/`.area-bar`, app.py 96~97줄 대응):
  - wrap: `bg-[#eef] rounded h-1.5 min-w-[60px] mt-1`
  - bar: `bg-brand h-1.5 rounded` + `style={{ width: `${barW}%` }}`
  - 퍼센트 텍스트는 막대 위/옆에 `text-[0.78rem] text-gray-500`.
  - 접근성: 막대에 `role="img"` + `aria-label={`${pct}%`}` (또는 퍼센트 텍스트가 있으면 막대는 `aria-hidden`).

### 표 스타일 (원본 `.area-table` app.py 93~95줄 대응)
- 헤더 th: `bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0] sticky top-0` (모달 내부 스크롤 시 헤더 고정 권장).
- td: `px-3 py-2 border-b border-gray-100`.
- 평균가 `<strong>`(원본 604줄)처럼 `font-semibold`로 강조.

---

## 4. area_stats가 빈 배열일 때 (빈 상태)

원본(app.py 594~595줄)은 `colspan=5` 한 줄에 "평수 데이터 없음"을 회색 중앙 정렬로 표시했다. 이를 유지:
- `s.area_stats.length === 0`이면 표 `<tbody>`에 단일 행: `<td colSpan={5} className="text-center text-gray-400 py-5">평수별 실거래 데이터가 없습니다</td>`.
- 헤더(단지명·meta)는 정상 표시(area_stats가 비어도 name/count/avg_price는 있음).

---

## 5. 매매/전세 탭 전환 시 모달 처리

- **권장: 탭 전환 시 열려 있던 모달을 닫는다.** 근거:
  - `app/page.tsx`(72줄)에서 `dealType`에 따라 `rows`가 `aptStatsMaeMae` ↔ `aptStatsJeonse`로 통째로 바뀐다. 매매 탭에서 연 단지가 전세 데이터엔 없거나(필터로 빠짐) 다른 통계를 갖는다 → 열린 모달이 이전 탭의 수치를 계속 보여주면 사용자 오인.
  - 원본은 탭 전환 시 표 자체를 다시 그리므로 모달 데이터가 stale 되는 문제가 잠재. 신 프로젝트는 명시적으로 닫아 혼선을 없앤다.
- 구현: 선택 상태(`selected`)는 `DealsTable`이 소유하고, `DealsTable`이 `dealType` prop을 이미 받으므로 `useEffect(() => setSelected(null), [dealType])`로 탭 변경 시 모달 닫기. (`rows` 참조로 열지 말고, 클릭 시점의 row 객체를 저장하는 방식이면 useEffect 한 줄로 안전.)

---

## 6. 데스크톱 / 모바일 반응형

### 모달 컨테이너
- 데스크톱: `max-w-[560px]`, 화면 중앙, `max-h-[80vh]` 내부 스크롤.
- 모바일(<640px): `w-[90%]`가 좁을 수 있으니 `w-[calc(100%-2rem)]` 수준으로 넓히고(좌우 여백 16px), `max-h-[85vh]`로 살짝 키움. `p-6`→모바일 `p-4`.

### 표 자체의 반응형 (핵심)
5컬럼 표가 모바일에서 잘리는 문제 방지. **두 방식 중 A를 기본 권장**:

- **방식 A(권장) — 가로 스크롤 유지**: 표를 `overflow-x-auto` 래퍼로 감싸고 `min-w-[420px]` 부여. 데스크톱과 동일 표 구조를 유지해 개발 단순 + 컬럼 정렬 일관. 첫 컬럼(평수 구간)을 `sticky left-0 bg-white`로 고정하면 가로 스크롤 중에도 어떤 구간인지 식별 가능. 대시보드 메인 `DealsTable`도 이미 `overflow-x-auto`(가로 스크롤) 패턴을 쓰므로 일관성 있음.
- 방식 B(대안) — 카드형 전환: `<640px`에서 각 area_stat을 표 대신 카드(구간 제목 + 전용/공급·평균가·건수·비율을 라벨-값 쌍)로 렌더. 가독성은 좋으나 데스크톱/모바일 두 벌 마크업 필요 → 이번 복원 범위에선 과함. **채택하지 않음(향후 사용성 이슈 제기되면 재검토).**

결론: **방식 A(가로 스크롤 + 첫 컬럼 sticky)** 로 구현한다.

---

## 7. 컴포넌트 분리 및 Props 시그니처 (개발팀 그대로 구현)

### 파일: `components/AptDetailModal.tsx` (신규)

```tsx
"use client";
import type { AptStat } from "@/lib/analyzer";

interface AptDetailModalProps {
  apt: AptStat;            // 표시할 단지(선택된 row). null이면 부모가 렌더 자체를 안 함
  onClose: () => void;     // ✕ / 오버레이 / ESC에서 호출
}

export default function AptDetailModal({ apt, onClose }: AptDetailModalProps) { ... }
```

- `AptDetailModal`은 **열림 여부를 스스로 판단하지 않는다.** 부모(`DealsTable`)가 `selected !== null`일 때만 이 컴포넌트를 마운트/언마운트한다(조건부 렌더). → ESC 리스너/스크롤 락을 mount/unmount 생명주기에 자연스럽게 묶을 수 있음.
- 내부에서 `formatPrice`(analyzer.ts)만 import해 사용. 추가 데이터 계산(퍼센트/막대 폭)은 이 컴포넌트 안에서 `apt.area_stats`로 수행.

### 파일: `components/DealsTable.tsx` (수정)

- 선택 상태 추가:
  ```tsx
  const [selected, setSelected] = useState<AptStat | null>(null);
  ```
- 건물명 버튼 `onClick={() => setSelected(row)}` (row 객체를 통째로 저장 — 이미 메모리에 있으므로 재조회 없음).
- 탭 전환 시 닫기: `useEffect(() => setSelected(null), [dealType]);`
- 렌더 말미(테이블 `</section>` 뒤 또는 컴포넌트 최상위 fragment 내):
  ```tsx
  {selected && (
    <AptDetailModal apt={selected} onClose={() => setSelected(null)} />
  )}
  ```
- `app/page.tsx`는 **수정 불필요**(`DealsTable`에 이미 `rows`, `dealType`을 넘기고 있음, page.tsx 159줄). 모달 상태는 전적으로 `DealsTable` 내부에서 관리.

### 왜 상태를 DealsTable에 두는가
- 클릭 트리거(건물명 버튼)와 데이터(row)가 모두 `DealsTable` 안에 있어, 상태를 페이지로 끌어올릴 필요가 없다(불필요한 prop drilling 방지). page.tsx는 변경 없이 유지 → 리스크 최소.

---

## 8. 개발 후 검수 체크리스트 (구현 완료 시 디자인팀이 확인)

- [ ] 건물명이 점선 밑줄 버튼으로 보이고, hover/포커스 링이 동작
- [ ] 모바일에서 건물명 버튼 터치영역 44px 이상
- [ ] 건물명 클릭 → 모달 오픈, 헤더 타이틀·meta가 §2 형식과 일치
- [ ] 표 5컬럼(평수구간/전용/공급/평균가/거래건수/비율) 순서·매핑 일치
- [ ] 전용/공급 셀 = `{공급}평 (전용{전용}평)` 형식
- [ ] 비율 막대 폭(maxCount 기준) + 퍼센트 텍스트(total 기준) 병기
- [ ] avg null인 구간에 `-` 표시
- [ ] area_stats 빈 단지 → "평수별 실거래 데이터가 없습니다" 한 줄
- [ ] ✕ / 오버레이 바깥 / ESC 모두 닫힘, 내부 클릭은 안 닫힘
- [ ] 모달 열린 동안 배경 스크롤 잠김, 닫으면 원복
- [ ] 매매↔전세 탭 전환 시 열린 모달 자동 닫힘
- [ ] 모바일에서 표 가로 스크롤 + 첫 컬럼 고정 동작
- [ ] 위치 분석(카카오) 영역이 **없음**(범위 밖)
- [ ] `role="dialog"`/`aria-modal`/`aria-labelledby` 부여, 열릴 때 포커스 이동

---

# 전체 복원: 위치·단지정보·주변시설 섹션 구성안

> 근거 문서: `docs/planning/apt-detail-full-restore.md`(2026-07-14 확정 기획안). 이 섹션은 위 §1~§8(평수별 표 = 이미 구현됨)을 **손대지 않고**, 평수별 표 **아래에** 3개 섹션(위치 → 단지정보 → 주변시설)을 추가하는 화면 구성안이다. 개발팀은 이 스펙만 보고 구현할 수 있어야 한다.
>
> 전제(기획안 §3·§6): **경사도/평지점수는 제외**(opentopodata 소스 불안정, ai-recommend와 일관). 주변시설 MVP는 **학교만**. 단지정보 용적률·건폐율·승강기는 후순위(null이면 행 숨김). 이는 마스터 확인 대기 항목(기획안 §6-1·§6-2)이며, 본 구성안은 "제외/학교만"을 전제로 그린다.

## 9. 섹션 순서와 모달 전체 골격

평수별 표는 그대로 최상단에 두고, 그 아래에 섹션을 **가벼운(외부의존 적은)→무거운 순**으로 쌓는다. 이 순서는 기획안 §5 단계(위치→단지정보→주변시설)와 동일하며, "빈약함 체감이 가장 크게 줄어드는 순서"이자 각 섹션이 독립 배포 가능한 순서이기도 하다.

```
┌──────────────────────────────────────────────┐  ← 오버레이(기존 그대로)
│  ┌────────────────────────────────────┐  ✕  │
│  │ 🏢 ○○아파트 — 평수별 실거래가        │      │  ← 헤더(기존 §2, 변경 없음)
│  │ 2005년 준공 · 21년차 · △△동 · …        │      │
│  ├────────────────────────────────────┤      │
│  │ [평수별 실거래가 표]  (기존 §3, 그대로) │      │  ← 섹션 0(기존)
│  ├──────────  구분선(hr)  ──────────────┤      │
│  │ 📍 위치            (섹션 A)            │      │  ← 신규 ①
│  │ 🚇 강남역 · 도보 350m                  │      │
│  │ 좌표 37.501, 127.026  [지도에서 보기 ↗] │      │
│  ├──────────  구분선(hr)  ──────────────┤      │
│  │ 🏘 단지 정보       (섹션 B)            │      │  ← 신규 ②
│  │ 세대수 1,204   동수 12   복도 계단식     │      │
│  │ 난방 지역난방  총주차 1,530대            │      │
│  │ 주소 서울 강남구 …                      │      │
│  ├──────────  구분선(hr)  ──────────────┤      │
│  │ 🏫 주변 시설       (섹션 C)            │      │  ← 신규 ③
│  │ 초등  ○○초 210m                        │      │
│  │ 중학  ○○중 640m                        │      │
│  │ 고교  ○○고 900m                        │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

### 공통 섹션 헤더/구분선 스타일
- 각 섹션 사이는 구분선: `<hr className="my-4 border-t border-gray-100" />` (기존 표 border 톤과 일치).
- 섹션 제목: `<h3>` 사용. **heading 레벨 규칙**: 모달 타이틀이 `<h2>`(id=`apt-detail-modal-title`)이므로 각 섹션 제목은 그 하위인 `<h3>`. 스타일 `text-sm font-bold text-brand-dark mb-2 flex items-center gap-1.5`.
  - 이모지(📍🏘🏫)는 장식이므로 `<span aria-hidden="true">`로 감싸고, 제목 텍스트("위치"/"단지 정보"/"주변 시설")는 스크린리더가 읽는다.
- 섹션 컨테이너: 별도 카드 배경 없이 여백만으로 구분(기존 모달이 표 외 배경장식을 안 쓰는 톤 유지). 강조가 필요한 값만 배지/색으로 처리.
- **색 병행 원칙**: 거리·상태를 색으로만 표현하지 않는다. 배지에는 항상 텍스트(예: "도보 350m", "정보 없음")를 함께 둔다(색맹/스크린리더 대응).

### 반응형(공통)
- 데스크톱(모달 max-w 560px): 라벨-값 그리드 2열(단지정보), 위치·주변시설은 항목당 1줄.
- 모바일(<640px): 모든 그리드 **1열**로 붕괴. 단지정보 grid는 `grid-cols-2 sm:grid-cols-2` → 좁으면 `grid-cols-1`로. 구체값은 각 섹션 참조.
- 세 섹션 추가로 모달 세로 길이가 늘어나므로 기존 `max-h-[85vh]/80vh + overflow-y-auto`(현재 코드 77줄)가 그대로 스크롤을 흡수한다 — 변경 불필요.

---

## 10. 섹션 A — 위치 (`/api/apt-location`)

기획안 §1-A. apt_geo 캐시 재활용, 경사도 제외. 표시 필드는 **역명·거리·좌표**뿐.

### 레이아웃/카피
```
📍 위치
🚇 강남역 · 도보 350m
좌표 37.5012, 127.0264   [지도에서 보기 ↗]
```
- 지하철 줄: `🚇 {subway_name} · 도보 {subway_dist}m`.
  - **미확인 규약(원본 계승, 기획안 §1-A)**: `subway_name === "-" || subway_dist >= 9999`이면 지하철 줄 대신 회색 텍스트 **"지하철 정보 없음"**. (색+텍스트 병행)
  - 거리 배지: `subway_dist`를 배지로 강조 가능 — `text-xs text-brand bg-[#eef] rounded px-1.5 py-0.5`. 단 값이 없을 땐 배지도 생략.
- 좌표 줄: `좌표 {lat.toFixed(4)}, {lng.toFixed(4)}` 회색 소형(`text-xs text-gray-500`).
  - **지도 링크**: 좌표가 있으면 `[지도에서 보기 ↗]` 텍스트 링크 — 카카오맵 URL(`https://map.kakao.com/link/map/{name},{lat},{lng}`) 새 탭. `<a target="_blank" rel="noopener noreferrer">` + `aria-label="{name} 위치 카카오맵에서 새 탭으로 열기"`. 지도 임베드(iframe)는 이번 범위 밖 — 텍스트 좌표 + 외부 링크로만.
  - 좌표 자체가 없으면(캐시 미스+라이브 실패) 좌표 줄 전체 생략.

### 상태 (기획안 §4 규약)
- **로딩**: 섹션 A는 apt_geo 캐시 히트가 대부분이라 가장 빨리 도착. 스켈레톤은 지하철 줄 1개 폭의 회색 바(`h-4 w-40 bg-gray-100 rounded animate-pulse`) + 스크린리더용 `<span className="sr-only">위치 정보 불러오는 중</span>`. 섹션 제목 `📍 위치`는 로딩 중에도 즉시 표시(자리 확정).
- **빈(없음)**: 응답이 왔지만 subway·좌표 모두 미확인 → 섹션 제목 아래 "위치 정보를 찾을 수 없습니다"(회색). 섹션 자체를 숨기지는 않는다(자리 유지가 덜 혼란스러움).
- **에러**: fetch 실패/타임아웃 → "위치 정보를 불러오지 못했습니다" + `[다시 시도]` 텍스트 버튼(해당 섹션만 재fetch). **다른 두 섹션 렌더를 막지 않는다**(독립 로딩).

---

## 11. 섹션 B — 단지 정보 (`/api/apt-info`)

기획안 §1-B. MVP 6필드(세대수·동수·복도·난방·총주차·주소), 후순위(용적률·건폐율·승강기·세대당승강기)는 값 있으면 표시·없으면 행 숨김.

### 레이아웃 — 라벨-값 그리드 (권고)
데스크톱 2열 grid, 모바일 1열:
```
🏘 단지 정보
┌───────────────┬───────────────┐
│ 세대수  1,204세대 │ 동수    12개동  │
│ 복도    계단식    │ 난방    지역난방 │
│ 총주차  1,530대   │ (용적률 220%)   │  ← 후순위: 있을 때만
│ 주소  서울 강남구 …(전체폭 span)     │
└───────────────┴───────────────┘
```
- 컨테이너: `grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm`.
- 각 항목: `<div className="flex gap-2">` 안에 라벨 `<dt className="text-gray-500 shrink-0 w-16">`, 값 `<dd className="font-medium text-gray-800">`. **`<dl>`(정의 목록) 시맨틱 사용** 권고 — 스크린리더가 라벨-값 쌍으로 읽음. (grid를 `<dl>`에, 각 쌍을 `<div>`로 묶고 내부에 `<dt>/<dd>`.)
- **주소**는 값이 길므로 grid 마지막에 `sm:col-span-2`(전체폭) 항목으로. 헤더 meta에 이미 dong이 있으나 여기선 도로명 전체주소(`addr`)로 보강(기획안: 헤더 보강 목적).
- 값 포맷: 세대수/주차는 천단위 콤마(`toLocaleString`). 단위 접미(세대/개동/대)는 값 컴포넌트에서 붙임.
- **후순위 필드(용적률 far_ratio·건폐율 cov_ratio·승강기 elev_pass·세대당승강기 elev_per_hh)**: 값이 `null`이면 해당 `<div>` 쌍 자체를 렌더하지 않음(빈 라벨 노출 금지). MVP 6필드도 개별 null이면 같은 규칙으로 행 숨김 — 단, 모두 null이면 섹션 빈 상태(아래)로.

### 상태 (기획안 §4·§5-2단계)
- **로딩**: 가장 느릴 수 있는 섹션(콜드 시 MOLIT 구목록 로드). grid 자리에 2~4줄 스켈레톤(`h-4 bg-gray-100 rounded animate-pulse` 반복) + `<span className="sr-only">단지 정보 불러오는 중</span>`. 이 섹션이 느려도 A/C는 이미 렌더됨(독립).
- **빈(found:false)**: 원본 `{found:false}` 계승. "단지 상세 정보가 등록되어 있지 않습니다"(회색). kaptCode 매칭 실패 단지가 여기 해당.
- **부분(partial)**: 일부 필드만 온 경우 온 것만 표시(null 행 숨김 규칙으로 자연 처리).
- **에러/타임아웃**: "단지 정보를 불러오지 못했습니다" + `[다시 시도]`. 콜드 타임아웃 시 서버가 partial/`{found:false}`를 반환하도록 기획됨(§5) → 프론트는 이를 빈 상태로 렌더.

---

## 12. 섹션 C — 주변 시설 (`/api/apt-nearby`)

기획안 §1-C. **MVP=학교(초/중/고)만.** 병원·편의시설·어린이집은 2차(후순위) — 이번 구성안은 학교만 그린다. 응답 payload에 후순위 키가 와도 이번 UI는 학교만 렌더(2차 때 이 섹션에 행 추가).

### 레이아웃 — 아이콘/뱃지 행
```
🏫 주변 시설
┌──────────────────────────────┐
│ [초] ○○초등학교        210m   │
│ [중] △△중학교          640m   │
│ [고] □□고등학교        900m   │
└──────────────────────────────┘
```
- 각 학교급 1줄: `<li className="flex items-center gap-2 py-1 text-sm">`.
  - **학교급 뱃지**: `초/중/고` 텍스트 뱃지 — `text-[0.7rem] font-bold text-brand bg-[#eef] rounded px-1.5 py-0.5 shrink-0`. (색만이 아니라 "초/중/고" 글자로 구분 → 접근성 OK)
  - 학교명: `flex-1 truncate text-gray-800`.
  - 거리: `text-xs text-gray-500 shrink-0` 우측 정렬 — `{distance}m`.
- 원본은 급별 배열 `[{name,distance}]`이나 MVP 표시는 **각 급 최근접 1개**(기획안 §1-C: "각 최근접 1~2개"). 1개 기본, 여유 시 2개까지. 목록은 `<ul>`로 감싸 스크린리더가 개수 인지.
- **없음 규약(기획안 §1-C)**: 특정 급이 반경 1km 내 없으면 그 줄에 급 뱃지 + "반경 1km 내 없음"(회색). 세 급 모두 없으면 섹션 빈 상태(아래).

### 상태 (기획안 §4·§5-3단계)
- **로딩**: 카카오 학교 검색. 원본 "학교·병원 검색 중…" 스피너 계승 → "주변 학교 찾는 중…" + 스피너/스켈레톤 3줄 + `<span className="sr-only">주변 시설 불러오는 중</span>`. A/B와 독립.
- **빈**: 세 급 모두 결과 0 → "반경 1km 내 학교 정보가 없습니다"(회색).
- **에러**: "주변 시설을 불러오지 못했습니다" + `[다시 시도]`.

---

## 13. 상태 처리 방식 — 3섹션 독립 로딩(공통 규약)

원본은 모달 열릴 때 3개를 **병렬 lazy fetch**했고(기획안 §4), 신 구조도 이를 계승한다. 핵심: **한 섹션이 느리거나 실패해도 나머지는 각자 렌더**(부분 성공).

- 각 섹션은 자체 상태(`loading | ok | empty | error`)를 독립적으로 가진다. 세 섹션의 상태를 하나의 로딩 게이트로 묶지 말 것(가장 느린 섹션이 전체를 볼모로 잡음 — 기획안 §4).
- **로딩 스켈레톤 일관성**: 기존 area_stats 빈 상태(회색·중앙정렬 "…없습니다")와 톤 통일. 로딩은 `animate-pulse` 회색 바, 빈/에러는 회색 텍스트. 새 색/톤 도입 금지(기존 팔레트: 브랜드남색 `text-brand-dark`, 배지 `bg-[#eef]/text-brand`, 예산 하이라이트 연초록 `#e8f5e9`는 표 전용이므로 신규 섹션엔 쓰지 않음).
- **에러 재시도**: 각 섹션 `[다시 시도]`는 그 섹션 fetch만 재호출(다른 섹션 상태 유지).
- **스크린리더 라이브 안내**: 세 섹션을 감싸는 영역에 `aria-live="polite"`를 두어 "위치 정보 로딩 완료" 등 도착을 부드럽게 알릴 수 있음(선택). 최소한 각 로딩 상태에 `sr-only` 텍스트를 둔다(위 각 섹션 명시).
- **fetch 시점**: 모달 마운트 시 `useEffect`에서 3개 병렬 시작(현 모달은 apt만으로 즉시 렌더되므로, 3 fetch는 추가 로딩일 뿐 평수별 표 렌더를 지연시키지 않음).

---

## 14. 개발팀 인터페이스 노트 — Props 확장 & API 계약

기획안 §4·§6-5 반영. **현재 모달은 `apt: AptStat`만 받아 lawd_cd·gu가 없다** → 세 API가 캐시 자연키(`lawd_cd, name, dong`)·행정구를 요구하므로 props 확장이 **필수**.

### 14-1. AptDetailModal 새 props
```tsx
interface AptDetailModalProps {
  apt: AptStat;
  onClose: () => void;
  budgetMax?: number;      // 기존 유지
  lawd_cd: string;         // ★신규 필수 — 시군구코드 5자리(캐시 자연키·API 쿼리)
  gu: string;              // ★신규 필수 — 행정구명(카카오/MOLIT 조회 보조, 원본 gu 파라미터)
}
```
- `apt.name`·`apt.dong`은 이미 있으므로 API 쿼리키(name/dong)는 apt에서 취한다. lawd_cd·gu만 새로 내려주면 됨.
- **배선(기획안 §6-5)**: `DealsTable`은 현재 선택 lawd_cd·gu를 보유(대시보드 필터) → 모달 렌더 지점(`{selected && <AptDetailModal ... />}`)에 `lawd_cd={...} gu={...}` 추가. 추천 카드 경로(RecommendItem)도 요청 파라미터로 두 값 보유 → 양쪽 다 전달 가능. **page.tsx→DealsTable prop 경로 확인 필요**(현재 DealsTable이 lawd_cd·gu를 이미 prop으로 받는지 개발팀 확인; 없으면 page에서 내려야 함).
- budgetMax처럼 optional로 두지 말 것 — 이 값이 없으면 세 섹션이 동작 불가하므로 **필수 prop**. (단, 값이 빈 문자열이면 각 섹션은 즉시 "정보 없음"으로 폴백해 크래시 없이 처리.)

### 14-2. 세 API 계약(프론트가 호출할 형태 — 서버 구현은 개발팀)
공통 쿼리: `?lawd_cd={lawd_cd}&gu={gu}&name={apt.name}&dong={apt.dong}`. 세 라우트 모두 `GET`, `runtime=nodejs`, `dynamic=force-dynamic`(기획안 §4). 캐시-우선+라이브 폴백은 서버 책임.

| 섹션 | 엔드포인트 | 프론트가 읽는 응답 필드(최소) | 없음/실패 표현 |
|---|---|---|---|
| A 위치 | `/api/apt-location` | `{ subway_name, subway_dist, lat, lng }` | `subway_name:"-"`/`subway_dist>=9999`/`lat==null` |
| B 단지정보 | `/api/apt-info` | `{ found, households, buildings, hallway, heating, park_total, addr, far_ratio?, cov_ratio?, elev_pass?, elev_per_hh? }` | `found:false` 또는 필드 null |
| C 주변시설 | `/api/apt-nearby` | `{ elementary:[{name,distance}], middle:[...], high:[...] }` (후순위 키는 무시) | 빈 배열 |

- 프론트는 위 필드명 그대로 소비한다(원본 응답 형태 계승, 기획안 §2 payload 형태). 서버가 필드명을 바꾸면 이 표를 갱신할 것.
- 후순위 필드(far/cov/elev, 병원·편의시설)는 응답에 있으면 저장만 하고 **이번 UI는 학교·MVP6만 렌더**. 2차에서 §11·§12에 행 추가.

---

## 15. 개발 후 검수 체크리스트 (3섹션 추가분)

- [ ] 평수별 표 **아래에** 위치→단지정보→주변시설 순서로 배치, 각 사이 `<hr>` 구분선
- [ ] 각 섹션 제목이 `<h3>`(모달 h2 하위), 이모지는 `aria-hidden`, 텍스트 라벨 존재
- [ ] 위치: `🚇 역명 · 도보 Nm`, 미확인 시 "지하철 정보 없음"(색+텍스트), 좌표+카카오맵 링크(새 탭·rel=noopener)
- [ ] 단지정보: 세대수/동수/복도/난방/총주차/주소 라벨-값(`<dl>`), null 필드 행 숨김, 후순위(용적률 등)는 값 있을 때만
- [ ] 주변시설: 초/중/고 뱃지(글자로 구분)+학교명+거리, 없는 급 "반경 1km 내 없음"
- [ ] 3섹션 **독립 로딩** — 하나 느려도/실패해도 나머지 먼저 표시, 섹션별 `[다시 시도]`
- [ ] 각 섹션 로딩/빈/에러 상태가 §10~§13대로, 로딩에 `sr-only` 안내 텍스트
- [ ] 로딩=회색 pulse, 빈/에러=회색 텍스트 — 기존 area_stats 빈 상태 톤과 일관, 신규 색 미도입
- [ ] 모바일에서 단지정보 grid 1열 붕괴, 모달 세로 스크롤로 3섹션 흡수
- [ ] AptDetailModal이 `lawd_cd`·`gu` props 수신, 세 API를 공통 쿼리로 호출
- [ ] 기존 접근성(role=dialog/aria-modal/ESC/포커스트랩/스크롤락) **그대로 유지**(3섹션 추가로 깨지지 않음)
