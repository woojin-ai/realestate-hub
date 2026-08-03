// 전국 시세 랭킹 보드(/ranking) 데이터 가공 — 순수 함수만 담당한다(Supabase I/O는
// lib/db-cache.ts의 loadRankingMonthlyStats). docs/design/ranking-board-spec-2026-07-17.md
// §3 데이터 흐름을 그대로 구현한다.

import type { RankingStatsRow } from "./db-cache";
import { pctChange } from "./analyzer";
import { ymMinusMonths } from "./kst";
import { getRegionByLawdCd } from "./regions";

export type RankingSortKey = "avgPrice" | "changePct" | "dealCount";
export type SortDir = "asc" | "desc";

export interface RankingRegionStat {
  lawdCd: string;
  sido: string;
  sidoShort: string;
  gu: string;
  avgPrice: number | null;
  changePct: number | null;
  changeDiff: number | null;
  dealCount: number;
  /** 기준(최근) deal_ym, "YYYYMM". isPending이면 "". */
  refYm: string;
  prevYm: string | null;
  /** avgPrice===null || dealCount===0인 최신월 집계 — 순위 부여 대상에서 제외(집계 준비 중). */
  isPending: boolean;
}

export type RankingDataset = Record<"매매" | "전세", RankingRegionStat[]>;

/**
 * monthly_stats 최근 N개월 원자료(lawd_cd × deal_type × deal_ym) → 지역별 랭킹 행.
 * - current = avg_price!=null 그리고 deal_count>0인 가장 최근 deal_ym(analyzer.ts의
 *   buildSummary currentYm 관례와 동일: 조건을 만족하는 달이 하나도 없으면 isPending).
 * - prev = current의 **바로 직전 달**(kst.ts ymMinusMonths) 행이면서 avg_price!=null인 값.
 *   직전 달이 비어 있으면 더 과거로 내려가지 않고 changePct/changeDiff/prevYm을 null로 둔다.
 *   (buildSummary의 getAvgAt도 2026-08-04부터 같은 관례다 — 목표 달만 보고 폴백하지 않는다.)
 * - 지역명 매칭 실패 코드(REGION_CODES에 없는 lawd_cd)는 오표기 방지를 위해 결과에서
 *   제외한다(스펙 §3-4/§8-1).
 */
export function buildRankingDataset(rows: RankingStatsRow[]): RankingDataset {
  const result: RankingDataset = { 매매: [], 전세: [] };

  for (const dealType of ["매매", "전세"] as const) {
    const byRegion = new Map<string, RankingStatsRow[]>();
    for (const row of rows) {
      if (row.deal_type !== dealType) continue;
      if (!byRegion.has(row.lawd_cd)) byRegion.set(row.lawd_cd, []);
      byRegion.get(row.lawd_cd)!.push(row);
    }

    const stats: RankingRegionStat[] = [];
    for (const [lawdCd, regionRows] of byRegion.entries()) {
      const region = getRegionByLawdCd(lawdCd);
      if (!region) continue;

      // 최신 deal_ym이 먼저 오도록 내림차순 정렬.
      const sorted = [...regionRows].sort((a, b) => (a.deal_ym > b.deal_ym ? -1 : 1));
      const current = sorted.find((r) => r.avg_price !== null && r.deal_count > 0);

      if (!current) {
        stats.push({
          lawdCd,
          sido: region.sido,
          sidoShort: region.sidoShort,
          gu: region.gu,
          avgPrice: null,
          changePct: null,
          changeDiff: null,
          dealCount: 0,
          refYm: "",
          prevYm: null,
          isPending: true,
        });
        continue;
      }

      // ⚠️ prev는 current의 **바로 직전 달**일 때만 채택한다. monthly_stats에는 중간 달
      // 행이 통째로 비어 있는 지역이 실제로 존재해서(2026-07-27 실측: 변화율이 산출된
      // 129개 계열 중 10개가 202607 vs 202604, 즉 3개월 간격이었다 — 부산 서구/동래구,
      // 성남 중원구, 이천시, 대전 중구의 매매·전세), "current보다 과거인 가장 가까운 유효
      // 행"을 쓰면 3개월 변화율이 1개월 변화율들과 같은 순위표·"전월 대비" TOP10에 섞여
      // 순위 자체가 왜곡된다(라이브에서 대전 중구 +6.25%가 매매 상승 10위에 올라 있었다).
      // 직전 달 행이 없거나 그 달 avg_price가 null이면 더 과거로 내려가지 않고 변화율을
      // 비운다. 행 자체는 살린다 — 평균가·거래량은 정상값이라 계속 노출한다(changePct===null
      // 은 RankingTable에서 "데이터 없음"으로 렌더되고 RankingBoard의 TOP10 집계에서 제외된다).
      //
      // ⚠️ 직전 달 계산은 `lib/kst.ts ymMinusMonths`로 한다. 원래 이 파일에 1개월 전용
      // 사본(`prevYmOf`)이 있었는데, 2026-08-04 라운드 56에서 buildSummary도 같은 산술이
      // 필요해지면서(임의 기준월 − N개월) 일반화해 kst.ts로 옮겼다. 사본을 다시 만들지
      // 마라 — `new Date().setMonth()` 계열의 말일 롤오버 버그가 파일마다 따로 재발한다.
      // 동작은 동일하다(`ymMinusMonths(ym, 1)` ≡ 옛 `prevYmOf(ym)`, 000000~999999 전수
      // 대조 + 비정상 입력 대조로 확인. 둘 다 검증 실패 시 null 반환 정책도 같다).
      const expectedPrevYm = ymMinusMonths(current.deal_ym, 1);
      const prev =
        expectedPrevYm === null
          ? undefined
          : sorted.find((r) => r.deal_ym === expectedPrevYm && r.avg_price !== null);
      const changePct = pctChange(current.avg_price, prev?.avg_price ?? null);
      const changeDiff =
        current.avg_price !== null && prev?.avg_price != null
          ? current.avg_price - prev.avg_price
          : null;

      stats.push({
        lawdCd,
        sido: region.sido,
        sidoShort: region.sidoShort,
        gu: region.gu,
        avgPrice: current.avg_price,
        changePct,
        changeDiff,
        dealCount: current.deal_count,
        refYm: current.deal_ym,
        prevYm: prev?.deal_ym ?? null,
        isPending: false,
      });
    }

    // 클라이언트 정렬 전 기본 순서(가나다순) — RegionSelector 관례(localeCompare "ko")와 동일.
    stats.sort((a, b) => a.gu.localeCompare(b.gu, "ko"));
    result[dealType] = stats;
  }

  return result;
}

/** 헤더에 표기할 대표 기준월 — 매매/전세 전체 활성(비-집계중) 지역의 refYm 중 최댓값. */
export function getReferenceMonth(dataset: RankingDataset): string | null {
  let latest: string | null = null;
  for (const dealType of ["매매", "전세"] as const) {
    for (const stat of dataset[dealType]) {
      if (stat.isPending) continue;
      if (!latest || stat.refYm > latest) latest = stat.refYm;
    }
  }
  return latest;
}
