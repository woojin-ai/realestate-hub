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
  for (let i = 0; i < monthsToFetch.length; i += CONCURRENCY) {
    const chunk = monthsToFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ym) => {
        // molit-api가 개별 예외를 흡수하지만, 예기치 못한 throw로 배치 전체가
        // reject되지 않도록 월 단위로 한 번 더 가드한다(부분 데이터라도 반환).
        try {
          return { ym, data: await collectMonth(lawdCd, ym, buildingType) };
        } catch (err) {
          console.error(`[collectMonth 실패] ym=${ym}`, err);
          return { ym, data: EMPTY_MONTH };
        }
      })
    );
    for (const { ym, data } of results) {
      allData[ym] = data;
      if (supabase) {
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
  if (supabase) {
    try {
      for (const dealType of ["매매", "전세"] as const) {
        await upsertMonthlyStats(supabase, lawdCd, buildingType, dealType, allData);
      }
      const newMonthsCollected = Math.max(cacheRow?.months_collected ?? 0, months);
      const oldestYm = ymList[ymList.length - 1];
      await upsertCacheStatus(supabase, lawdCd, buildingType, {
        months_collected: newMonthsCollected,
        last_deal_ym: oldestYm,
        status: "ready",
      });
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
