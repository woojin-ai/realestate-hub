// 야간 프리워밍(Vercel Cron) — 새벽 1시(KST)에 대시보드 데이터(deals/monthly_stats)를
// 전국 지역에 대해 미리 채워, 사용자가 낮에 처음 조회하는 지역/단지도 콜드스타트 없이
// 빠르게 뜨도록 한다(2026-07-15 사용자 요청: "새벽 1시에 싹 불러와 놓고 하루종일 보여주면").
//
// 범위(이번 라운드): 대시보드 조회(/api/data)와 동일한 매매/전세/월세 deals + monthly_stats
// 만 프리워밍한다. 아파트 매매/전세만 조회하는 것이 아니라 building_type="아파트" 고정으로
// 진행한다(빌라/단독까지 프리워밍하면 지역 수×3배로 예산이 부족해짐 — 다음 라운드 검토 대상).
// 상세모달 캐시(apt_geo/apt_info/apt_nearby)는 단지 수가 지역당 수십~수백개로 훨씬 방대해
// 이번 라운드 범위 밖이다(명시적으로 제외 — docs/team-log/2026-07-15.md 참고).
//
// vercel.json의 크론 스케줄(0 16 * * * UTC = 01:00 KST)이 이 라우트를 GET으로 호출한다.
// Vercel Cron은 CRON_SECRET 환경변수가 설정돼 있으면 Authorization: Bearer $CRON_SECRET
// 헤더를 자동으로 붙여 보낸다 — 그 값을 검증해 외부에서 함부로 트리거하지 못하게 막는다.
// (수동 curl 테스트 시엔 ?secret=... 쿼리로도 인증 가능.)
//
// 서버리스 실행시간 제한을 고려해 한 번의 호출로 전체 지역(약 110여개)을 다 처리하지 않고,
// 시간예산(TIME_BUDGET_MS) 안에서 처리 가능한 만큼만 진행 후 "다음에 이어서 처리할 인덱스"를
// prewarm_progress 테이블(단일 행)에 저장한다. 다음날 크론 실행 때 그 인덱스부터 이어간다.
// 이미 오늘 신선하게 채워진 지역(fetch_cache_status 기준)은 현재월 1개월만 갱신하면 되므로
// 매우 빠르게 스킵/완료되고, 콜드 지역(13개월 전체 미수집)만 상대적으로 느리다 — 즉 한 바퀴를
// 다 돌고 나면(며칠 걸릴 수 있음) 이후로는 매일 대부분 지역이 "현재월만 갱신"이라 훨씬 빨라진다.
//
// 2026-07-15 추가 수정: 콜드 지역 하나가 시간예산을 넘겨 중간에 끊기더라도(incomplete),
// 지역 "내부"에서 CONCURRENCY 배치가 끝날 때마다 그때까지 확보한 개월 수를
// fetch_cache_status.months_collected에 즉시 반영한다(prewarmRegion 참고). 그래서 같은
// 지역이 여러 번 크론을 거쳐도 매번 0개월부터 재시작하지 않고, 이미 저장된 개월은 건너뛰고
// 나머지만 채워 결국 완료된다. 지역이 완전히 끝난 경우에만 prewarm_progress.last_index를
// 다음 지역으로 전진시키고, 부분 진행이면 인덱스를 그대로 둬 다음 실행이 이어받는다.
//
// 2026-07-28 수정 (W1, docs/planning/monthly-stats-backfill-2026-07-28.md §2-1):
// monthly_stats에 724셀(기대 114지역 × 13개월 × 2유형 = 2,964 대비)이 비어 있던 사고의
// **원인 두 겹이 모두 이 파일에 있었다.** 두 원인은 독립이라 한쪽만 고치면 다른 쪽으로 샌다.
//   (원인 1) 입력이 좁다 — allData에는 "그 실행에서 실제로 fetch한 달"만 담겼다. 13개월이
//     이미 수집된 지역은 최신월 1개만 fetch하므로 stats도 그 1행만 갱신됐다. 창은 매달
//     미끄러지는데 지역 재방문 주기는 약 38라운드(114÷3)라, 그 사이 새로 창에 들어온 달은
//     deals에만 남고 stats 행이 영영 안 생겼다. → W1-b가 고친다.
//   (원인 2) 쓰기가 과잉 게이팅돼 있다 — stats write가 `if (!incomplete && !anyFailed)`
//     블록 안에 있어서, 콜드 지역이 시간예산으로 여러 실행에 쪼개져 수집되면 그 중간 달들의
//     stats는 "완전 무결한 실행"을 한 번도 만나지 못해 영영 안 써졌다. → W1-a가 고친다.
// 두 수정 모두 새 설계가 아니라 **/api/data(app/api/data/route.ts:126-133, 205-213)의
// 선례 이식**이다. 그쪽은 처음부터 (i) DB 캐시 히트분까지 전부 allData에 담고 (ii) stats
// 쓰기를 incomplete류 게이트에 묶지 않아(게이팅되는 건 fetch_cache_status의 ready 마킹뿐)
// "사용자가 실제로 조회한 지역"은 창 전체 stats가 자동 복구돼 왔다. 결측이 "아무도 조회
// 안 하고 프리워밍만 스친 지역"에만 남아 있던 이유가 이것이다. 리뷰 기준도 "/api/data와
// 같은가"로 두면 된다. 이미 생겨버린 724셀의 1회성 복구는 별도 라우트가 맡는다
// (app/api/admin/backfill-monthly-stats/route.ts, 수동 전용).
//
// 2026-08-04 수정 (순수 관측성 — 동작 파라미터·제어 흐름 변경 없음):
// 지역 루프의 catch가 processed에 아무것도 넣지 않는데 count는 늘고 idx는 전진해서,
// **실패한 지역이 HTTP 응답에서 완전히 사라지고 있었다.** 실측(2026-08-04 라운드):
//   • 이번 실행: nextIndex 106 → 112(6칸 전진)인데 processedCount:3. 응답에 남은 것은
//     울산 남구(31140)·동구(31170)·북구(31200) = 인덱스 109·110·111뿐.
//     → 인덱스 106 광주 북구(29170) · 107 광주 광산구(29200) · 108 울산 중구(31110)가
//       조용히 실패했다. 울산 중구는 deals 4,310행을 가진 정상 지역이라 "빈 데이터 탓"도 아니다.
//   • 직후 대조 실행: nextIndex 112 → 1, processedCount:3(울주군·세종·종로구) — 전진칸수와
//     processedCount가 정확히 일치. 즉 정상 실행에는 갭이 없고, **갭 = 조용한 실패 건수**다.
// 파급이 큰 이유: 지역 순회 주기가 114÷3 ≈ 38라운드다. 조용히 실패한 지역은 다음 기회까지
// 약 38라운드를 기다리는데 그 사이 아무도 실패를 모른다. 이 프로젝트는 이미 "조용한 실패"로
// 두 번 사고를 겪었다(2026-07-28 monthly_stats 724셀 결측, 2026-08-01 루틴 전면 정지 이틀).
// 이번 라운드에서 고치는 것은 **관측성뿐**이다 — 광주 북구·광산구·울산 중구가 왜 throw했는지는
// 아직 모른다(Vercel 함수 로그 접근이 없어 이 라운드에서 판별 불가). 원인을 추측해서 "고치는"
// 대신, 다음번에 같은 일이 나면 **원인이 응답에 그대로 드러나게** 만드는 것이 이 수정의 목표다.
// 구체적으로: failed[] 배열 + failedCount/attemptedCount 요약 카운터 + unknown→안전한 문자열
// 변환(toSafeErrorMessage). 상세 근거는 각 지점 주석에 있다.

import { NextResponse, type NextRequest } from "next/server";
import { REGION_CODES } from "@/lib/regions";
import { collectMonth, getYmList, type MonthData } from "@/lib/molit-api";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  dedupeMonthData,
  getCacheStatus,
  loadMonthFromDb,
  upsertCacheStatus,
  upsertMonthDeals,
  upsertMonthlyStats,
  type FetchCacheStatusRow,
} from "@/lib/db-cache";
import {
  findMissingStatsMonths,
  indexStatsCells,
  loadMonthlyStatsCells,
} from "@/lib/monthly-stats-gaps";
import type { AllData } from "@/lib/analyzer";
import { toKstDateString } from "@/lib/kst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Cron 함수 최대 실행시간(플랜별 상한 이하로). 내부 시간예산은 이보다 여유를 두고 짧게 잡는다.
export const maxDuration = 60;

const MONTHS = 13; // 대시보드(/api/data) 기본 수집 범위와 동일
// 2026-07-15 504 사고 대응: 기존 50_000ms은 지역 루프 "바깥"에서만 체크되고 있었고,
// 지역 하나(콜드 지역, 13개월 × CONCURRENCY=3 배치)가 예산 근처에서 시작되면 그 지역
// 내부(월별 국토부 API 배치)는 체크 없이 끝까지 돌아 60s 하드리밋을 넘겨버렸다.
// 아래 조치와 함께(지역 내부 배치 사이 체크 추가 + 국토부 API 개별 타임아웃 8s로 단축)
// 예산 자체도 60s 하드리밋 대비 훨씬 보수적으로(25s) 낮춰 이중 안전장치를 둔다.
const TIME_BUDGET_MS = 25_000;
// 한 번의 호출에서 시도할 지역 수 상한(시간예산과 별개의 추가 안전장치) — 신선 지역이 몰려
// 있어 시간예산이 금방 안 차더라도, 무한정 많은 지역을 한 호출에서 처리하지 않도록 막는다.
const MAX_REGIONS_PER_RUN = 20;
const CONCURRENCY = 3; // 월별 국토부 API 병렬 배치(기존 라우트들과 동일한 값)
const BUILDING_TYPE = "아파트" as const;
const EMPTY_MONTH: MonthData = { 매매: [], 전세: [], 월세: [] };

interface RegionEntry {
  sido: string;
  gu: string;
  lawdCd: string;
}

// lib/regions.ts REGION_CODES를 순서 그대로 평탄화(시/도 → 구 삽입 순서 보존, 정렬하지 않음).
function buildRegionList(): RegionEntry[] {
  const list: RegionEntry[] = [];
  for (const [sido, info] of Object.entries(REGION_CODES)) {
    for (const [gu, code] of Object.entries(info.구)) {
      list.push({ sido, gu, lawdCd: code });
    }
  }
  return list;
}

// CRON_SECRET 미설정 시 항상 거부(안전 기본값) — Vercel Cron 헤더 또는 수동 쿼리 파라미터로 인증.
function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  const queryKey = request.nextUrl.searchParams.get("secret");
  return queryKey === secret;
}

// ── 실패를 응답에 싣기 위한 에러 요약 (2026-08-04) ─────────────────────────────────
// 🔴 시크릿 유출 방어가 이 두 함수의 존재 이유 절반이다.
//   lib/molit-api.ts:158-166은 serviceKey를 URL 문자열에 **직접 보간**해 fetch한다(이중인코딩
//   방지 목적, 그 파일 상단 주석 참고). 즉 요청 URL 자체가 시크릿이고, 런타임/라이브러리
//   버전에 따라 에러 메시지나 cause에 요청 URL이 섞여 나올 수 있다. 이 라우트 응답은
//   CRON_SECRET 뒤에 있지만, 응답은 로그 수집기·모니터링·스크린샷으로 쉽게 재유통되므로
//   "인증 뒤라서 괜찮다"에 기대지 않고 값 단위로 마스킹한다.
//   allowlist가 아니라 denylist인 이유: 응답에 담을 텍스트는 우리가 만든 문자열이 아니라
//   외부 라이브러리가 만든 문장이라 화이트리스트로 통과시킬 수가 없다. 대신 아래 키 이름이
//   보이면 그 값을 무조건 지운다 — 새 파라미터가 생겨도 최소한 기존 키는 계속 막힌다.
const SECRET_PARAM_PATTERN =
  /((?:serviceKey|apikey|api_key|key|token|secret|password|pwd|authorization|auth)=)[^&\s"']+/gi;
const BEARER_PATTERN = /(Bearer\s+)[\w.~+/-]+=*/gi;
// 응답 크기 상한. 스택은 애초에 담지 않지만, undici처럼 message가 길게 늘어지는 경우가 있어
// 지역 20개분(MAX_REGIONS_PER_RUN)이 전부 실패해도 응답이 감당 가능한 크기로 유지되게 자른다.
const MAX_ERROR_MESSAGE_LENGTH = 300;

function sanitizeErrorText(text: string): string {
  const masked = text
    .replace(SECRET_PARAM_PATTERN, "$1[REDACTED]")
    .replace(BEARER_PATTERN, "$1[REDACTED]");
  // 개행/연속 공백을 한 칸으로 접는다 — 응답을 한 줄로 훑어 읽는 용도이고, 여기에 개행이
  // 남아 있으면 "스택을 담지 않는다"는 규칙이 지켜졌는지 눈으로 판정하기 어려워진다.
  const collapsed = masked.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${collapsed.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…(생략)`
    : collapsed;
}

/**
 * unknown 예외를 응답에 넣어도 되는 한 줄 문자열로 바꾼다(message 수준 요약, 스택 없음).
 *
 * 변환 규칙 = 우선순위 순서:
 *   1) Error → `name: message` (name이 "Error"면 message만). AbortError(타임아웃)와
 *      TypeError(네트워크)의 구분이 원인 추적에 결정적이라 name을 버리지 않는다.
 *   2) Error.cause 한 겹만 덧붙인다 — undici fetch 실패는 message가 언제나 "fetch failed"라서
 *      그것만 담으면 응답에 실패가 보이기만 하고 원인은 여전히 모른다. 실제 원인
 *      (ETIMEDOUT/ENOTFOUND/ECONNRESET/socket hang up 등)은 cause에 있다. 두 겹 이상은
 *      따라가지 않는다(길이만 늘고 얻는 정보가 급감).
 *   3) 문자열, 그리고 `{ message: string }` 모양 객체 → 그 문자열.
 *      (Supabase PostgrestError가 Error 인스턴스가 아닌 이 모양이다. 이 라우트에서 가장
 *       흔할 후보라 명시적으로 처리한다. code/details/hint는 담지 않는다 — details에 쿼리
 *       조각이 실려 오는 경우가 있어 message 수준으로만 요약한다는 원칙을 지킨다.)
 *   4) 그 외 → `[비Error 예외: <typeof>]`.
 *      ⚠️ 여기서 String(err)/JSON.stringify(err)를 쓰지 않는 것이 의도다. 저장소 다른 곳의
 *      `err instanceof Error ? err.message : String(err)` 관례(app/api/admin/*)와 갈리는
 *      지점인데, 그 라우트들은 수동 전용이고 이 라우트는 시크릿을 보간한 URL로 외부 API를
 *      때리는 경로다. 정체 불명의 객체를 통째로 문자열화하면 설정값·헤더·URL이 그대로
 *      응답에 실릴 수 있어, 여기서는 타입 이름만 남기고 버린다(원인 추적에 필요한 실제
 *      정보는 1~3에서 이미 잡힌다. 4로 떨어졌다는 사실 자체가 조사 단서다).
 */
function toSafeErrorMessage(err: unknown): string {
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message);
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
      parts.push(`cause: ${cause.name}: ${cause.message}`);
    } else if (typeof cause === "string") {
      parts.push(`cause: ${cause}`);
    }
  } else if (typeof err === "string") {
    parts.push(err);
  } else if (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    parts.push((err as { message: string }).message);
  } else {
    parts.push(`[비Error 예외: ${typeof err}]`);
  }
  // message가 빈 문자열인 Error도 실제로 있다(throw new Error()). 그때 failed[].error가
  // ""가 되면 "실패는 있는데 아무 말도 없는" 상태가 되어 이 수정의 목적이 반쯤 무너지므로,
  // 최소한 "빈 메시지였다"는 사실은 남긴다.
  const joined = parts.filter((part) => part.length > 0).join(" / ");
  return sanitizeErrorText(joined) || "[빈 에러 메시지]";
}

/**
 * 지역 하나(lawdCd)의 대시보드 데이터를 프리워밍한다.
 * /api/data(app/api/data/route.ts)의 캐시-우선 로직과 동일한 기준(fetch_cache_status)으로
 * "이미 오늘 신선한지"를 판단해, 신선하지 않은 개월만 국토부 API로 채우고 deals/monthly_stats/
 * fetch_cache_status를 upsert한다.
 *
 * 2026-07-28(W1-b)부터는 읽기도 한다 — 예전 주석의 "프리워밍은 쓰기 전용"은 더 이상 맞지 않다.
 * 창 안인데 monthly_stats 행이 없는 달을 deals에서 되읽어 집계 입력에 합류시킨다(원인 1 수정).
 */
async function prewarmRegion(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  lawdCd: string,
  deadline: number
): Promise<{
  fetchedMonths: number;
  incomplete: boolean;
  monthsCollected: number;
  /** W1-b가 DB에서 되읽어 집계 입력에 합류시킨 달 수(정상 상태면 0이 된다). */
  statsGapMonths: number;
  /** W1-b 대상이었으나 deals가 0행이라 건너뛴 달 수(§3 빈 달 규칙). */
  statsGapSkippedEmpty: number;
}> {
  const ymList = getYmList(MONTHS);

  let cacheRow: FetchCacheStatusRow | null = null;
  try {
    cacheRow = await getCacheStatus(supabase, lawdCd, BUILDING_TYPE);
  } catch (err) {
    console.error(`[prewarm: cache status 조회 실패] ${lawdCd}`, err);
  }

  // 이미 확보된(연속) 개월 수 — 이번 실행이 이어받는 시작점. 아래에서 배치가 끝날 때마다
  // 이 값을 넘어서는 방향으로만 점진 갱신한다(절대 줄어들지 않음).
  const baseCollected = cacheRow?.months_collected ?? 0;

  // /api/data와 동일 기준: 하루 경계는 00:00 KST이며, 비교의 양변(현재 시각과
  // last_fetched_at) 모두 toKstDateString(lib/kst.ts)을 통과시킨다.
  const todayKst = toKstDateString();
  const cacheFreshToday =
    !!cacheRow &&
    cacheRow.status === "ready" &&
    !!cacheRow.last_fetched_at &&
    toKstDateString(cacheRow.last_fetched_at) === todayKst;

  // /api/data와 동일 규칙: 이미 수집된 범위(months_collected) 안이고, 최신월(index 0)은
  // 오늘 이미 갱신된 경우에만 스킵 가능. 나머지는 이번 라운드에 (재)수집한다.
  // ymList는 index 0(최신월) → index MONTHS-1(최고령월) 순이므로, i(인덱스)도 함께 들고 있어야
  // 아래에서 "index 0부터 연속으로 몇 개월이 확보됐는지"를 계산할 수 있다.
  const monthsToFetch: Array<{ ym: string; i: number }> = [];
  ymList.forEach((ym, i) => {
    const isCurrentMonth = i === 0;
    const withinCollectedWindow = i < baseCollected;
    const canSkip = withinCollectedWindow && (!isCurrentMonth || cacheFreshToday);
    if (!canSkip) monthsToFetch.push({ ym, i });
  });

  // ── W1-b (2026-07-28): 창 안인데 monthly_stats 행이 없는 달을 찾는다 ─────────────
  // 작은 쿼리 1개(그 지역·아파트·창 13개월). 여기서는 "무엇이 비었는지"만 확정하고, 실제
  // deals 읽기는 국토부 fetch 루프가 끝난 뒤에 한다 — 프리워밍의 본업(수집)에 시간예산을
  // 먼저 쓰고, 남는 예산으로만 치유를 하기 위해서다.
  //
  // ⚠️ 이 목록을 "창 전체"로 바꾸지 말 것(= 매번 13개월을 다 되읽어 다시 쓰는 구현).
  // 그렇게 하면 지역 방문 때마다 13개월 × 2유형 = 26행의 computed_at이 전부 그날로 덮인다.
  // computed_at은 현재 사실상 "그 달을 수집한 시점"의 유일한 흔적이고, 결정 #13 논의와
  // 2026-07-27 발행 블로그가 그 값을 근거로 쓰고 있다. 결측분만 쓰면 그 증거가 보존되고
  // 비용도 준다(정상 상태에서는 결측이 0이라 추가 로드 자체가 사라진다).
  // 이건 성능 문제가 아니라 **감사 가능성** 문제다.
  const fetchYms = new Set(monthsToFetch.map((m) => m.ym));
  let statsGapYms: string[] = [];
  try {
    const cells = await loadMonthlyStatsCells(
      supabase,
      BUILDING_TYPE,
      ymList[ymList.length - 1],
      lawdCd
    );
    statsGapYms = findMissingStatsMonths(indexStatsCells(cells), lawdCd, ymList).filter(
      // 이번에 fetch하는 달은 어차피 allData에 담기므로 DB에서 또 읽을 필요가 없다.
      (ym) => !fetchYms.has(ym)
    );
  } catch (err) {
    // 조회 실패는 치유를 다음 방문으로 미룰 뿐, 수집 자체를 막지 않는다(best-effort).
    console.error(`[prewarm: monthly_stats 결측 조회 실패] ${lawdCd}`, err);
  }

  if (monthsToFetch.length === 0 && statsGapYms.length === 0) {
    return {
      fetchedMonths: 0,
      incomplete: false,
      monthsCollected: baseCollected,
      statsGapMonths: 0,
      statsGapSkippedEmpty: 0,
    };
  }

  const allData: AllData = {};
  let fetchedCount = 0;
  let incomplete = false;
  // 캐시 포이즈닝 방지: molit fetch가 실제로 실패한 달(레이트리밋/타임아웃 등)이 하나라도
  // 있으면, 그 지역을 이번 실행에서 "ready(완료)"로 확정하지 않는다(다음 크론이 재시도).
  // 대형 지역(예: 화성 41590)이 레이트리밋에 걸려도 빈 데이터가 완료로 굳는 걸 막는 핵심.
  let anyFailed = false;
  // 실패한 "달"의 집합. W1-a(2026-07-28)가 stats 집계 입력에서 이 달들만 정확히 제외하는 데
  // 쓴다(/api/data:207-210의 statsData와 동일한 규칙). anyFailed(불리언)만으로는 "어느 달이
  // 오염됐는지"를 알 수 없어 지역 전체를 통째로 막을 수밖에 없었던 것이 원인 2였다.
  const failedYms = new Set<string>();
  // 2026-07-15 "같은 지역에서 진행이 안 됨" 사고 대응: 기존에는 지역 하나를 13개월 다
  // 끝내야만(!incomplete) fetch_cache_status를 갱신했다. 그래서 콜드 지역이 시간예산
  // 부족으로 중간에 멈추면 이미 deals 테이블엔 upsert된 개월이 있는데도 months_collected가
  // 0인 채로 남아, 다음 크론 실행이 "이 지역 0개월 수집됨"으로 보고 처음부터 다시 시작해
  // 영원히 못 끝냈다. 이제는 CONCURRENCY 배치가 끝날 때마다 "index 0부터 연속으로 확보된
  // 개월 수"를 즉시 fetch_cache_status에 반영해, 중단되더라도 그 지점까지는 저장되고
  // 다음 실행이 나머지 개월만 이어받게(monthsToFetch 계산 로직이 자연히 걸러줌) 한다.
  let extensionContiguousCount = 0;
  let extensionStillContiguous = true;
  let currentMonthsCollected = baseCollected;

  for (let i = 0; i < monthsToFetch.length; i += CONCURRENCY) {
    // 배치(청크) 시작 전마다 시간예산을 확인한다 — 콜드 지역(월 배치 여러 개)이 예산을
    // 다 써버리기 전에 여기서 끊어야, 이 지역 하나가 전체 함수 실행시간을 인질로 잡지 않는다.
    // (배치 하나 자체도 개별 국토부 API 호출 8s 타임아웃으로 상한이 있어, 이 체크와
    // 합쳐지면 한 배치가 예산을 크게 초과해도 다음 배치는 확실히 스킵된다.)
    if (Date.now() >= deadline) {
      incomplete = true;
      break;
    }
    const chunk = monthsToFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async ({ ym, i: idx }) => {
        try {
          const { data, failed } = await collectMonth(lawdCd, ym, BUILDING_TYPE);
          return { ym, idx, data, failed };
        } catch (err) {
          console.error(`[prewarm: collectMonth 실패] ${lawdCd} ${ym}`, err);
          return { ym, idx, data: EMPTY_MONTH, failed: true };
        }
      })
    );
    for (const { ym, idx, data: rawData, failed } of results) {
      // ── monthly_stats writer 기준 통일 (2026-07-20) ─────────────────────
      // 아래 upsertMonthlyStats(allData)가 monthly_stats.deal_count를 쓰는데,
      // /api/data도 같은 지역·월의 같은 행을 쓴다. /api/data가 접힌 값으로 쓰도록
      // 바뀌었으므로 여기서 원본을 그대로 넘기면 **두 writer가 같은 행을 서로 다른
      // deal_count로 번갈아 덮어쓰게 된다.** 같은 기준(dedupeMonthData →
      // dealNaturalKey)으로 접어 두 writer의 값을 일치시킨다.
      // (upsertMonthDeals는 내부에서 어차피 같은 기준으로 접으므로 접힌 값을 넘겨도
      //  적재 결과는 동일하다 — 멱등.)
      //
      // ⚠️ failed/anyFailed/incomplete 게이팅과 months_collected 계산은 캐시
      // 포이즈닝 방지 로직이므로 건드리지 않는다 — 아래 분기는 rawData 대신 접힌
      // data를 쓸 뿐 조건·흐름이 그대로다.
      const data = dedupeMonthData(lawdCd, BUILDING_TYPE, ym, rawData);
      allData[ym] = data;
      if (failed) {
        anyFailed = true;
        failedYms.add(ym);
      }
      let upsertOk = true;
      // 실패한 달은 deals에 영속화하지 않는다(빈/부분 데이터를 정상 수집분처럼 굳히지 않음).
      if (!failed) {
        try {
          await upsertMonthDeals(supabase, lawdCd, BUILDING_TYPE, ym, data);
          fetchedCount += 1;
        } catch (err) {
          console.error(`[prewarm: deals upsert 실패] ${lawdCd} ${ym}`, err);
          upsertOk = false;
        }
      }
      // index 0(baseCollected 이전이면 단순 재갱신용)은 연속 카운트에 포함하지 않는다.
      // baseCollected 이상 인덱스만 "이번에 새로 확장한 연속 구간"이며, monthsToFetch가
      // ymList 순서(오름차순 i)를 그대로 보존하므로 처리 순서 = 인덱스 오름차순이 보장된다.
      // fetch 실패(failed)는 연속성을 끊는다 — months_collected가 실패 지점을 넘어
      // 전진하지 못하게 해, 빈 캐시가 완료 범위로 굳는 것을 막는다.
      if (idx >= baseCollected) {
        if (!failed && upsertOk && extensionStillContiguous) {
          extensionContiguousCount += 1;
        } else {
          extensionStillContiguous = false;
        }
      }
    }

    const newMonthsCollected = Math.min(baseCollected + extensionContiguousCount, MONTHS);
    if (newMonthsCollected > currentMonthsCollected) {
      currentMonthsCollected = newMonthsCollected;
      try {
        // 아직 지역 전체가 끝나지 않은 시점의 중간 저장이므로 status는 "ready"가 아니라
        // "collecting"으로 둔다 — /api/data·다음 크론 실행 모두 months_collected(개월 수)
        // 만으로 스킵 여부를 판단하므로 이걸로 충분하고, 최신월(index 0) 신선도 판정에 쓰는
        // status==="ready" 체크가 미완료 지역을 "오늘 이미 신선함"으로 오판하지 않게 막아준다.
        await upsertCacheStatus(supabase, lawdCd, BUILDING_TYPE, {
          months_collected: currentMonthsCollected,
          last_deal_ym: ymList[currentMonthsCollected - 1],
          status: "collecting",
        });
      } catch (err) {
        console.error(`[prewarm: 진행 캐시 중간 갱신 실패] ${lawdCd}`, err);
      }
    }
  }

  // ── W1-b (2026-07-28): stats 결측 달을 deals에서 되읽어 집계 입력에 합류시킨다 ──────
  // 위에서 확정한 statsGapYms(창 안인데 monthly_stats 행이 없고 이번에 fetch하지도 않는 달)를
  // loadMonthFromDb로 읽어 allData에 넣는다. 그러면 바로 아래 W1-a의 upsertMonthlyStats가
  // 그 달까지 함께 써서, 지역이 다음에 프리워밍될 때 창 안 구멍이 자동으로 메워진다.
  // 국토부 호출이 아니라 Supabase 읽기라 시간예산 영향이 작고, 한 번 메워지면 다음 방문부터는
  // 결측이 0이라 추가 로드 자체가 사라진다(정상 상태에서 비용 증가 없음).
  let statsGapMonths = 0;
  let statsGapSkippedEmpty = 0;
  for (const ym of statsGapYms) {
    // 예산이 다 됐으면 치유를 여기서 멈춘다. incomplete로 격상하지는 않는다 — 치유는
    // best-effort 부가 작업이라, 이걸로 지역 인덱스를 붙잡으면 초회 순회(현재 진행 중)가
    // 통째로 느려진다. 못 메운 달은 다음 방문 때 같은 경로로 다시 잡힌다.
    if (Date.now() >= deadline) break;
    if (allData[ym]) continue; // 이번에 fetch돼 이미 담긴 달(방어적)
    try {
      const dbData = await loadMonthFromDb(supabase, lawdCd, BUILDING_TYPE, ym);
      // 빈 달 규칙(기획안 §3): deals가 매매·전세·월세 통틀어 0행이면 쓰지 않는다.
      // DB만으로는 "실제로 거래 0건인 달"과 "수집이 안 된 달"을 구분할 수 없어서, 후자에
      // {avg:null, count:0}을 쓰면 검증 불가능한 주장을 사실처럼 확정 기록하게 된다.
      // (이번에 국토부에서 직접 fetch한 달은 다르다 — 0건이라는 양성 증거를 방금 얻었으므로
      //  그 달의 {null, 0}은 참인 진술이라 아래 W1-a에서 그대로 쓴다.)
      if (dbData.매매.length + dbData.전세.length + dbData.월세.length === 0) {
        statsGapSkippedEmpty += 1;
        continue;
      }
      allData[ym] = dbData;
      statsGapMonths += 1;
    } catch (err) {
      console.error(`[prewarm: stats 결측 달 deals 조회 실패] ${lawdCd} ${ym}`, err);
    }
  }

  // ── W1-a (2026-07-28): monthly_stats 쓰기를 무결-실행 게이트 밖으로 뺀다 ────────────
  // 예전에는 이 upsertMonthlyStats가 아래 `if (!incomplete && !anyFailed)` 블록 안에 있었다.
  // 그래서 콜드 지역이 시간예산으로 쪼개져 수집되면 중간 달의 stats가 영영 안 써졌다(원인 2).
  //
  // 🔴 왜 게이트 밖으로 빼도 캐시 포이즈닝이 재발하지 않는가 (되돌리기 전에 반드시 읽을 것)
  //   게이트의 존재 이유는 캐시 포이즈닝 방지 — 빈/부분 fetch 결과가 "완료"로 굳어 이후 조회가
  //   그 오염 캐시를 계속 서빙하는 것을 막는 것이다. 그런데 그 위험은 **failed 플래그 단위로
  //   이미 정확히 표현돼 있다.**
  //     • failed가 아닌 달 = collectMonth가 성공했고 upsertMonthDeals까지 마친 달이다. 그 달의
  //       stats를 쓰는 것은 **이미 영속화된 deals를 요약하는 행위**일 뿐, 새로운 주장을 만들지
  //       않는다. deals가 진실이면 그 요약도 진실이다.
  //     • incomplete(시간예산 초과)는 "이 지역의 **다른 달**을 아직 못 했다"는 뜻이지 "이번에
  //       처리한 달이 오염됐다"는 뜻이 아니다 — stats를 막을 근거가 되지 않는다.
  //     • anyFailed도 마찬가지로 "이 지역의 **어떤 달**이 실패했다"는 지역 단위 신호다. 실패한
  //       그 달만 아래 statsData에서 제외하면 오염원은 정확히 차단된다.
  //   그리고 포이즈닝의 실제 차단 지점은 stats가 아니라 **fetch_cache_status의 ready 마킹**이다
  //   (ready여야 이후 조회가 재-fetch를 건너뛴다). 그 마킹은 지금도 게이트 안에 그대로 남겨 둔다.
  //   같은 구조가 /api/data(:205-213 stats는 게이트 밖, :244-252 ready만 게이트 안)에서 이미
  //   수개월째 돌고 있고, 그 경로로 서빙된 지역들이 정확히 결측 없는 지역들이다.
  //   ⚠️ 이 upsertMonthlyStats를 다시 게이트 안으로 옮기면 724셀 결측 사고가 그대로 재발한다.
  const statsData: AllData = {};
  for (const [ym, data] of Object.entries(allData)) {
    if (!failedYms.has(ym)) statsData[ym] = data;
  }
  if (Object.keys(statsData).length > 0) {
    try {
      for (const dealType of ["매매", "전세"] as const) {
        await upsertMonthlyStats(supabase, lawdCd, BUILDING_TYPE, dealType, statsData);
      }
    } catch (err) {
      console.error(`[prewarm: monthly_stats 영속화 실패] ${lawdCd}`, err);
    }
  }

  // 예산 초과로 중간에 끊었으면(incomplete) 이번 지역은 13개월 전체를 못 채웠으므로
  // cache status를 "ready"로 확정하지 않는다 — 이미 개별 upsertMonthDeals된
  // deals 행과 위에서 배치마다 갱신한 months_collected는 남아 있으니(다음 실행에서 같은
  // 달을 다시 upsert해도 멱등이라 안전) 손실은 없고, 다음 크론 실행이 이 지역을
  // (부분 진행된 지점부터, 남은 개월만) 이어받는다.
  //
  // 추가로 anyFailed(레이트리밋/타임아웃 등으로 실제로 실패한 달이 하나라도 있음)일 때도
  // "ready"로 확정하지 않는다 — 화성 41590처럼 완주(!incomplete)했더라도 빈/부분 데이터를
  // 완료로 굳히면 이후 조회가 그 캐시를 재사용해 0건이 고착되기 때문(포이즈닝의 핵심 원인).
  // 실패 지점까지만 반영된 months_collected("collecting")를 남겨 다음 크론이 재시도한다.
  //
  // 2026-07-28: stats 쓰기가 위로 빠져나가면서 이 블록은 ready 마킹 전용이 됐다. 예전에는
  // 한 try 안에 있어서 stats upsert가 실패하면 ready 마킹도 함께 건너뛰었는데, 이제는
  // 독립적이다 — stats가 실패해도 수집 자체는 완료됐으므로 ready로 확정하는 것이 맞고,
  // 못 쓴 stats는 다음 방문 때 W1-b가 결측으로 다시 잡아 메운다.
  if (!incomplete && !anyFailed) {
    try {
      const newMonthsCollected = Math.max(baseCollected, MONTHS);
      const oldestYm = ymList[ymList.length - 1];
      await upsertCacheStatus(supabase, lawdCd, BUILDING_TYPE, {
        months_collected: newMonthsCollected,
        last_deal_ym: oldestYm,
        status: "ready",
      });
      currentMonthsCollected = newMonthsCollected;
    } catch (err) {
      console.error(`[prewarm: 캐시 상태 확정 실패] ${lawdCd}`, err);
    }
  }

  return {
    fetchedMonths: fetchedCount,
    incomplete,
    monthsCollected: currentMonthsCollected,
    statsGapMonths,
    statsGapSkippedEmpty,
  };
}

async function getProgress(supabase: ReturnType<typeof getSupabaseServerClient>): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("prewarm_progress")
      .select("last_index")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return (data?.last_index as number) ?? 0;
  } catch (err) {
    console.error("[prewarm: 진행 상태 조회 실패, 0부터 시작]", err);
    return 0;
  }
}

async function saveProgress(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  index: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from("prewarm_progress")
      .upsert({ id: 1, last_index: index, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw error;
  } catch (err) {
    console.error("[prewarm: 진행 상태 저장 실패(다음 실행이 인덱스 0부터 재시작될 수 있음)]", err);
  }
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[prewarm: Supabase 미구성]", err);
    return NextResponse.json({ error: "supabase 미구성" }, { status: 500 });
  }

  const regions = buildRegionList();
  if (regions.length === 0) {
    // 2026-08-04: 아래 정상 경로와 응답 모양을 맞춰 failed/failedCount도 함께 낸다.
    // 소비자가 `failed`를 "없으면 실패 없음"이 아니라 "배열"로 일관되게 읽을 수 있게 하려는
    // 것이다(undefined와 [] 두 표현이 섞이면 모니터링 쪽에서 갈라진다).
    return NextResponse.json({
      ok: true,
      processedCount: 0,
      failedCount: 0,
      attemptedCount: 0,
      totalRegions: 0,
      processed: [],
      failed: [],
    });
  }

  const startTime = Date.now();
  const deadline = startTime + TIME_BUDGET_MS;
  let idx = (await getProgress(supabase)) % regions.length;

  const processed: Array<{
    sido: string;
    gu: string;
    lawdCd: string;
    fetchedMonths: number;
    incomplete?: boolean;
    monthsCollected?: number;
    // W1-b 관측치 — QA가 "치유가 실제로 일어났는지"와 "정상 상태에서 0으로 수렴하는지"를
    // 이 두 값으로 본다(기획안 §5 V6).
    statsGapMonths?: number;
    statsGapSkippedEmpty?: number;
  }> = [];
  // ── 2026-08-04: 실패 지역 목록 ────────────────────────────────────────────────
  // 왜 `processed`에 플래그를 끼우지 않고 **별도 배열**을 택했는가:
  //   • `processedCount`는 지금까지 `processed.length`로 계산돼 왔고, 운영/QA가 그 값을
  //     "이번 실행에서 실제로 처리(성공)된 지역 수"로 읽어 왔다. processed에 실패 항목을
  //     섞으면 그 순간 processedCount의 의미가 "시도 수"로 조용히 바뀐다 —
  //     **조용한 의미 변경은 이번에 고치려는 버그와 같은 종류의 문제다.** 기존 필드 의미를
  //     보존하는 쪽이 유일하게 안전한 선택이었다.
  //   • processed 항목들은 전부 "성공한 지역의 수집 지표"(fetchedMonths/monthsCollected/
  //     statsGap*)를 갖는다. 실패 항목은 그 지표를 하나도 못 만든다. 한 배열에 넣으면
  //     모든 필드가 optional이 되어, 소비자가 매 항목마다 "이건 성공인가?"를 먼저 물어야 한다.
  //   • 실패 지역은 `.filter(...)` 없이 배열째로 바로 눈에 들어와야 한다. 이번 사고의 본질은
  //     "찾아봐야 보인다"가 아니라 "찾아봐도 없다"였고, 그 반대극은 "안 찾아도 보인다"다.
  // 담는 값은 지역 식별자(sido/gu/lawdCd) + message 수준 에러 요약뿐이다. lawdCd를 넣는 이유는
  // 운영자가 실패 지역을 바로 단건 재시도(?/api/data 또는 수동 프리워밍)할 수 있어야 하기 때문.
  const failed: Array<{
    sido: string;
    gu: string;
    lawdCd: string;
    error: string;
  }> = [];
  let count = 0;

  // 한 바퀴(regions.length번) 이상은 돌지 않는다(전부 신선해서 매번 즉시 스킵되는 상황에서도
  // 무한루프 없이 종료). MAX_REGIONS_PER_RUN도 별도 안전장치로 둔다. 시간예산을 넘기면 그
  // 자리에서 멈추고 인덱스를 저장해 다음 실행에 이어간다. 지역 내부(월별 배치)의 예산 체크는
  // prewarmRegion에 위임한다(콜드 지역 하나가 예산을 인질로 잡는 문제의 핵심 수정).
  while (
    count < regions.length &&
    count < MAX_REGIONS_PER_RUN &&
    Date.now() < deadline
  ) {
    const region = regions[idx];
    let incomplete = false;
    try {
      const result = await prewarmRegion(supabase, region.lawdCd, deadline);
      incomplete = result.incomplete;
      processed.push({
        ...region,
        fetchedMonths: result.fetchedMonths,
        incomplete,
        monthsCollected: result.monthsCollected,
        statsGapMonths: result.statsGapMonths,
        statsGapSkippedEmpty: result.statsGapSkippedEmpty,
      });
    } catch (err) {
      console.error(`[prewarm: 지역 처리 실패] ${region.sido} ${region.gu}`, err);
      // 2026-08-04: console.error만 남기고 끝냈던 것이 이 버그였다. Vercel 함수 로그는 이
      // 대시보드의 운영 경로(크론 응답 확인)에서 사실상 열리지 않으므로, 같은 사실을 응답에도
      // 싣는다. 로그를 지우지 않고 둘 다 남기는 이유는 응답에는 message 수준 요약만 담고
      // 스택은 로그에만 남겨야 해서다(스택은 시크릿·내부 경로가 섞일 수 있고 응답을 부풀린다).
      //
      // 🔴 toSafeErrorMessage 호출을 자체 try/catch로 감싼 이유 (2026-08-04 QA F-4 실측):
      // 이 함수는 err.name / err.message / err.cause를 **읽는다.** 그 프로퍼티가 접근자
      // (getter)이고 그 getter가 throw하는 객체를 만나면, 예외가 이 catch를 뚫고 while 루프
      // 밖으로 나가 라우트 전체가 500이 된다 — 응답이 통째로 사라지므로 **그 실행에서 이미
      // 성공한 지역들의 processed까지 함께 버려진다.** 관측성을 늘리려는 수정이 관측 대상을
      // 없애는 것이 되어 취지와 정반대가 된다.
      // 수정 전(HEAD)에는 이 위험이 없었다. console.error(msg, err)의 util.inspect는 기본적으로
      // getter를 호출하지 않아 살아남았다(QA가 HEAD와 대조 실측으로 확인). 즉 이건 이번 수정이
      // 새로 들여온 유일한 동작 변화이므로 여기서 닫는다.
      // 도달성은 낮다 — undici 에러도 postgrest 에러도 평범한 데이터 프로퍼티다. 그래서 차단
      // 사유는 아니었지만, 방어 비용이 3줄이고 실패 시 대가가 "응답 소실"이라 값이 맞지 않는다.
      // 이 폴백이 뜨면 그 자체가 조사 신호다(정상 경로에서는 절대 나오지 않는 문자열).
      let errorText: string;
      try {
        errorText = toSafeErrorMessage(err);
      } catch {
        errorText = "[에러 요약 실패: 프로퍼티 접근이 예외를 던졌다]";
      }
      failed.push({ ...region, error: errorText });
    }
    count += 1;
    // incomplete(예산 초과로 중간에 끊긴 지역)이면 인덱스를 전진시키지 않는다 — 다음 실행이
    // 같은 지역부터 이어받아 나머지 개월을 마저 채우도록 한다. 어차피 이번 루프는 시간예산도
    // 이미 다 썼을 것이므로(그래서 incomplete가 됐으므로) 곧바로 while 조건에서 빠져나간다.
    //
    // ⚠️ 2026-08-04: throw한 지역(위 catch)은 incomplete가 false로 남아 **여기서 그대로
    // 전진한다 — 이건 버그가 아니라 의도다.** 전진을 막으면 영구 실패 지역 하나(예: 해당
    // lawdCd에서만 재현되는 외부 API 오류)가 프리워밍 전체를 그 자리에 무한히 인질로 잡고,
    // 뒤의 지역 100여개가 영원히 갱신되지 않는다. 즉 지역 1개의 실패가 전국 정지로 번진다.
    // incomplete(시간예산 초과)는 "재시도하면 진전이 있다"는 근거가 있어 붙잡아 두는 것이고,
    // throw는 그 근거가 없다. 그래서 이번 수정은 흐름을 바꾸지 않고 **실패를 보이게만** 한다.
    // 대가는 "실패 지역이 다음 순회(약 38라운드 뒤)까지 방치될 수 있다"인데, 그 대가는 코드가
    // 아니라 응답을 보는 운영자가 failed[]를 보고 수동 재시도로 갚는 것이 맞다.
    if (!incomplete) {
      idx = (idx + 1) % regions.length;
    }
    await saveProgress(supabase, idx);
  }

  // ── 응답 (2026-08-04 관측성 수정) ───────────────────────────────────────────
  // 필드 순서에 의도가 있다: 운영자가 응답 첫 줄만 보고도 이상을 알아채야 하므로 요약 카운터
  // 3개를 processed/failed 배열보다 앞에 둔다(JSON.stringify는 객체 리터럴 순서를 보존한다).
  //
  // • processedCount = processed.length — **의미 불변**(성공 지역 수). 기존 소비자 그대로.
  // • failedCount    = 이번 실행에서 throw한 지역 수. 0이 아니면 그 자체로 조사 신호다.
  // • attemptedCount = 지역 루프가 시도한 횟수(count). 이 값을 굳이 넣는 이유는
  //   **attemptedCount === processedCount + failedCount** 라는 검산식을 응답 안에서 닫기
  //   위해서다. 2026-08-04 진단은 nextIndex 전진칸수(106→112)와 processedCount(3)를 손으로
  //   대조해야 갭 3건이 드러났는데, 그 대조를 운영자 머릿속이 아니라 응답이 하게 만든다.
  //   (전진칸수 자체를 응답에 넣는 방법도 있었지만, 그 값은 incomplete 지역이 인덱스를 붙잡는
  //    정상 동작 때문에 시도 수와 원래 어긋날 수 있어 이상 신호로 쓰기에 부적합하다.
  //    attemptedCount는 그 예외와 무관하게 항상 성립한다.)
  // • ok는 "라우트가 끝까지 돌았다"는 뜻을 그대로 유지한다 — 부분 실패로 false로 바꾸면
  //   ok를 헬스체크로 읽는 쪽의 의미가 조용히 바뀐다. 부분 실패의 신호는 failedCount다.
  return NextResponse.json({
    ok: true,
    processedCount: processed.length,
    failedCount: failed.length,
    attemptedCount: count,
    nextIndex: idx,
    totalRegions: regions.length,
    elapsedMs: Date.now() - startTime,
    processed,
    failed,
  });
}
