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
