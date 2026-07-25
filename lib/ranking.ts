// 전국 시세 랭킹 보드(/ranking) 데이터 가공 — 순수 함수만 담당한다(Supabase I/O는
// lib/db-cache.ts의 loadRankingMonthlyStats). docs/design/ranking-board-spec-2026-07-17.md
// §3 데이터 흐름을 그대로 구현한다.

import type { RankingStatsRow } from "./db-cache";
import { pctChange } from "./analyzer";
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
 * - prev = current 바로 아래(더 과거) deal_ym 중 avg_price!=null인 첫 값.
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

      const prev = sorted.find((r) => r.deal_ym < current.deal_ym && r.avg_price !== null);
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
