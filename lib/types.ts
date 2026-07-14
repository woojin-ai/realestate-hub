import type { AptStat, Summary } from "./analyzer";

// BuildingType은 최하위 모듈(molit-api.ts)에서 단일 정의하고 여기서 재수출한다.
// (순환참조 방지: types.ts → analyzer.ts → molit-api.ts 방향 유지)
export type { BuildingType } from "./molit-api";
import type { BuildingType } from "./molit-api";

export type DealType = "매매" | "전세";

// 캐시 상태 구분: cache=DB 캐시로만 응답, live=전부 국토부 API 새로 호출,
// partial=일부는 DB 캐시·일부는 새로 호출(점진적 수집). Supabase 연동 실패 시에도
// 항상 응답은 반환되므로(성능/영속화 부가정보일 뿐) 기존 화면 컴포넌트는 이 필드를
// 몰라도 정상 동작한다.
export type FetchSource = "cache" | "live" | "partial";

export interface DealsApiResponse {
  lawd_cd: string;
  months: number;
  building_type: BuildingType;
  updatedAt: string;
  summary: Summary;
  aptStatsMaeMae: AptStat[];
  aptStatsJeonse: AptStat[];
  source: FetchSource;
}

export interface DealsApiError {
  error: string;
}
