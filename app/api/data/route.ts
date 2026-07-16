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
  getCacheStatus,
  loadMonthFromDb,
  upsertCacheStatus,
  upsertMonthDeals,
  upsertMonthlyStats,
  type FetchCacheStatusRow,
} from "@/lib/db-cache";
import type { FetchSource } from "@/lib/types";

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

  const todayStr = new Date().toISOString().slice(0, 10);
  const cacheFreshToday =
    !!cacheRow &&
    cacheRow.status === "ready" &&
    !!cacheRow.last_fetched_at &&
    cacheRow.last_fetched_at.slice(0, 10) === todayStr;

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
    for (const { ym, data, failed } of results) {
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
      // 이번 요청에 fetch 실패가 하나라도 있었으면 status를 "ready"로 올리거나
      // months_collected를 확장하지 않는다 — 그래야 다음 조회/프리워밍이 이 지역을
      // 재시도한다(실패가 없으면 기존과 동일하게 완료 마킹).
      if (!anyFetchFailed) {
        const newMonthsCollected = Math.max(cacheRow?.months_collected ?? 0, months);
        const oldestYm = ymList[ymList.length - 1];
        await upsertCacheStatus(supabase, lawdCd, buildingType, {
          months_collected: newMonthsCollected,
          last_deal_ym: oldestYm,
          status: "ready",
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
