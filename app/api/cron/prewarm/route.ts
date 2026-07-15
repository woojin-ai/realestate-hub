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

import { NextResponse, type NextRequest } from "next/server";
import { REGION_CODES } from "@/lib/regions";
import { collectMonth, getYmList, type MonthData } from "@/lib/molit-api";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  getCacheStatus,
  upsertCacheStatus,
  upsertMonthDeals,
  upsertMonthlyStats,
  type FetchCacheStatusRow,
} from "@/lib/db-cache";
import type { AllData } from "@/lib/analyzer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Cron 함수 최대 실행시간(플랜별 상한 이하로). 내부 시간예산은 이보다 여유를 두고 짧게 잡는다.
export const maxDuration = 60;

const MONTHS = 13; // 대시보드(/api/data) 기본 수집 범위와 동일
const TIME_BUDGET_MS = 50_000; // maxDuration(60s) 대비 여유를 두고 조기 종료
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

/**
 * 지역 하나(lawdCd)의 대시보드 데이터를 프리워밍한다.
 * /api/data(app/api/data/route.ts)의 캐시-우선 로직과 동일한 기준(fetch_cache_status)으로
 * "이미 오늘 신선한지"를 판단해, 신선하지 않은 개월만 국토부 API로 채우고 deals/monthly_stats/
 * fetch_cache_status를 upsert한다. 읽기(loadMonthFromDb)는 필요 없다 — 프리워밍은 쓰기 전용.
 */
async function prewarmRegion(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  lawdCd: string
): Promise<{ fetchedMonths: number }> {
  const ymList = getYmList(MONTHS);

  let cacheRow: FetchCacheStatusRow | null = null;
  try {
    cacheRow = await getCacheStatus(supabase, lawdCd, BUILDING_TYPE);
  } catch (err) {
    console.error(`[prewarm: cache status 조회 실패] ${lawdCd}`, err);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const cacheFreshToday =
    !!cacheRow &&
    cacheRow.status === "ready" &&
    !!cacheRow.last_fetched_at &&
    cacheRow.last_fetched_at.slice(0, 10) === todayStr;

  // /api/data와 동일 규칙: 이미 수집된 범위(months_collected) 안이고, 최신월(index 0)은
  // 오늘 이미 갱신된 경우에만 스킵 가능. 나머지는 이번 라운드에 (재)수집한다.
  const monthsToFetch: string[] = [];
  ymList.forEach((ym, i) => {
    const isCurrentMonth = i === 0;
    const withinCollectedWindow = !!cacheRow && i < cacheRow.months_collected;
    const canSkip = withinCollectedWindow && (!isCurrentMonth || cacheFreshToday);
    if (!canSkip) monthsToFetch.push(ym);
  });

  if (monthsToFetch.length === 0) return { fetchedMonths: 0 };

  const allData: AllData = {};
  for (let i = 0; i < monthsToFetch.length; i += CONCURRENCY) {
    const chunk = monthsToFetch.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ym) => {
        try {
          return { ym, data: await collectMonth(lawdCd, ym, BUILDING_TYPE) };
        } catch (err) {
          console.error(`[prewarm: collectMonth 실패] ${lawdCd} ${ym}`, err);
          return { ym, data: EMPTY_MONTH };
        }
      })
    );
    for (const { ym, data } of results) {
      allData[ym] = data;
      try {
        await upsertMonthDeals(supabase, lawdCd, BUILDING_TYPE, ym, data);
      } catch (err) {
        console.error(`[prewarm: deals upsert 실패] ${lawdCd} ${ym}`, err);
      }
    }
  }

  try {
    for (const dealType of ["매매", "전세"] as const) {
      await upsertMonthlyStats(supabase, lawdCd, BUILDING_TYPE, dealType, allData);
    }
    const newMonthsCollected = Math.max(cacheRow?.months_collected ?? 0, MONTHS);
    const oldestYm = ymList[ymList.length - 1];
    await upsertCacheStatus(supabase, lawdCd, BUILDING_TYPE, {
      months_collected: newMonthsCollected,
      last_deal_ym: oldestYm,
      status: "ready",
    });
  } catch (err) {
    console.error(`[prewarm: 영속화 실패] ${lawdCd}`, err);
  }

  return { fetchedMonths: monthsToFetch.length };
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
    return NextResponse.json({ ok: true, processedCount: 0, totalRegions: 0, processed: [] });
  }

  const startTime = Date.now();
  let idx = (await getProgress(supabase)) % regions.length;

  const processed: Array<{ sido: string; gu: string; lawdCd: string; fetchedMonths: number }> = [];
  let count = 0;

  // 한 바퀴(regions.length번) 이상은 돌지 않는다(전부 신선해서 매번 즉시 스킵되는 상황에서도
  // 무한루프 없이 종료). 시간예산을 넘기면 그 자리에서 멈추고 인덱스를 저장해 다음 실행에 이어간다.
  while (count < regions.length && Date.now() - startTime < TIME_BUDGET_MS) {
    const region = regions[idx];
    try {
      const result = await prewarmRegion(supabase, region.lawdCd);
      processed.push({ ...region, fetchedMonths: result.fetchedMonths });
    } catch (err) {
      console.error(`[prewarm: 지역 처리 실패] ${region.sido} ${region.gu}`, err);
    }
    idx = (idx + 1) % regions.length;
    count += 1;
    await saveProgress(supabase, idx);
  }

  return NextResponse.json({
    ok: true,
    processedCount: processed.length,
    nextIndex: idx,
    totalRegions: regions.length,
    elapsedMs: Date.now() - startTime,
    processed,
  });
}
