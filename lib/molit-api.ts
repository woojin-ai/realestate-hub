// 국토교통부 실거래가 API 호출 모듈
// 원본: C:\bitcoin_vdcode\realestate\fetcher.py 포팅 (이번 라운드는 아파트 매매/전세만)
//
// ⚠️ 서비스키 이중인코딩 방지: serviceKey를 URL 문자열에 직접 붙여서 호출한다.
// fetch()에 URLSearchParams/params 객체를 쓰면 이미 인코딩된 서비스키가 다시
// 인코딩되어(%가 %25로) 500 에러가 난다 — 원본 fetcher.py의 _call_api() 방식 그대로 유지.

import { XMLParser } from "fast-xml-parser";

const APT_TRADE_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";
const APT_RENT_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent";

export interface TradeRecord {
  deal_type: "매매";
  building_type: "아파트";
  name: string;
  dong: string;
  price: number;
  area: number;
  floor: string;
  build_year: string;
  year: string;
  month: string;
  day: string;
}

export interface RentRecord {
  deal_type: "전세" | "월세";
  building_type: "아파트";
  name: string;
  dong: string;
  deposit: number;
  monthly: number;
  area: number;
  floor: string;
  build_year: string;
  year: string;
  month: string;
  day: string;
  contract_type: string;
}

// parseTagValue: false — fast-xml-parser는 기본적으로 "00" 같은 숫자형 텍스트를
// 숫자로 자동 변환해 앞자리 0을 잘라버린다(resultCode "00" → 0 → "0").
// 원본 Python의 ElementTree.findtext()는 텍스트를 그대로 문자열로 반환하므로,
// 원본과 동일하게 모든 값을 문자열로 유지한다.
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

// 국토부 API XML 응답을 파싱한 결과 형태는 문서화되어 있지 않고 항목 존재 여부에 따라
// 배열/객체가 오락가락하므로(fast-xml-parser 특성), 느슨한 형태로만 타입을 잡는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MolitXmlNode = any;

function getApiKey(): string {
  const key = process.env.MOLIT_API_KEY;
  if (!key) {
    throw new Error("MOLIT_API_KEY가 설정되지 않았습니다 (.env.local 확인)");
  }
  return key;
}

async function callApi(
  baseUrl: string,
  lawdCd: string,
  dealYmd: string,
  page: number
): Promise<string> {
  const url =
    `${baseUrl}` +
    `?serviceKey=${getApiKey()}` +
    `&LAWD_CD=${lawdCd}` +
    `&DEAL_YMD=${dealYmd}` +
    `&pageNo=${page}` +
    `&numOfRows=1000`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    // 국토부 API는 매 호출 결과가 최신 신고분 반영이므로 캐시하지 않는다.
    cache: "no-store",
  });
  return res.text();
}

function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  return String(node).trim();
}

/** 아파트 매매 실거래가 조회 (한 달치, 페이지네이션 포함) */
export async function fetchTrade(
  lawdCd: string,
  dealYmd: string
): Promise<TradeRecord[]> {
  const results: TradeRecord[] = [];
  let page = 1;

  while (true) {
    let text: string;
    try {
      text = (await callApi(APT_TRADE_URL, lawdCd, dealYmd, page)).trim();
    } catch (e) {
      console.error(`[매매 fetch 예외] ${dealYmd} p${page}:`, e);
      break;
    }

    if (!text.startsWith("<")) {
      console.error(`[매매 오류] ${dealYmd}: ${text.slice(0, 100)}`);
      break;
    }

    let root: MolitXmlNode;
    try {
      root = parser.parse(text);
    } catch (e) {
      console.error(`[매매 파싱 오류] ${dealYmd}:`, e);
      break;
    }

    const response = root?.response;
    const resultCode = textOf(response?.header?.resultCode);
    if (resultCode !== "00" && resultCode !== "000") {
      const msg = textOf(response?.header?.resultMsg);
      console.error(`[매매 API 오류] ${dealYmd} - ${resultCode}: ${msg}`);
      break;
    }

    const body = response?.body;
    let items = body?.items?.item ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    if (items.length === 0) break;

    for (const item of items) {
      const priceRaw = textOf(item.dealAmount).replace(/,/g, "");
      const areaRaw = textOf(item.excluUseAr ?? item.area) || "0";
      const price = Number(priceRaw);
      const area = Number(areaRaw);
      if (!Number.isFinite(price) || !Number.isFinite(area)) continue;

      const name = textOf(item.aptNm);

      results.push({
        deal_type: "매매",
        building_type: "아파트",
        name,
        dong: textOf(item.umdNm),
        price,
        area,
        floor: textOf(item.floor),
        build_year: textOf(item.buildYear),
        year: textOf(item.dealYear),
        month: textOf(item.dealMonth),
        day: textOf(item.dealDay),
      });
    }

    const totalCount = Number(textOf(body?.totalCount)) || 0;
    if (page * 1000 >= totalCount) break;
    page += 1;
  }

  return results;
}

/** 아파트 전월세 실거래가 조회 (한 달치, 페이지네이션 포함) */
export async function fetchRent(
  lawdCd: string,
  dealYmd: string
): Promise<RentRecord[]> {
  const results: RentRecord[] = [];
  let page = 1;

  while (true) {
    let text: string;
    try {
      text = (await callApi(APT_RENT_URL, lawdCd, dealYmd, page)).trim();
    } catch (e) {
      console.error(`[전월세 fetch 예외] ${dealYmd} p${page}:`, e);
      break;
    }

    if (!text.startsWith("<")) {
      console.error(`[전월세 오류] ${dealYmd}: ${text.slice(0, 100)}`);
      break;
    }

    let root: MolitXmlNode;
    try {
      root = parser.parse(text);
    } catch (e) {
      console.error(`[전월세 파싱 오류] ${dealYmd}:`, e);
      break;
    }

    const response = root?.response;
    const resultCode = textOf(response?.header?.resultCode);
    if (resultCode !== "00" && resultCode !== "000") {
      const msg = textOf(response?.header?.resultMsg);
      console.error(`[전월세 API 오류] ${dealYmd} - ${resultCode}: ${msg}`);
      break;
    }

    const body = response?.body;
    let items = body?.items?.item ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    if (items.length === 0) break;

    for (const item of items) {
      const depositRaw = textOf(item.deposit).replace(/,/g, "");
      const monthlyRaw = textOf(item.monthlyRent).replace(/,/g, "");
      const areaRaw = textOf(item.excluUseAr ?? item.area) || "0";

      const deposit = depositRaw ? Number(depositRaw) : 0;
      const monthly = monthlyRaw ? Number(monthlyRaw) : 0;
      const area = areaRaw ? Number(areaRaw) : 0;
      if (
        !Number.isFinite(deposit) ||
        !Number.isFinite(monthly) ||
        !Number.isFinite(area)
      )
        continue;

      const rentType: "전세" | "월세" = monthly === 0 ? "전세" : "월세";
      const name = textOf(item.aptNm);
      const contractType = textOf(item.contractType);

      results.push({
        deal_type: rentType,
        building_type: "아파트",
        name,
        dong: textOf(item.umdNm),
        deposit,
        monthly,
        area,
        floor: textOf(item.floor),
        build_year: textOf(item.buildYear),
        year: textOf(item.dealYear),
        month: textOf(item.dealMonth),
        day: textOf(item.dealDay),
        contract_type: contractType,
      });
    }

    const totalCount = Number(textOf(body?.totalCount)) || 0;
    if (page * 1000 >= totalCount) break;
    page += 1;
  }

  return results;
}

/** 최근 N개월의 YYYYMM 리스트 반환 (원본 fetcher.py get_ym_list) */
export function getYmList(monthsBack: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${y}${m}`);
  }
  return result;
}

export interface MonthData {
  매매: TradeRecord[];
  전세: RentRecord[];
  월세: RentRecord[];
}

/** 지정한 월(YYYYMM) 하나의 아파트 매매+전세+월세 데이터를 모두 수집 */
export async function collectMonth(
  lawdCd: string,
  ym: string
): Promise<MonthData> {
  const [trades, rents] = await Promise.all([
    fetchTrade(lawdCd, ym),
    fetchRent(lawdCd, ym),
  ]);
  const jeonse = rents.filter((r) => r.deal_type === "전세");
  const wolse = rents.filter((r) => r.deal_type === "월세");
  return { 매매: trades, 전세: jeonse, 월세: wolse };
}
