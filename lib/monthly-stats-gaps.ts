// monthly_stats "결측 셀" 스캔 헬퍼 (2026-07-28, docs/planning/monthly-stats-backfill-2026-07-28.md)
//
// ── 왜 별도 파일인가 ────────────────────────────────────────────────────
// 이 스캔은 두 곳에서 똑같이 필요하다.
//   (W1) app/api/cron/prewarm/route.ts — 지역 처리 시작 시 "창 안인데 stats 행이 없는 달"을
//        찾아 DB에서 읽어 집계 입력에 합류시킨다(재발 방지).
//   (W2) app/api/admin/backfill-monthly-stats/route.ts — 전 지역 결측 셀을 한 번에 스캔해
//        1회성으로 메운다(이미 생긴 724셀 복구).
// 두 곳에 따로 구현하면 "무엇을 결측으로 보는가"의 기준이 갈라져, 한쪽이 메운 셀을 다른 쪽이
// 계속 결측으로 보거나 그 반대가 된다. 기준은 반드시 이 파일 한 곳만 경유한다.
//
// ⚠️ lib/db-cache.ts에 넣지 않는다. 그 파일은 결정 #3-(b)(cdeal_type 컬럼) 대기로 5라운드째
// 미커밋 보류 상태라, 여기에 신규 코드를 섞으면 스테이징 분리가 불가능해진다
// (기획안 §2-3 "파일 배치 주의"). 필요한 함수(loadMonthFromDb/upsertMonthlyStats)는 전부
// 이미 export돼 있으므로 그 파일은 한 줄도 건드리지 않는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuildingType } from "./molit-api";
import { REGION_CODES } from "./regions";

// monthly_stats에 실제로 쓰이는 거래유형은 매매·전세 둘뿐이다(월세는 집계 대상이 아니다).
// upsertMonthlyStats 호출부가 전부 이 두 유형 루프 안에 있어, 한쪽 유형만 존재하는 셀은
// 구조적으로 생기지 않는다(기획안 §1-1). findAsymmetricStatsMonths가 그 전제를 검증한다.
export const STATS_DEAL_TYPES = ["매매", "전세"] as const;
export type StatsDealType = (typeof STATS_DEAL_TYPES)[number];

// PostgREST 기본 조회 행 수 제한(1000) — lib/db-cache.ts의 PAGE_SIZE와 같은 값/같은 이유.
const PAGE_SIZE = 1000;

/** monthly_stats 한 행(셀)을 스캔 목적에 맞게 정규화한 형태. */
export interface MonthlyStatsCell {
  lawdCd: string;
  dealType: StatsDealType;
  dealYm: string;
  /** numeric 컬럼이라 드라이버 설정에 따라 문자열로 올 수 있어 Number()로 정규화한다
   *  (loadRankingMonthlyStats:436과 동일한 사유 — dry-run 대조에서 문자열 비교 금지). */
  avgPrice: number | null;
  dealCount: number;
  /** add-only 검증·V1 판정 경계(기획안 §5 V1)에 쓰이는 증거 컬럼. 절대 가공하지 않고 원문 그대로 싣는다. */
  computedAt: string | null;
}

/** lawdCd → deal_ym → dealType → 셀. "존재 여부"와 "기존 값"을 한 자료구조로 본다. */
export type StatsPresenceIndex = Map<string, Map<string, Map<StatsDealType, MonthlyStatsCell>>>;

/**
 * lib/regions.ts의 전 지역 법정동 시군구코드를 REGION_CODES 삽입 순서 그대로 평탄화한다.
 * 백필의 "기대집합"(114지역 × 13개월 × 2유형)의 지역 축이 바로 이 목록이다.
 * (prewarm route의 buildRegionList는 시/도·구 이름까지 함께 돌려주는 응답 보고용이라
 *  형태가 다르다 — 그쪽을 이 함수로 바꾸는 리팩토링은 이번 범위 밖이라 하지 않는다.)
 */
export function listAllRegionCodes(): string[] {
  const list: string[] = [];
  for (const info of Object.values(REGION_CODES)) {
    for (const code of Object.values(info.구)) {
      list.push(code);
    }
  }
  return list;
}

/**
 * monthly_stats에서 창(sinceYm 이상) 안의 셀을 전량 읽는다.
 * lawdCd를 주면 그 지역 하나만(프리워밍용 소형 쿼리), 안 주면 전 지역(백필 스캔용).
 *
 * ⚠️ .order()를 명시적으로 건다 — 기존 페이지네이션 루프(loadMonthFromDb·
 * loadRankingMonthlyStats)는 정렬 없이 range()만 쓰지만, 그쪽은 "읽어서 보여주는" 용도라
 * 페이지 경계에서 행이 한둘 섞여도 결과가 같다. 여기서는 다르다 — 정렬이 없으면 PostgREST가
 * 페이지마다 다른 순서를 돌려줄 수 있고, 그러면 **어떤 행이 두 페이지에서 다 빠져 "결측"으로
 * 오판**된다. 그 오판의 대가는 이미 있는 셀을 다시 write하는 것(= computed_at 증거 파괴,
 * add-only 위반)이라 절대 허용할 수 없다. 정렬 비용보다 이쪽이 훨씬 중요하다.
 */
export async function loadMonthlyStatsCells(
  supabase: SupabaseClient,
  buildingType: BuildingType,
  sinceYm: string,
  lawdCd?: string
): Promise<MonthlyStatsCell[]> {
  const cells: MonthlyStatsCell[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from("monthly_stats")
      .select("lawd_cd,deal_type,deal_ym,avg_price,deal_count,computed_at")
      .eq("building_type", buildingType)
      .gte("deal_ym", sinceYm);
    if (lawdCd) query = query.eq("lawd_cd", lawdCd);

    const { data, error } = await query
      .order("lawd_cd", { ascending: true })
      .order("deal_ym", { ascending: true })
      .order("deal_type", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      const dealType = String(row.deal_type);
      // 월세 등 예상 밖 유형이 섞여 있어도 스캔 기준을 오염시키지 않는다.
      if (dealType !== "매매" && dealType !== "전세") continue;
      cells.push({
        lawdCd: String(row.lawd_cd),
        dealType,
        dealYm: String(row.deal_ym),
        avgPrice: row.avg_price === null ? null : Number(row.avg_price),
        dealCount: Number(row.deal_count) || 0,
        computedAt: row.computed_at === null ? null : String(row.computed_at),
      });
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return cells;
}

/** loadMonthlyStatsCells 결과를 (지역 → 월 → 유형) 3단 Map으로 색인한다. */
export function indexStatsCells(cells: MonthlyStatsCell[]): StatsPresenceIndex {
  const index: StatsPresenceIndex = new Map();
  for (const cell of cells) {
    let byYm = index.get(cell.lawdCd);
    if (!byYm) {
      byYm = new Map();
      index.set(cell.lawdCd, byYm);
    }
    let byType = byYm.get(cell.dealYm);
    if (!byType) {
      byType = new Map();
      byYm.set(cell.dealYm, byType);
    }
    byType.set(cell.dealType, cell);
  }
  return index;
}

/**
 * 한 지역에서 "창 안인데 stats 행이 없는 달" 목록을 ymList 순서 그대로 돌려준다.
 *
 * 판정은 **월 단위**다 — 매매·전세 중 하나라도 없으면 그 달을 결측으로 본다.
 * upsertMonthlyStats가 (매매, 전세) 두 유형을 같은 allData로 함께 쓰기 때문에, 유형 단위로
 * 잘게 나눠봐야 어차피 월 단위로 처리해야 한다(기획안 §2-3 "매매·전세 쌍이므로 월 단위로 다룬다").
 */
export function findMissingStatsMonths(
  index: StatsPresenceIndex,
  lawdCd: string,
  ymList: string[]
): string[] {
  const byYm = index.get(lawdCd);
  const missing: string[] = [];
  for (const ym of ymList) {
    const byType = byYm?.get(ym);
    const complete = !!byType && STATS_DEAL_TYPES.every((t) => byType.has(t));
    if (!complete) missing.push(ym);
  }
  return missing;
}

/**
 * "매매/전세 중 정확히 한쪽만 존재하는 달" 목록 — 기획안 §1-1의 쌍 대칭 전제를 검증한다.
 * 정상이면 항상 빈 배열이며, 비어 있지 않다면 upsertMonthlyStats 호출부 어딘가가 두 유형을
 * 짝으로 쓰지 않았다는 뜻이므로 백필 스펙의 전제(2,964 = 114×13×2)부터 다시 봐야 한다
 * (QA V0-2의 "대칭이 깨지면 즉시 중단하고 보고"가 이 값을 본다).
 */
export function findAsymmetricStatsMonths(
  index: StatsPresenceIndex,
  lawdCds: string[],
  ymList: string[]
): Array<{ lawdCd: string; dealYm: string; present: StatsDealType[] }> {
  const out: Array<{ lawdCd: string; dealYm: string; present: StatsDealType[] }> = [];
  for (const lawdCd of lawdCds) {
    const byYm = index.get(lawdCd);
    if (!byYm) continue;
    for (const ym of ymList) {
      const byType = byYm.get(ym);
      if (!byType) continue;
      const present = STATS_DEAL_TYPES.filter((t) => byType.has(t));
      if (present.length > 0 && present.length < STATS_DEAL_TYPES.length) {
        out.push({ lawdCd, dealYm: ym, present });
      }
    }
  }
  return out;
}

/** 창 안 기대집합 중 실제로 존재하는 셀 수를 센다(창 밖·미등록 지역 행은 세지 않는다). */
export function countPresentCells(
  index: StatsPresenceIndex,
  lawdCds: string[],
  ymList: string[]
): number {
  let present = 0;
  for (const lawdCd of lawdCds) {
    const byYm = index.get(lawdCd);
    if (!byYm) continue;
    for (const ym of ymList) {
      const byType = byYm.get(ym);
      if (!byType) continue;
      for (const dealType of STATS_DEAL_TYPES) {
        if (byType.has(dealType)) present += 1;
      }
    }
  }
  return present;
}
