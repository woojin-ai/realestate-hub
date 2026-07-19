import { NextResponse, type NextRequest } from "next/server";
import {
  collectMonth,
  getYmList,
  type MonthData,
  type BuildingType,
} from "@/lib/molit-api";
import { buildSummary, buildAptStats, type AllData } from "@/lib/analyzer";
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
import type { FetchSource } from "@/lib/types";
import { toKstDateString } from "@/lib/kst";

// 국토부 API는 매 요청 최신 신고분을 반영해야 하므로 이 라우트는 캐시하지 않는다.
// (Next 16, Cache Components 미사용 → 'Previous Model'의 route segment config가 유효)
export const dynamic = "force-dynamic";
// 아파트/빌라/단독 매매·전월세를 building_type 쿼리로 구분해 조회한다. Node 런타임(기본)에서 실행.
export const runtime = "nodejs";

const BUILDING_TYPES: readonly BuildingType[] = ["아파트", "빌라", "단독"];

const DEFAULT_MONTHS = 13;
const MAX_MONTHS = 24; // 남용/타임아웃 방지 상한
// 국토부 API 부하·서버리스 타임아웃을 고려해 월별 호출은 소규모 병렬(3개씩) 배치로 처리한다.
const CONCURRENCY = 3;
const EMPTY_MONTH: MonthData = { 매매: [], 전세: [], 월세: [] };

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lawdCd = searchParams.get("lawd_cd");
  const monthsRaw = searchParams.get("months");
  const buildingTypeRaw = searchParams.get("building_type");

  // ── 입력 검증 ────────────────────────────────────────────────
  if (!lawdCd || !/^\d{5}$/.test(lawdCd)) {
    return NextResponse.json(
      { error: "lawd_cd(법정동 시군구코드, 5자리 숫자)가 필요합니다." },
      { status: 400 }
    );
  }

  // building_type: 누락 시 기본 "아파트", 지원 외 값은 400.
  // (한글 쿼리값은 nextUrl.searchParams가 자동 디코딩하므로 별도 decodeURIComponent 불필요)
  let buildingType: BuildingType = "아파트";
  if (buildingTypeRaw !== null) {
    if (!BUILDING_TYPES.includes(buildingTypeRaw as BuildingType)) {
      return NextResponse.json(
        { error: "building_type은 아파트/빌라/단독 중 하나여야 합니다." },
        { status: 400 }
      );
    }
    buildingType = buildingTypeRaw as BuildingType;
  }

  let months = DEFAULT_MONTHS;
  if (monthsRaw !== null) {
    const parsed = Number(monthsRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json(
        { error: "months는 1 이상의 정수여야 합니다." },
        { status: 400 }
      );
    }
    months = Math.min(parsed, MAX_MONTHS);
  }

  const ymList = getYmList(months);
  const allData: AllData = {};

  // ── Supabase 캐시 우선 조회 (마이그레이션 3단계) ────────────────
  // Supabase 연동이 실패해도(환경변수 누락, 네트워크 오류 등) 국토부 API 직접
  // 호출로 완전히 폴백해 기존 동작을 그대로 보존한다(캐시는 성능/영속화를 위한
  // 부가 기능일 뿐, 조회 자체를 막아서는 안 됨).
  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[Supabase 클라이언트 초기화 실패, API 직접 호출로 폴백]", err);
  }

  let cacheRow: FetchCacheStatusRow | null = null;
  if (supabase) {
    try {
      cacheRow = await getCacheStatus(supabase, lawdCd, buildingType);
    } catch (err) {
      console.error("[fetch_cache_status 조회 실패, API 직접 호출로 폴백]", err);
    }
  }

  // "오늘 이미 수집했나?"의 하루 경계는 00:00 KST다(한국 부동산 데이터 서비스).
  // last_fetched_at은 timestamptz(UTC 순간값)로 저장되므로 비교의 **양변 모두**
  // toKstDateString을 통과시킨다 — 한쪽만 변환하면 기준이 어긋난다.
  const todayKst = toKstDateString();
  const cacheFreshToday =
    !!cacheRow &&
    cacheRow.status === "ready" &&
    !!cacheRow.last_fetched_at &&
    toKstDateString(cacheRow.last_fetched_at) === todayKst;

  // ymList는 최신월이 인덱스 0. months_collected는 "가장 최근부터 몇 개월이
  // 이미 수집되어 있는지"를 뜻하므로, 그 범위 안(index < months_collected)이면
  // DB 재사용이 가능하다. 다만 최신월(index 0)은 국토부 신고가 계속 갱신되므로
  // 오늘 이미 수집을 마친 경우(cacheFreshToday)에만 DB를 그대로 쓴다.
  const monthsFromDb: string[] = [];
  let monthsToFetch: string[] = [];
  if (supabase) {
    ymList.forEach((ym, i) => {
      const isCurrentMonth = i === 0;
      const withinCollectedWindow = !!cacheRow && i < cacheRow.months_collected;
      const canUseDb = withinCollectedWindow && (!isCurrentMonth || cacheFreshToday);
      if (canUseDb) monthsFromDb.push(ym);
      else monthsToFetch.push(ym);
    });
  } else {
    monthsToFetch = [...ymList];
  }

  for (const ym of monthsFromDb) {
    try {
      allData[ym] = await loadMonthFromDb(supabase!, lawdCd, buildingType, ym);
    } catch (err) {
      console.error(`[DB 캐시 조회 실패, API 호출로 폴백] ym=${ym}`, err);
      monthsToFetch.push(ym);
    }
  }

  // ── 부족한 개월만 국토부 API 호출 (배치 병렬) ───────────────────
  // 캐시 포이즈닝 방지: molit fetch가 "실제로 실패한 달"(레이트리밋/타임아웃 등)과
  // "정상적으로 0건인 달"을 collectMonth의 failed 플래그로 구분한다. 실패한 달은
  // (1) deals에 빈/부분 데이터를 영속화하지 않고 (2) 아래에서 stats/cache-status를
  // 완료로 마킹하지 못하게 막아, 다음 조회/프리워밍이 그 지역을 재시도하게 한다.
  const failedMonths = new Set<string>();
  for (let i = 0; i < monthsToFetch.length; i += CONCURRENCY) {
    const chunk = monthsToFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ym) => {
        // molit-api가 개별 예외를 흡수하지만, 예기치 못한 throw로 배치 전체가
        // reject되지 않도록 월 단위로 한 번 더 가드한다(부분 데이터라도 반환).
        // 예기치 못한 throw는 그 달을 실패로 취급한다(failed:true).
        try {
          const { data, failed } = await collectMonth(lawdCd, ym, buildingType);
          return { ym, data, failed };
        } catch (err) {
          console.error(`[collectMonth 실패] ym=${ym}`, err);
          return { ym, data: EMPTY_MONTH, failed: true };
        }
      })
    );
    for (const { ym, data: rawData, failed } of results) {
      // ── 라이브/캐시 경로 건수 일치 (2026-07-20) ──────────────────────────
      // 국토부 API 원본은 deals 테이블의 자연키가 같은 레코드를 여러 건 돌려준다.
      // 캐시 경로(loadMonthFromDb)는 이미 접힌 DB 행을 읽으므로, 라이브 경로만
      // 원본 그대로 싣던 기존 코드에서는 **같은 달인데 서빙 경로에 따라 건수가
      // 달라졌다**(실측: 세종 36110/202607 전세 라이브 270 vs 캐시 258, 매매 133 vs
      // 131). 최신월만 신선도에 따라 두 경로를 오가므로 "진행 중인 달의 거래건수가
      // 조회할 때마다 줄어드는" 것처럼 보였다. upsertMonthDeals가 적재 시 쓰는 것과
      // 동일한 기준(dedupeMonthData → dealNaturalKey)으로 여기서도 접어, 어느
      // 경로로 서빙되든 같은 값이 나오게 한다.
      //
      // ⚠️ 표시 건수는 "불변"이 아니다 — 라이브 경로를 타던 **최신월의 건수가
      // 캐시 값에 맞춰 내려간다**(위 실측 기준 전세 270→258, 매매 133→131).
      // 그대로인 것은 완결월(원래 캐시 경로 전용)과, 이미 캐시 경로로 서빙되던
      // 값이다. 즉 오르내리던 최신월 숫자를 낮은 쪽으로 고정하는 변경이다.
      // 단 완결월도 예외가 하나 있다 — 위 :127에서 loadMonthFromDb가 throw하면
      // 그 달은 monthsToFetch로 재편입돼 라이브 경로를 타고, 이때는 완결월도
      // 접힌 값이 된다(캐시 값과 같아지는 방향이라 회귀가 아니라 개선이다).
      //
      // ⚠️ 자연키는 거래를 완전히 식별하지 못해 실제보다 적게 세는 쪽으로 치우쳐
      // 있다. 자연키 확장(contract_type / contractTerm)은 난이도가 서로 다르고
      // 표시 건수가 올라가는 변경이라 이번 범위에서 제외했다 — 배경·한계·확장
      // 시 손대야 할 지점은 lib/db-cache.ts의 dedupeMonthData 주석 참고.
      //
      // upsertMonthDeals도 내부에서 같은 기준으로 다시 접으므로 이중 적용돼도
      // 결과는 동일하다(멱등). failed 처리(캐시 포이즈닝 방지)는 건드리지 않는다 —
      // 아래 분기는 rawData가 아니라 접힌 data를 쓸 뿐 조건/흐름이 그대로다.
      const data = dedupeMonthData(lawdCd, buildingType, ym, rawData);
      // 응답 payload에는 실패 여부와 무관하게 확보된 데이터를 그대로 싣는다(응답 200 유지).
      allData[ym] = data;
      if (failed) failedMonths.add(ym);
      // 실패한 달은 deals에 영속화하지 않는다 — 빈/부분 데이터를 "정상 수집분"처럼
      // 굳히면 이후 조회가 그 캐시를 그대로 읽어 0건이 고착되기 때문(포이즈닝 원인).
      if (supabase && !failed) {
        try {
          await upsertMonthDeals(supabase, lawdCd, buildingType, ym, data);
        } catch (err) {
          console.error(`[deals upsert 실패(응답에는 영향 없음)] ym=${ym}`, err);
        }
      }
    }
  }

  // ── Supabase 영속화(캐시 상태/월별 통계 갱신) — best-effort ───────
  // 실패해도 이번 요청 응답 자체는 이미 계산된 allData로 정상 반환한다.
  const anyFetchFailed = failedMonths.size > 0;
  if (supabase) {
    try {
      // 실패한 달은 stats 집계 입력에서 제외한다(count=0/avg=null 오염 방지). 정상 수집된
      // 달(DB 캐시 히트분 포함)은 그대로 반영되므로 정상 지역 통계 갱신에는 영향 없다.
      const statsData: AllData = {};
      for (const [ym, data] of Object.entries(allData)) {
        if (!failedMonths.has(ym)) statsData[ym] = data;
      }
      for (const dealType of ["매매", "전세"] as const) {
        await upsertMonthlyStats(supabase, lawdCd, buildingType, dealType, statsData);
      }
      // months_collected는 "인덱스 0(최신월)부터 연속으로 정상 확보된 개월 수"로 계산한다
      // (prewarm/route.ts의 extensionContiguousCount와 동일한 불변식). "정상 확보" =
      // DB 캐시 히트(monthsFromDb) 또는 이번에 라이브로 가져왔고 실패하지 않은 달. 실패한
      // 달(failedMonths)은 연속을 끊어 months_collected가 그 지점을 넘어 전진하지 못하게 한다.
      //
      // 기존에는 실패가 하나라도 있으면(anyFetchFailed) 진행을 "전혀" 저장하지 않는
      // all-or-nothing 방식이었다. 그래서 대형 팬아웃 지역(화성 41590 등)은 한 요청에서
      // 13개월×4코드를 몰아 호출하다 일부 달이 레이트리밋에 걸리면 매번 0개월로 되돌아가,
      // 조회를 아무리 반복해도 영영 수렴하지 못했다(months_collected가 0에서 안 올라감).
      // 이제는 실패 앞의 연속 구간까지는 저장해, 다음 조회/프리워밍이 나머지만 이어받아
      // 결국 채운다. 정상 지역(전체 깨끗)은 contiguous===months가 돼 기존과 동일하게
      // 한 번에 완료(ready) 마킹되므로 회귀가 없다.
      const okYms = new Set<string>(monthsFromDb);
      for (const ym of monthsToFetch) {
        if (!failedMonths.has(ym)) okYms.add(ym);
      }
      // DB 로드 실패로 monthsToFetch에 재편입된 뒤 재-fetch까지 실패한 달이 monthsFromDb에도
      // 남아 있을 수 있으므로, 실패한 달은 연속 계산에서 확실히 제외한다.
      for (const ym of failedMonths) okYms.delete(ym);
      let contiguous = 0;
      for (const ym of ymList) {
        if (okYms.has(ym)) contiguous += 1;
        else break;
      }
      const newMonthsCollected = Math.max(cacheRow?.months_collected ?? 0, contiguous);
      if (newMonthsCollected > 0) {
        // 요청 창(months) 전체가 연속으로 깨끗하고 실패가 없을 때만 "ready"(완료)로 확정한다
        // — 그래야 cacheFreshToday(최신월 신선도)가 미완료 지역을 "오늘 이미 신선함"으로
        // 오판하지 않는다. 부분 진행이면 "collecting"으로 저장해 진행만 남기고, 최신월(index 0)은
        // 다음 조회에서 다시 신선하게 가져오게 한다.
        const fullyCollected = !anyFetchFailed && contiguous >= months;
        await upsertCacheStatus(supabase, lawdCd, buildingType, {
          months_collected: newMonthsCollected,
          // 상한 클램프: months_collected가 이번 요청창(ymList.length=months)보다 클 수 있어
          // (기존 수집분 > 요청 months, 예: 13개월 수집된 지역을 months=3으로 조회) 인덱스가
          // ymList 범위를 넘으면 undefined가 되므로, 요청창의 최고령월로 클램프한다(항상 in-bounds).
          last_deal_ym: ymList[Math.min(newMonthsCollected, ymList.length) - 1],
          status: fullyCollected ? "ready" : "collecting",
        });
      }
    } catch (err) {
      console.error("[Supabase 영속화 실패(응답에는 영향 없음)]", err);
    }
  }

  const source: FetchSource =
    monthsToFetch.length === 0 ? "cache" : monthsFromDb.length === 0 ? "live" : "partial";

  // ── 통계 집계 (analyzer.ts 재사용) ───────────────────────────
  return NextResponse.json({
    lawd_cd: lawdCd,
    months,
    building_type: buildingType,
    summary: buildSummary(allData),
    aptStatsMaeMae: buildAptStats(allData, "매매"),
    aptStatsJeonse: buildAptStats(allData, "전세"),
    updatedAt: new Date().toISOString(),
    source,
  });
}
