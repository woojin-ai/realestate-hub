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

export { EMPTY_MONTH };
