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

/**
 * 지역 하나(lawdCd)의 대시보드 데이터를 프리워밍한다.
 * /api/data(app/api/data/route.ts)의 캐시-우선 로직과 동일한 기준(fetch_cache_status)으로
 * "이미 오늘 신선한지"를 판단해, 신선하지 않은 개월만 국토부 API로 채우고 deals/monthly_stats/
 * fetch_cache_status를 upsert한다. 읽기(loadMonthFromDb)는 필요 없다 — 프리워밍은 쓰기 전용.
 */
async function prewarmRegion(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  lawdCd: string,
  deadline: number
): Promise<{ fetchedMonths: number; incomplete: boolean; monthsCollected: number }> {
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const cacheFreshToday =
    !!cacheRow &&
    cacheRow.status === "ready" &&
    !!cacheRow.last_fetched_at &&
    cacheRow.last_fetched_at.slice(0, 10) === todayStr;

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

  if (monthsToFetch.length === 0) {
    return { fetchedMonths: 0, incomplete: false, monthsCollected: baseCollected };
  }

  const allData: AllData = {};
  let fetchedCount = 0;
  let incomplete = false;
  // 캐시 포이즈닝 방지: molit fetch가 실제로 실패한 달(레이트리밋/타임아웃 등)이 하나라도
  // 있으면, 그 지역을 이번 실행에서 "ready(완료)"로 확정하지 않는다(다음 크론이 재시도).
  // 대형 지역(예: 화성 41590)이 레이트리밋에 걸려도 빈 데이터가 완료로 굳는 걸 막는 핵심.
  let anyFailed = false;
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
    for (const { ym, idx, data, failed } of results) {
      allData[ym] = data;
      if (failed) anyFailed = true;
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

  // 예산 초과로 중간에 끊었으면(incomplete) 이번 지역은 13개월 전체를 못 채웠으므로
  // monthly_stats/cache status를 "ready"로 확정하지 않는다 — 이미 개별 upsertMonthDeals된
  // deals 행과 위에서 배치마다 갱신한 months_collected는 남아 있으니(다음 실행에서 같은
  // 달을 다시 upsert해도 멱등이라 안전) 손실은 없고, 다음 크론 실행이 이 지역을
  // (부분 진행된 지점부터, 남은 개월만) 이어받는다.
  //
  // 추가로 anyFailed(레이트리밋/타임아웃 등으로 실제로 실패한 달이 하나라도 있음)일 때도
  // "ready"로 확정하지 않는다 — 화성 41590처럼 완주(!incomplete)했더라도 빈/부분 데이터를
  // 완료로 굳히면 이후 조회가 그 캐시를 재사용해 0건이 고착되기 때문(포이즈닝의 핵심 원인).
  // 실패 지점까지만 반영된 months_collected("collecting")를 남겨 다음 크론이 재시도한다.
  if (!incomplete && !anyFailed) {
    try {
      for (const dealType of ["매매", "전세"] as const) {
        await upsertMonthlyStats(supabase, lawdCd, BUILDING_TYPE, dealType, allData);
      }
      const newMonthsCollected = Math.max(baseCollected, MONTHS);
      const oldestYm = ymList[ymList.length - 1];
      await upsertCacheStatus(supabase, lawdCd, BUILDING_TYPE, {
        months_collected: newMonthsCollected,
        last_deal_ym: oldestYm,
        status: "ready",
      });
      currentMonthsCollected = newMonthsCollected;
    } catch (err) {
      console.error(`[prewarm: 영속화 실패] ${lawdCd}`, err);
    }
  }

  return { fetchedMonths: fetchedCount, incomplete, monthsCollected: currentMonthsCollected };
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
  const deadline = startTime + TIME_BUDGET_MS;
  let idx = (await getProgress(supabase)) % regions.length;

  const processed: Array<{
    sido: string;
    gu: string;
    lawdCd: string;
    fetchedMonths: number;
    incomplete?: boolean;
    monthsCollected?: number;
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
      });
    } catch (err) {
      console.error(`[prewarm: 지역 처리 실패] ${region.sido} ${region.gu}`, err);
    }
    count += 1;
    // incomplete(예산 초과로 중간에 끊긴 지역)이면 인덱스를 전진시키지 않는다 — 다음 실행이
    // 같은 지역부터 이어받아 나머지 개월을 마저 채우도록 한다. 어차피 이번 루프는 시간예산도
    // 이미 다 썼을 것이므로(그래서 incomplete가 됐으므로) 곧바로 while 조건에서 빠져나간다.
    if (!incomplete) {
      idx = (idx + 1) % regions.length;
    }
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
