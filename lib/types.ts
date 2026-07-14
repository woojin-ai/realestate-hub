import type { AptStat, Summary } from "./analyzer";

export type BuildingType = "아파트" | "빌라" | "단독";
export type DealType = "매매" | "전세";

export interface DealsApiResponse {
  lawd_cd: string;
  months: number;
  updatedAt: string;
  summary: Summary;
  aptStatsMaeMae: AptStat[];
  aptStatsJeonse: AptStat[];
}

export interface DealsApiError {
  error: string;
}
