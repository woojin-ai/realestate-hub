// 한국 시간(KST) 기준 날짜/월 유틸.
//
// 왜 필요한가: 이 서비스는 한국 부동산 실거래가 대시보드이고, "오늘 이미 수집했나?"
// (하루 경계)와 "지금이 몇 월인가?"(월 경계) 같은 판정의 기준은 사용자가 체감하는
// 00:00 KST여야 한다. 그런데 서버(Vercel 서버리스)의 프로세스 타임존은 UTC이고
// (vercel.json·코드 어디에도 TZ 설정이 없다), DB에 적재되는 시각도
// `new Date().toISOString()`(UTC 순간값)이라, 아무 변환 없이 쓰면 두 경계가 모두
// 09:00 KST에 걸린다.
//
// ⚠️ 두 경계는 **함께** 움직여야 한다(2026-07-20 라운드 31 QA에서 확인된 사고):
// 하루 경계만 00:00 KST로 옮기고 월 경계를 09:00 KST에 두면, 매월 1일 01:00 KST
// 크론이 "전월"을 최신월로 수집해 놓고 `status=ready`를 찍은 뒤, 같은 날 09:00 KST에
// 월이 롤오버되면서 최신월이 "당월"로 바뀐다. 이때 하루 경계 기준으로는 여전히
// "오늘 수집함"이라 캐시가 신선하다고 판정돼, **수집된 적 없는 당월을 DB에서 빈 값으로
// 서빙**하고 다음날 00:00 KST까지 약 15시간 지속된다(두 경계가 09:00 KST로 정렬돼
// 있던 수정 전에는 신선도 불일치로 라이브 폴백해 자가 치유됐다).
//
// 그래서 이 모듈이 **날짜·월 경계의 유일한 기준**이다. 하루 경계는 toKstDateString,
// 월 경계는 getKstYm 하나만 쓰고, 다른 곳에서 `new Date()`의 getMonth()/getFullYear()나
// `toISOString().slice()`로 경계를 다시 계산하지 않는다.
// (현재 소비처: app/api/data/route.ts, app/api/cron/prewarm/route.ts,
//  lib/molit-api.ts getYmList, lib/analyzer.ts getMonthKey)

/**
 * KST(UTC+9) 오프셋(ms).
 *
 * 한국(Asia/Seoul)은 현재 서머타임을 시행하지 않으며 연중 항상 UTC+9로 고정이다.
 * 그래서 "+9시간 더한 뒤 UTC 달력값을 읽는" 단순 산술만으로 KST 달력 날짜가 정확히
 * 나온다. `toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })` 방식은 런타임의
 * ICU 빌드(full-icu 여부)에 따라 출력 포맷이 달라질 수 있어 쓰지 않는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 입력 시점을 KST만큼 밀어놓은 `Date`를 만든다(내부 전용).
 * 이렇게 민 `Date`의 **UTC 게터**(getUTCFullYear 등)를 읽으면 KST 달력값이 된다.
 * 로컬 게터(getFullYear 등)는 프로세스 TZ에 좌우되므로 절대 쓰지 않는다.
 *
 * @returns 파싱 불가능한 입력이면 `null`.
 */
function toKstShifted(instant?: Date | string): Date | null {
  const date =
    instant === undefined
      ? new Date()
      : instant instanceof Date
        ? instant
        : new Date(instant);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + KST_OFFSET_MS);
}

/**
 * UTC 순간값을 KST 기준 달력 날짜 문자열(`YYYY-MM-DD`)로 변환한다. **하루 경계 기준.**
 *
 * @param instant 변환할 시점. `Date` 또는 `Date`가 파싱할 수 있는 문자열
 *   (예: Supabase `timestamptz` 컬럼이 PostgREST를 통해 돌려주는
 *   `"2026-07-17T17:47:25.497+00:00"` — 밀리초 3자리 + `+00:00` 오프셋 형식).
 *   생략하면 현재 시각.
 * @returns KST 기준 `YYYY-MM-DD`. `instant`가 파싱 불가능하면 빈 문자열 `""`을
 *   반환한다(throw하지 않음) — 호출부에서 유효한 날짜 문자열과 비교하면 항상
 *   불일치가 되어 "신선하지 않음/오래됨" 쪽으로 안전하게 떨어진다. 단, 파싱 불가능한
 *   값 둘을 서로 비교하면 `"" === ""`로 같아지므로, 비교의 한쪽은 반드시 유효한
 *   시점(예: 인자 없이 호출한 현재 시각)이어야 한다.
 *
 * @example
 * // UTC로는 2026-07-19지만 KST로는 이미 2026-07-20인 시점
 * toKstDateString("2026-07-19T15:30:00Z"); // "2026-07-20"
 */
export function toKstDateString(instant?: Date | string): string {
  const shifted = toKstShifted(instant);
  if (shifted === null) return "";
  return shifted.toISOString().slice(0, 10);
}

/**
 * KST 기준으로 `monthsAgo`개월 전의 `YYYYMM`을 반환한다. **월 경계 기준.**
 *
 * 연·월을 정수 하나(`year * 12 + month`)로 접어서 빼기 때문에, `Date.prototype.setMonth`
 * 로 개월을 빼던 기존 방식의 **말일 롤오버 버그가 구조적으로 발생하지 않는다**. (기존
 * `getMonthKey`는 2026-07-31에 offset=1을 주면 6월 31일 → 7월 1일로 넘어가 `202607`을
 * 돌려줬다. 즉 매월 29~31일에 "전월 대비"가 당월과 자기 자신을 비교했다.)
 *
 * @param monthsAgo 몇 개월 전인지(0 = 이번 달). 음수를 주면 미래 월.
 * @param instant 기준 시점. 생략하면 현재 시각. (테스트/재현용으로만 넘긴다.)
 * @throws {RangeError} `instant`가 파싱 불가능한 경우. toKstDateString과 달리 빈 문자열
 *   같은 안전한 sentinel로 물러설 수 없다 — `YYYYMM`은 곧바로 API 조회 대상 월과 DB
 *   조회 키로 쓰이므로, 잘못된 값을 조용히 흘리면 엉뚱한 달을 수집·서빙하게 된다.
 *
 * @example
 * // UTC로는 아직 2026-07-31이지만 KST로는 이미 2026-08-01인 시점
 * getKstYm(0, "2026-07-31T15:00:00Z"); // "202608"
 * getKstYm(1, "2026-07-31T15:00:00Z"); // "202607"
 */
export function getKstYm(monthsAgo = 0, instant?: Date | string): string {
  const shifted = toKstShifted(instant);
  if (shifted === null) {
    throw new RangeError(`getKstYm: 파싱할 수 없는 시점입니다: ${String(instant)}`);
  }
  // KST로 민 Date에서 **UTC 게터**로 달력 연/월을 읽는다(프로세스 TZ 무관).
  const totalMonths =
    shifted.getUTCFullYear() * 12 + shifted.getUTCMonth() - monthsAgo;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12 + 1; // 1~12 (음수 나머지 걱정 없이 복원)
  return `${year}${String(month).padStart(2, "0")}`;
}
