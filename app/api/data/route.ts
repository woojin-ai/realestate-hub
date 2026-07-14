import { NextResponse, type NextRequest } from "next/server";
import { collectMonth, getYmList, type MonthData } from "@/lib/molit-api";
import { buildSummary, buildAptStats, type AllData } from "@/lib/analyzer";

// 국토부 API는 매 요청 최신 신고분을 반영해야 하므로 이 라우트는 캐시하지 않는다.
// (Next 16, Cache Components 미사용 → 'Previous Model'의 route segment config가 유효)
export const dynamic = "force-dynamic";
// 이번 라운드는 아파트 매매/전세만 지원(빌라/단독은 다음 라운드). Node 런타임(기본)에서 실행.
export const runtime = "nodejs";

const DEFAULT_MONTHS = 13;
const MAX_MONTHS = 24; // 남용/타임아웃 방지 상한
// 국토부 API 부하·서버리스 타임아웃을 고려해 월별 호출은 소규모 병렬(3개씩) 배치로 처리한다.
const CONCURRENCY = 3;
const EMPTY_MONTH: MonthData = { 매매: [], 전세: [], 월세: [] };

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lawdCd = searchParams.get("lawd_cd");
  const monthsRaw = searchParams.get("months");

  // ── 입력 검증 ────────────────────────────────────────────────
  if (!lawdCd || !/^\d{5}$/.test(lawdCd)) {
    return NextResponse.json(
      { error: "lawd_cd(법정동 시군구코드, 5자리 숫자)가 필요합니다." },
      { status: 400 }
    );
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

  // ── 최근 N개월 수집 (배치 병렬) ─────────────────────────────
  const ymList = getYmList(months);
  const allData: AllData = {};

  for (let i = 0; i < ymList.length; i += CONCURRENCY) {
    const chunk = ymList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ym) => {
        // molit-api가 개별 예외를 흡수하지만, 예기치 못한 throw로 배치 전체가
        // reject되지 않도록 월 단위로 한 번 더 가드한다(부분 데이터라도 반환).
        try {
          return { ym, data: await collectMonth(lawdCd, ym) };
        } catch (err) {
          console.error(`[collectMonth 실패] ym=${ym}`, err);
          return { ym, data: EMPTY_MONTH };
        }
      })
    );
    for (const { ym, data } of results) {
      allData[ym] = data;
    }
  }

  // ── 통계 집계 (analyzer.ts 재사용) ───────────────────────────
  return NextResponse.json({
    lawd_cd: lawdCd,
    months,
    summary: buildSummary(allData),
    aptStatsMaeMae: buildAptStats(allData, "매매"),
    aptStatsJeonse: buildAptStats(allData, "전세"),
    updatedAt: new Date().toISOString(),
  });
}
