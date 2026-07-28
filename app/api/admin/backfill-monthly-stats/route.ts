// 관리자용 monthly_stats 결측 백필 엔드포인트 (2026-07-28, 1회성 운영 복구)
// 정본 스펙: docs/planning/monthly-stats-backfill-2026-07-28.md (§2-2 · §2-3 · §3)
//
// ── 무엇을 고치는가 ─────────────────────────────────────────────────────
// monthly_stats의 기대집합은 114지역 × 13개월 × 2유형(매매·전세) = 2,964셀인데 실제로는
// 2,240행뿐이고 724셀이 비어 있다(2026-07-27 마스터 실측). 원인은 프리워밍이 "그 실행에서
// 실제로 fetch한 달"의 stats만 쓰고, 그마저도 무결 실행(!incomplete && !anyFailed)에만
// 썼기 때문이다. 재발 방지는 W1(app/api/cron/prewarm/route.ts)이 맡고, **이미 생겨버린
// 구멍을 메우는 것이 이 라우트(W2)**다.
//
// ── 왜 프리워밍에 얹지 않고 전용 라우트인가 (기획안 §2-2) ────────────────
//  • 복구 소요: 프리워밍은 1일 1회 3지역이라 49개 결측 지역을 한 바퀴 도는 데 5주+가 걸린다.
//    이 라우트는 **국토부 API를 한 번도 부르지 않으므로**(원자료 deals는 이미 DB에 있다 —
//    §1-4) 병목이 Supabase 읽기뿐이라 실행당 10~20지역, 3~5회 수동 호출로 당일 종료된다.
//  • 사고 격리: 크론에 얹으면 버그가 매일 자동으로 확산되고 야간 순회까지 같이 죽는다.
//    수동 전용이면 "호출을 멈추면 끝"이다. → vercel.json 크론에 **등록하지 않는다.**
//  • dry-run: 상시 크론에는 검증 모드를 넣을 수 없다. QA V1(재계산 대조)이 이 라우트를 쓴다.
//
// ── 진행 상태를 저장하지 않는다(무상태) ──────────────────────────────────
// 매 실행 시작 시 결측 집합을 **다시 계산**한다. 직전 실행이 메운 셀은 다음 실행의 결측
// 집합에서 자동으로 빠지므로 진행 인덱스 테이블이 필요 없다. 신규 테이블 = 사용자 수동 SQL
// 마이그레이션인데, 그 대기열에는 결정 #3-(b)가 이미 5라운드째 잠겨 있다(§2-3). 덤으로
// 멱등(중복 호출·중간 실패·순서 무관)이 되고, 결측이 비면 remaining:0으로 자기 종료한다.
//
// ── add-only (기존 행은 한 행도 수정하지 않는다) ─────────────────────────
// 결측 셀만 write한다. upsertMonthlyStats는 buildMonthlyStats(allData) 결과를 그대로 쓰는데,
// **buildMonthlyStats는 넘겨받은 allData의 키만 순회한다**(lib/analyzer.ts:245의
// `for (const [ym, monthData] of Object.entries(allData))`). 따라서 결측 달만 담은 allData를
// 넘기면 넘기지 않은 달의 기존 행은 구조적으로 건드려지지 않는다 — add-only가 이 성질에
// 의존한다. ⚠️ analyzer.ts의 그 순회를 "창 전체를 채워 넣는" 식으로 바꾸면 이 보장이 조용히
// 깨진다(그때는 computed_at 증거도 함께 사라진다 — §6-1).
//
// 보호: reset-cache/prewarm과 동일하게 CRON_SECRET(checkAuth). 미설정 시 항상 거부.
// GET/POST 동일 핸들러(reset-cache 관례 그대로) — 수동 curl 편의.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { loadMonthFromDb, upsertMonthlyStats } from "@/lib/db-cache";
import { buildMonthlyStats, type AllData } from "@/lib/analyzer";
import { getYmList, type MonthData } from "@/lib/molit-api";
import {
  STATS_DEAL_TYPES,
  countPresentCells,
  findAsymmetricStatsMonths,
  findMissingStatsMonths,
  indexStatsCells,
  listAllRegionCodes,
  loadMonthlyStatsCells,
  type MonthlyStatsCell,
  type StatsDealType,
} from "@/lib/monthly-stats-gaps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 서버리스 하드리밋. 내부 시간예산은 이보다 여유를 두고 짧게 잡는다(prewarm과 동일한 이중 안전장치).
export const maxDuration = 60;

const MONTHS = 13; // 대시보드(/api/data)·프리워밍의 수집 창과 동일해야 기대집합이 맞는다
const TIME_BUDGET_MS = 25_000; // prewarm route와 동일한 값/동일한 이유(60s 하드리밋 대비 보수적)
const BUILDING_TYPE = "아파트" as const; // 프리워밍이 아파트 고정이라 monthly_stats도 아파트만 존재
const DEFAULT_LIMIT = 5; // 기본값을 작게 둬 실수로 호출해도 폭주하지 않게 한다(§6-6)
// avg_price는 numeric 왕복(문자열 ↔ 숫자)이 있어 완전일치를 요구할 수 없다. 상대오차 기준으로
// 비교한다(문자열 비교 금지 — loadRankingMonthlyStats가 Number() 변환을 하는 것과 같은 사유).
const AVG_REL_TOLERANCE = 1e-9;

// CRON_SECRET 미설정 시 항상 거부(안전 기본값) — prewarm/reset-cache의 checkAuth와 동일.
function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  const queryKey = request.nextUrl.searchParams.get("secret");
  return queryKey === secret;
}

interface RecomputedStat {
  avg: number | null;
  count: number;
}

interface MismatchReport {
  ym: string;
  dealType: StatsDealType;
  db: {
    avg: number | null;
    count: number;
    // ⚠️ computed_at은 반드시 싣는다. QA는 이 값으로 "07-20 dedupe 기준 통일 이전에 쓰인 행"과
    // 이후 행을 사후에 갈라 판정한다(§5 V1). 경계 시각은 QA가 git log로 확정하므로 코드에
    // 상수로 박지 않는다 — 하루만 어긋나도 판정이 뒤집힌다.
    computedAt: string | null;
  };
  recomputed: RecomputedStat;
}

interface RegionReport {
  lawdCd: string;
  /** 실제로 쓴(= dry-run이면 "썼을") 달. 월 단위이며 셀 수는 이 값 × 2(매매·전세)다. */
  monthsWritten: string[];
  /** §3 빈 달 규칙으로 건너뛴 달 — 이 목록이 "백필로 복구되지 않은 잔여 결측"의 정본이다(보강 2). */
  monthsSkippedEmpty: string[];
  /** include_existing일 때 기존 행과 대조한 셀 수(대조 성공/실패 무관). */
  cellsCompared: number;
  mismatches: MismatchReport[];
  /** 시간예산으로 이 지역 처리가 중간에 끊겼는지 — true면 이 지역은 다음 실행이 다시 잡는다. */
  truncated: boolean;
  errors?: string[];
}

/** 두 값이 "같다"고 볼 수 있는지 — deal_count는 완전일치, avg_price는 상대오차 기준(§5 V1-3). */
function isCellMismatch(dbCell: MonthlyStatsCell, recomputed: RecomputedStat): boolean {
  if (dbCell.dealCount !== recomputed.count) return true;
  const a = dbCell.avgPrice;
  const b = recomputed.avg;
  if (a === null || b === null) return a !== b;
  if (a === b) return false;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  return denom > 0 && Math.abs(a - b) / denom > AVG_REL_TOLERANCE;
}

/** 한 달치 MonthData로부터 매매·전세 stats를 재계산한다(백필이 실제로 쓰게 될 값과 동일 경로). */
function recomputeMonth(ym: string, data: MonthData): Record<StatsDealType, RecomputedStat> {
  const single: AllData = { [ym]: data };
  const out = {} as Record<StatsDealType, RecomputedStat>;
  for (const dealType of STATS_DEAL_TYPES) {
    // 백필이 쓰는 값과 대조값이 갈라지지 않도록 반드시 같은 함수(buildMonthlyStats)를 경유한다.
    out[dealType] = buildMonthlyStats(single, dealType)[ym] ?? { avg: null, count: 0 };
  }
  return out;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dry_run") === "1";
  const includeExisting = params.get("include_existing") === "1";
  const limit = Math.max(1, parsePositiveInt(params.get("limit"), DEFAULT_LIMIT));
  // offset: 기획안 파라미터 표에는 없지만 추가한다. 이유 둘.
  //  ① V1(include_existing 전수 대조)은 114지역 × 13개월 = 1,482회 loadMonthFromDb라 25s
  //     예산 안에 절대 안 들어간다. 무상태 설계라 매 실행이 처음부터 다시 스캔하므로,
  //     offset 없이는 **몇 번을 호출해도 앞의 같은 지역만 반복 대조**하고 뒤쪽은 영영 못 본다.
  //  ② 빈 달(§3)만 남은 지역은 write 모드에서도 계속 후보로 남는다. 그런 지역이 후보 앞쪽에
  //     limit개 몰리면 진행이 막히는데, offset으로 건너뛸 수 있다.
  const offset = parsePositiveInt(params.get("offset"), 0);
  const lawdCdParam = params.get("lawd_cd");

  // include_existing은 "이미 있는 셀을 재계산해 비교"하는 검증 모드다. 쓰기 모드와 섞으면
  // 대조 대상이 그 실행 안에서 갱신될 여지가 생기므로(그리고 기획안이 dry-run 전용으로
  // 못박았으므로) 조합 자체를 거부한다 — 조용히 dry-run으로 강등하면 호출자가 자기가
  // 무엇을 실행했는지 오해한다.
  if (includeExisting && !dryRun) {
    return NextResponse.json(
      { error: "include_existing=1은 dry_run=1과 함께만 사용할 수 있습니다(쓰기 금지 검증 모드)" },
      { status: 400 }
    );
  }

  const allRegions = listAllRegionCodes();
  let scopeRegions = allRegions;
  if (lawdCdParam) {
    if (!/^\d{5}$/.test(lawdCdParam)) {
      return NextResponse.json({ error: "lawd_cd는 5자리 숫자여야 합니다" }, { status: 400 });
    }
    if (!allRegions.includes(lawdCdParam)) {
      return NextResponse.json(
        { error: `lawd_cd=${lawdCdParam}는 lib/regions.ts에 없는 지역입니다` },
        { status: 400 }
      );
    }
    scopeRegions = [lawdCdParam];
  }

  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[backfill-monthly-stats: Supabase 미구성]", err);
    return NextResponse.json({ error: "supabase 미구성" }, { status: 500 });
  }

  const startTime = Date.now();
  const deadline = startTime + TIME_BUDGET_MS;

  // ── 1) 결측 스캔 ──────────────────────────────────────────────────────
  // ymList는 index 0이 최신월, 마지막이 최고령월. 창의 하한(sinceYm)이 곧 기대집합의 월 축이다.
  const ymList = getYmList(MONTHS);
  const sinceYm = ymList[ymList.length - 1];

  let cells: MonthlyStatsCell[];
  try {
    cells = await loadMonthlyStatsCells(
      supabase,
      BUILDING_TYPE,
      sinceYm,
      lawdCdParam ?? undefined
    );
  } catch (err) {
    console.error("[backfill-monthly-stats: monthly_stats 스캔 실패]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const index = indexStatsCells(cells);
  const expected = scopeRegions.length * ymList.length * STATS_DEAL_TYPES.length;
  const present = countPresentCells(index, scopeRegions, ymList);
  // 쌍 대칭 전제(§1-1) 검증용. 정상이면 빈 배열이어야 한다. 응답이 비대해지지 않게 상한을 둔다.
  const asymmetric = findAsymmetricStatsMonths(index, scopeRegions, ymList).slice(0, 50);

  const missingByRegion = new Map<string, string[]>();
  for (const lawdCd of scopeRegions) {
    const missing = findMissingStatsMonths(index, lawdCd, ymList);
    if (missing.length > 0) missingByRegion.set(lawdCd, missing);
  }

  // 후보 지역 순서는 lib/regions.ts 삽입 순서 그대로 — 무상태 설계에서 실행 간 순서가 흔들리면
  // offset의 의미가 깨지고 같은 지역을 반복 처리하게 된다.
  // include_existing(검증 모드)은 결측이 없는 지역도 대조해야 하므로 창 안 지역 전체가 후보다.
  const candidates = includeExisting
    ? scopeRegions
    : scopeRegions.filter((code) => missingByRegion.has(code));

  // ── 2) 지역별 처리 ────────────────────────────────────────────────────
  const regionReports: RegionReport[] = [];
  let cursor = Math.min(offset, candidates.length);

  while (
    cursor < candidates.length &&
    regionReports.length < limit &&
    Date.now() < deadline
  ) {
    const lawdCd = candidates[cursor];
    const missingMonths = missingByRegion.get(lawdCd) ?? [];
    // 대조 대상: 이미 행이 있는 달(= 결측이 아닌 달). include_existing일 때만 채운다.
    const compareMonths = includeExisting
      ? ymList.filter((ym) => !missingMonths.includes(ym))
      : [];

    const report: RegionReport = {
      lawdCd,
      monthsWritten: [],
      monthsSkippedEmpty: [],
      cellsCompared: 0,
      mismatches: [],
      truncated: false,
    };
    const errors: string[] = [];
    // 이 지역에서 실제로 쓸 달만 담는다 — 여기 담기지 않은 달의 기존 행은 buildMonthlyStats가
    // 순회조차 하지 않으므로 그대로 보존된다(파일 상단 add-only 설명 참고).
    const dataToWrite: AllData = {};

    // 결측 달(쓰기 후보) + 대조 달(검증 전용)을 ymList 순서로 한 번씩만 읽는다.
    const targetMonths = ymList.filter(
      (ym) => missingMonths.includes(ym) || compareMonths.includes(ym)
    );

    for (const ym of targetMonths) {
      if (Date.now() >= deadline) {
        report.truncated = true;
        break;
      }
      let monthData: MonthData;
      try {
        // loadMonthFromDb 한 번이 매매·전세·월세를 모두 돌려주므로 유형별 재조회가 없고,
        // §3 빈 달 판정에 필요한 월세 정보까지 같이 온다. 또 이 함수가 building_type으로
        // 이미 필터하므로 "아파트 한정 판정"(§3 보강 1)이 자동으로 지켜진다 —
        // 별도 카운트 쿼리를 만들지 말 것(같은 기준이 두 벌 생긴다).
        monthData = await loadMonthFromDb(supabase, lawdCd, BUILDING_TYPE, ym);
      } catch (err) {
        console.error(`[backfill-monthly-stats: deals 조회 실패] ${lawdCd} ${ym}`, err);
        errors.push(`${ym}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      const recomputed = recomputeMonth(ym, monthData);

      if (missingMonths.includes(ym)) {
        // ── §3 빈 달 규칙 ────────────────────────────────────────────────
        // 그 달의 deals가 매매·전세·월세 통틀어 0행이면 건너뛴다. DB만으로는 "실제로 거래
        // 0건인 달"과 "수집이 안 된 달"을 구분할 수 없고, 후자에 {avg:null, count:0}을
        // 쓰면 **검증 불가능한 주장을 사실처럼 확정 기록**하게 된다(되돌릴 근거가 그 시점엔
        // 이미 없다). 반대로 건너뛰기의 최악은 "채울 수 있었던 셀을 안 채운다"(= 현행 유지,
        // 화면 영향 0)라 오류비용이 비대칭이다 — 되돌릴 수 없는 쪽을 피한다.
        // 월세를 판정에 넣는 것이 핵심이다: 수집 여부의 증거는 거래유형과 무관하므로
        // 매매·전세만 보면 "월세만 있었던 달"을 미수집으로 오판해 건너뛴다.
        // 반대로 1건이라도 있으면 매매·전세 **두 유형 모두** 쓴다 — 한쪽 유형만 0건인 것은
        // (소규모 시·군의 아파트 매매 0건 등) 정상이고, 그때의 {null, 0}은 참인 진술이다.
        const dealRows =
          monthData.매매.length + monthData.전세.length + monthData.월세.length;
        if (dealRows === 0) {
          report.monthsSkippedEmpty.push(ym);
        } else {
          dataToWrite[ym] = monthData;
          report.monthsWritten.push(ym);
        }
      }

      if (compareMonths.includes(ym)) {
        const byType = index.get(lawdCd)?.get(ym);
        for (const dealType of STATS_DEAL_TYPES) {
          const dbCell = byType?.get(dealType);
          if (!dbCell) continue;
          report.cellsCompared += 1;
          if (isCellMismatch(dbCell, recomputed[dealType])) {
            report.mismatches.push({
              ym,
              dealType,
              db: { avg: dbCell.avgPrice, count: dbCell.dealCount, computedAt: dbCell.computedAt },
              recomputed: recomputed[dealType],
            });
          }
        }
      }
    }

    // ── 쓰기 ──────────────────────────────────────────────────────────
    // dry_run이면 여기서 아무것도 하지 않는다(monthsWritten은 "썼을 달"의 예고 목록이 된다).
    // fetch_cache_status는 손대지 않는다 — 백필은 수집이 아니라 이미 적재된 deals의 재요약이다.
    if (!dryRun && Object.keys(dataToWrite).length > 0) {
      try {
        for (const dealType of STATS_DEAL_TYPES) {
          await upsertMonthlyStats(supabase, lawdCd, BUILDING_TYPE, dealType, dataToWrite);
        }
      } catch (err) {
        console.error(`[backfill-monthly-stats: stats upsert 실패] ${lawdCd}`, err);
        errors.push(`upsert: ${err instanceof Error ? err.message : String(err)}`);
        // 쓰기가 실패했으면 "썼다"고 보고하지 않는다(V3 행 수 대조가 어긋나면 안 된다).
        // 무상태 설계라 다음 실행이 같은 지역을 다시 후보로 잡아 재시도한다.
        report.monthsWritten = [];
      }
    }

    if (errors.length > 0) report.errors = errors;
    regionReports.push(report);
    // 시간예산으로 끊긴 지역은 커서를 전진시키지 않는다 — nextOffset이 그 지역을 다시 가리켜
    // 다음 호출이 남은 달을 이어받는다(prewarm이 incomplete 지역에서 인덱스를 붙잡아 두는 것과
    // 같은 규칙). 이번 실행에서 이미 쓴 달은 다음 스캔에서 결측이 아니므로 중복 작업이 아니다.
    if (report.truncated) break;
    cursor += 1;
  }

  const cellsWritten = regionReports.reduce(
    (a, r) => a + r.monthsWritten.length * STATS_DEAL_TYPES.length,
    0
  );

  return NextResponse.json({
    ok: true,
    dryRun,
    includeExisting,
    params: { limit, offset, lawdCd: lawdCdParam ?? null },
    window: { months: MONTHS, sinceYm, latestYm: ymList[0] },
    scanned: {
      expected,
      present,
      missing: expected - present,
      missingRegions: missingByRegion.size,
      // 정상이면 항상 빈 배열(§1-1 쌍 대칭 전제). 비어 있지 않으면 QA V0-2에서 중단·보고 대상.
      asymmetric,
    },
    processedRegions: regionReports.length,
    regions: regionReports,
    totals: {
      cellsWritten,
      monthsSkippedEmpty: regionReports.reduce((a, r) => a + r.monthsSkippedEmpty.length, 0),
      cellsCompared: regionReports.reduce((a, r) => a + r.cellsCompared, 0),
      mismatches: regionReports.reduce((a, r) => a + r.mismatches.length, 0),
    },
    candidateRegions: candidates.length,
    // 이번 실행이 손대지 못하고 남긴 후보 지역 수. 0이면 이번 스캔 기준으로는 더 부를 필요가 없다.
    // ⚠️ 다만 빈 달(§3)만 남은 지역은 다음 실행에서도 다시 후보로 잡힌다(그 달은 영원히 못 채운다).
    // 그래서 최종 종료 판정은 "remaining===0" 하나가 아니라 **totals.cellsWritten===0까지 함께**
    // 본다 — 아무것도 새로 쓰지 않은 실행이 나오면 복구가 끝난 것이다.
    remaining: Math.max(0, candidates.length - cursor),
    // ⚠️ **읽기 전용 모드(dry_run / include_existing)에서만 이어받기 커서로 쓸 것.**
    // 쓰기 모드에서 이 값을 다음 호출에 넘기면 지역을 건너뛴다 — 무상태 설계라 매 실행이
    // 결측을 다시 스캔하는데, 방금 채운 지역은 후보 목록에서 빠지므로(49→44…) 후보 배열이
    // 앞에서부터 줄어든다. 거기에 offset을 다시 얹으면 아직 안 채운 지역을 건너뛴 채
    // remaining이 0으로 떨어져 "끝났다"는 오판이 난다(2026-07-28 QA 적출).
    // → 쓰기 모드는 항상 offset 없이(=0) 반복 호출하고, 종료는 위 :380의 기준
    //   (totals.cellsWritten===0)으로 판정한다.
    nextOffset: cursor,
    elapsedMs: Date.now() - startTime,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
