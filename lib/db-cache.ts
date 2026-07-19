// Supabase 캐시/영속화 헬퍼 (마이그레이션 로드맵 3단계)
// deals / fetch_cache_status / monthly_stats 테이블 read/write를 담당한다.
// 원본 fetcher.py/analyzer.py 로직은 건드리지 않고, lib/molit-api.ts가 만든
// TradeRecord/RentRecord를 그대로 DB 행으로 저장하고 되읽어 동일한 형태로 복원한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BuildingType,
  MonthData,
  TradeRecord,
  RentRecord,
} from "./molit-api";
import { isRealApartment, buildMonthlyStats, type AllData } from "./analyzer";

const EMPTY_MONTH: MonthData = { 매매: [], 전세: [], 월세: [] };

// PostgREST 기본 조회 행 수 제한(1000)을 고려해 page 단위로 모두 읽어온다.
const PAGE_SIZE = 1000;
// upsert 페이로드가 너무 커지지 않도록 청크 단위로 나눠 보낸다.
const UPSERT_CHUNK_SIZE = 500;

const DEALS_CONFLICT_TARGET =
  "lawd_cd,building_type,deal_type,name,dong,area,floor,deal_year,deal_month,deal_day,price,deposit,monthly";

interface DealRow {
  lawd_cd: string;
  building_type: BuildingType;
  deal_type: "매매" | "전세" | "월세";
  name: string;
  dong: string;
  price: number;
  deposit: number;
  monthly: number;
  area: number;
  floor: string;
  build_year: string;
  deal_year: number;
  deal_month: number;
  deal_day: number;
  contract_type: string | null;
  is_apt_filtered: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

function parseYm(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(4, 6)) };
}

/**
 * TradeRecord/RentRecord → deals 테이블 행 변환.
 * 자연키(unique 제약)에 price/deposit/monthly가 모두 포함되는데, 해당 거래유형에
 * 쓰이지 않는 필드(예: 매매 건의 deposit/monthly)를 NULL로 두면 Postgres가
 * NULL끼리는 서로 다른 값으로 취급해 ON CONFLICT가 동작하지 않아 재적재 시
 * 중복 행이 쌓인다. analyzer.ts가 이미 price>0 / deposit>0 을 "값 없음"
 * 기준으로 쓰고 있으므로(avgTradePrice, avgJeonseDeposit), 미사용 필드는
 * NULL 대신 0으로 채워 자연키 유일성을 보장한다(값의 의미는 동일하게 유지됨).
 */
function toDealRow(
  lawdCd: string,
  buildingType: BuildingType,
  ym: string,
  record: TradeRecord | RentRecord
): DealRow {
  const { year, month } = parseYm(ym);
  const isTrade = record.deal_type === "매매";
  const price = isTrade ? (record as TradeRecord).price : 0;
  const deposit = isTrade ? 0 : (record as RentRecord).deposit;
  const monthly = isTrade ? 0 : (record as RentRecord).monthly;

  return {
    lawd_cd: lawdCd,
    building_type: buildingType,
    deal_type: record.deal_type,
    name: record.name,
    dong: record.dong,
    price,
    deposit,
    monthly,
    area: record.area,
    floor: record.floor,
    build_year: record.build_year,
    deal_year: Number(record.year) || year,
    deal_month: Number(record.month) || month,
    deal_day: Number(record.day) || 0,
    contract_type: isTrade ? null : (record as RentRecord).contract_type,
    is_apt_filtered: isRealApartment(record.name),
    raw: record,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** deals의 자연키(unique 제약) 문자열을 만든다. */
function dealNaturalKey(row: DealRow): string {
  return [
    row.lawd_cd,
    row.building_type,
    row.deal_type,
    row.name,
    row.dong,
    row.area,
    row.floor,
    row.deal_year,
    row.deal_month,
    row.deal_day,
    row.price,
    row.deposit,
    row.monthly,
  ].join("|");
}

/**
 * 같은 upsert 호출 안에 자연키가 동일한 행이 두 개 이상 있으면 Postgres가
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" 오류를 낸다
 * (국토부 API가 동일 자연키의 신고 건을 같은 달에 중복 반환하는 경우가 실제로
 * 존재함 — 동일 단지·동일 면적/층/가격/날짜의 재신고 등). 배치 전송 전에
 * 자연키 기준으로 중복을 제거한다(마지막 값 유지).
 */
function dedupeByNaturalKey(rows: DealRow[]): DealRow[] {
  const map = new Map<string, DealRow>();
  for (const row of rows) map.set(dealNaturalKey(row), row);
  return Array.from(map.values());
}

/**
 * MonthData(국토부 API 파싱 결과)를 deals 테이블 자연키 기준으로 접는다.
 * upsertMonthDeals가 DB에 적재할 때 쓰는 것과 **완전히 동일한 기준**이다.
 *
 * ── 왜 필요한가 (2026-07-20) ─────────────────────────────────────────
 * /api/data는 같은 달을 두 경로로 서빙한다.
 *   (a) 캐시 경로: loadMonthFromDb → deals 테이블 = 자연키로 이미 접힌 행
 *   (b) 라이브 경로: collectMonth → 국토부 API 원본 = 접히지 않은 레코드
 * 그래서 예전에는 같은 달인데도 어느 경로로 서빙되느냐에 따라 건수가 달라졌다
 * (실측: 세종 36110 / 202607 전세 라이브 270건 vs 캐시 258건, 매매 133 vs 131).
 * 최신월(index 0)만 신선도에 따라 두 경로를 오가므로, 사용자에겐 "진행 중인 달의
 * 거래건수가 조회할 때마다 줄어드는" 것처럼 보였다(완결월은 항상 캐시라 안정적).
 * 이 함수를 라이브 경로에도 적용해 **어느 경로로 서빙되든 같은 값**이 나오게 한다.
 *
 * ── 이 함수 도입으로 표시 건수가 어떻게 바뀌는가 (오해 주의) ──────────
 * "수치가 안 바뀐다"가 아니다. 정확히는 다음과 같다.
 *   • 내려감: 라이브 경로로 서빙되던 **최신월**. 접히지 않은 원본을 보여주던 값이
 *     캐시 값에 맞춰 내려간다(세종 202607 전세 270→258, 매매 133→131).
 *   • 그대로: **완결월**(원래 캐시 경로에서만 읽힘), 그리고 이미 캐시 경로로
 *     서빙되고 있던 값. 이쪽은 애초에 접힌 값이었으므로 변화가 없다.
 * 즉 "조회 시점에 따라 최신월 건수가 오르내리던" 것을 낮은 쪽(캐시 값)으로
 * 고정하는 변경이다. 사용자가 보는 최신월 숫자는 실제로 줄어든다.
 *
 * ── 한계 (알고 쓸 것) ────────────────────────────────────────────────
 * 자연키(lawd_cd·building_type·deal_type·name·dong·area·floor·연월일·price·
 * deposit·monthly)는 거래 1건을 **완전히 식별하지 못한다.** 이 필드들이 모두 같은
 * 서로 다른 계약이 1건으로 접힌다(세종 202607 전세 실측: 접힌 12건 중 최소 2건이
 * 실재하는 별개 거래). 즉 이 함수는 "실제보다 적게 세는" 쪽으로 치우쳐 있다.
 *
 * 이걸 교정하려면 자연키를 넓혀야 하는데, 후보 두 개는 난이도가 전혀 다르다.
 *   • contract_type(신규/갱신) — **이미 파싱되어 RentRecord·DealRow·deals 컬럼에
 *     모두 존재하고, 키에만 빠져 있다.** 접기 기준 자체는 dealNaturalKey(위) 한
 *     곳만 고치면 이 함수와 upsertMonthDeals 양쪽에 같이 반영된다. 다만 DB 적재
 *     단위까지 실제로 갈라지게 하려면 DEALS_CONFLICT_TARGET(L22)과 schema.sql의
 *     unique 제약도 함께 바꿔야 한다.
 *   • contractTerm(계약기간) — **파서에 아예 없다.** lib/molit-api.ts를 grep해도
 *     0건이다(국토부 응답 XML에는 있으나 fetchRentSingle이 읽지 않는다). 키에
 *     넣으려면 molit-api.ts 파싱 추가 → RentRecord 필드 추가 → DealRow 필드 추가
 *     → deals 컬럼 추가가 **선행**돼야 한다. dealNaturalKey만 고쳐서는 안 된다.
 * 어느 쪽이든 표시 건수가 올라가는 변경이라, 자연키 확장은 이번 수정 범위에서
 * 빼고 사용자 판단 사항으로 분리했다. 이번 수정은 **두 경로의 값을 일치시키는
 * 것까지만** 한다(자연키는 손대지 않음).
 *
 * 중복제거 기준을 두 곳에 따로 구현하지 말 것 — 반드시 dealNaturalKey를 경유한다.
 */
export function dedupeMonthData(
  lawdCd: string,
  buildingType: BuildingType,
  ym: string,
  data: MonthData
): MonthData {
  // upsertMonthDeals와 동일하게 매매/전세/월세를 한 배치로 합쳐 접는다(deal_type이
  // 자연키에 포함되므로 유형이 다른 레코드끼리는 애초에 충돌하지 않는다). 키 계산은
  // toDealRow를 그대로 거쳐, DB 적재 시점과 키가 어긋날 여지를 없앤다.
  // Map.set은 기존 키의 삽입 순서를 유지한 채 값만 갱신하므로, dedupeByNaturalKey와
  // 동일한 "마지막 값 유지" 의미가 된다.
  const map = new Map<string, TradeRecord | RentRecord>();
  for (const record of [...data.매매, ...data.전세, ...data.월세]) {
    map.set(dealNaturalKey(toDealRow(lawdCd, buildingType, ym, record)), record);
  }

  const result: MonthData = { 매매: [], 전세: [], 월세: [] };
  for (const record of map.values()) {
    if (record.deal_type === "매매") result.매매.push(record as TradeRecord);
    else if (record.deal_type === "전세") result.전세.push(record as RentRecord);
    else result.월세.push(record as RentRecord);
  }
  return result;
}

/** 한 달치(MonthData)를 deals 테이블에 upsert(자연키 충돌 시 갱신)한다. */
export async function upsertMonthDeals(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType,
  ym: string,
  data: MonthData
): Promise<void> {
  const rawRows: DealRow[] = [
    ...data.매매.map((r) => toDealRow(lawdCd, buildingType, ym, r)),
    ...data.전세.map((r) => toDealRow(lawdCd, buildingType, ym, r)),
    ...data.월세.map((r) => toDealRow(lawdCd, buildingType, ym, r)),
  ];
  if (rawRows.length === 0) return;

  const rows = dedupeByNaturalKey(rawRows);

  for (const part of chunk(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("deals")
      .upsert(part, { onConflict: DEALS_CONFLICT_TARGET, ignoreDuplicates: false });
    if (error) throw error;
  }
}

/** 이미 DB에 저장된 한 달치를 deals 테이블에서 읽어 MonthData 형태로 복원한다. */
export async function loadMonthFromDb(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType,
  ym: string
): Promise<MonthData> {
  const { year, month } = parseYm(ym);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("deals")
      .select(
        "deal_type,name,dong,price,deposit,monthly,area,floor,build_year,deal_year,deal_month,deal_day,contract_type"
      )
      .eq("lawd_cd", lawdCd)
      .eq("building_type", buildingType)
      .eq("deal_year", year)
      .eq("deal_month", month)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const result: MonthData = { 매매: [], 전세: [], 월세: [] };
  for (const row of rows) {
    const year3 = String(row.deal_year);
    const month3 = String(row.deal_month).padStart(2, "0");
    const day3 = String(row.deal_day ?? 0).padStart(2, "0");

    if (row.deal_type === "매매") {
      result.매매.push({
        deal_type: "매매",
        building_type: buildingType,
        name: row.name,
        dong: row.dong,
        price: Number(row.price) || 0,
        area: Number(row.area) || 0,
        floor: row.floor ?? "",
        build_year: row.build_year ?? "",
        year: year3,
        month: month3,
        day: day3,
      });
    } else {
      const rec: RentRecord = {
        deal_type: row.deal_type,
        building_type: buildingType,
        name: row.name,
        dong: row.dong,
        deposit: Number(row.deposit) || 0,
        monthly: Number(row.monthly) || 0,
        area: Number(row.area) || 0,
        floor: row.floor ?? "",
        build_year: row.build_year ?? "",
        year: year3,
        month: month3,
        day: day3,
        contract_type: row.contract_type ?? "",
      };
      if (row.deal_type === "전세") result.전세.push(rec);
      else if (row.deal_type === "월세") result.월세.push(rec);
    }
  }

  return result;
}

export interface FetchCacheStatusRow {
  lawd_cd: string;
  building_type: BuildingType;
  months_collected: number;
  last_fetched_at: string | null;
  last_deal_ym: string | null;
  status: "pending" | "collecting" | "ready" | "error";
  error_message: string | null;
}

export async function getCacheStatus(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType
): Promise<FetchCacheStatusRow | null> {
  const { data, error } = await supabase
    .from("fetch_cache_status")
    .select("*")
    .eq("lawd_cd", lawdCd)
    .eq("building_type", buildingType)
    .maybeSingle();

  if (error) throw error;
  return (data as FetchCacheStatusRow) ?? null;
}

export async function upsertCacheStatus(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType,
  fields: {
    months_collected: number;
    last_deal_ym: string;
    status: FetchCacheStatusRow["status"];
  }
): Promise<void> {
  const { error } = await supabase.from("fetch_cache_status").upsert(
    {
      lawd_cd: lawdCd,
      building_type: buildingType,
      months_collected: fields.months_collected,
      last_deal_ym: fields.last_deal_ym,
      last_fetched_at: new Date().toISOString(),
      status: fields.status,
      error_message: null,
    },
    { onConflict: "lawd_cd,building_type" }
  );
  if (error) throw error;
}

/** buildMonthlyStats(analyzer.ts) 결과를 monthly_stats 테이블에 반영(월별 upsert). */
export async function upsertMonthlyStats(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType,
  dealType: "매매" | "전세",
  allData: AllData
): Promise<void> {
  const stats = buildMonthlyStats(allData, dealType);
  const rows = Object.entries(stats).map(([ym, stat]) => ({
    lawd_cd: lawdCd,
    building_type: buildingType,
    deal_type: dealType,
    deal_ym: ym,
    avg_price: stat.avg,
    deal_count: stat.count,
    computed_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("monthly_stats")
    .upsert(rows, { onConflict: "lawd_cd,building_type,deal_type,deal_ym" });
  if (error) throw error;
}

/**
 * 오염(캐시 포이즈닝)되어 굳은 지역 캐시를 세 테이블(deals/monthly_stats/
 * fetch_cache_status)에서 통째로 삭제한다. 삭제 후 다음 /api/data 조회가 국토부 API로
 * 재-fetch하며 63391ab의 자가치유 로직으로 정상 데이터를 다시 채운다.
 * 삭제된 행 수는 각 delete에 { count: "exact", head: true }를 줘서 Content-Range로
 * 받는다. .select()로 삭제 행을 되받아 length를 세는 방식은 PostgREST 기본 반환행
 * 상한(1000, 위 PAGE_SIZE 주석 참고)에 걸려, 대형 오염 지역(화성 41590 등 월 수천 건)에서
 * 실제 삭제 건수보다 작게 표시되는 문제가 있다(DELETE 자체는 전부 삭제되므로 자가치유엔
 * 영향 없으나 보고 수치가 부정확). count 방식은 행을 되받지 않아 상한과 무관하고 더 가볍다.
 */
export async function resetRegionCache(
  supabase: SupabaseClient,
  lawdCd: string,
  buildingType: BuildingType = "아파트"
): Promise<{ deals: number; monthlyStats: number; cacheStatus: number }> {
  const { count: dealsCount, error: dealsErr } = await supabase
    .from("deals")
    .delete({ count: "exact" })
    .eq("lawd_cd", lawdCd)
    .eq("building_type", buildingType);
  if (dealsErr) throw dealsErr;

  const { count: statsCount, error: statsErr } = await supabase
    .from("monthly_stats")
    .delete({ count: "exact" })
    .eq("lawd_cd", lawdCd)
    .eq("building_type", buildingType);
  if (statsErr) throw statsErr;

  const { count: cacheCount, error: cacheErr } = await supabase
    .from("fetch_cache_status")
    .delete({ count: "exact" })
    .eq("lawd_cd", lawdCd)
    .eq("building_type", buildingType);
  if (cacheErr) throw cacheErr;

  return {
    deals: dealsCount ?? 0,
    monthlyStats: statsCount ?? 0,
    cacheStatus: cacheCount ?? 0,
  };
}

export { EMPTY_MONTH };
