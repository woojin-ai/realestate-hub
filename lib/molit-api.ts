// 국토교통부 실거래가 API 호출 모듈
// 원본: C:\bitcoin_vdcode\realestate\fetcher.py 포팅 (아파트/빌라/단독 매매·전월세 지원)
//
// ⚠️ 서비스키 이중인코딩 방지: serviceKey를 URL 문자열에 직접 붙여서 호출한다.
// fetch()에 URLSearchParams/params 객체를 쓰면 이미 인코딩된 서비스키가 다시
// 인코딩되어(%가 %25로) 500 에러가 난다 — 원본 fetcher.py의 _call_api() 방식 그대로 유지.

import { XMLParser } from "fast-xml-parser";

// 건물 유형. 순환참조를 피하기 위해(types.ts → analyzer.ts → molit-api.ts 방향 유지)
// 최하위 모듈인 여기서 정의하고 types.ts에서 재수출한다(중복정의 금지).
export type BuildingType = "아파트" | "빌라" | "단독";

// 원본 config.py L29-34의 6개 엔드포인트를 그대로 이관.
const APT_TRADE_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"; // 아파트 매매
const APT_RENT_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"; // 아파트 전월세
const VILA_TRADE_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade"; // 빌라(연립다세대) 매매
const VILA_RENT_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent"; // 빌라(연립다세대) 전월세
const HOUSE_TRADE_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade"; // 단독(단독다가구) 매매
const HOUSE_RENT_URL =
  "http://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent"; // 단독(단독다가구) 전월세

// 원본 fetcher.py의 TRADE_URLS/RENT_URLS 매핑과 동일. building_type으로 URL 선택.
const TRADE_URLS: Record<BuildingType, string> = {
  아파트: APT_TRADE_URL,
  빌라: VILA_TRADE_URL,
  단독: HOUSE_TRADE_URL,
};
const RENT_URLS: Record<BuildingType, string> = {
  아파트: APT_RENT_URL,
  빌라: VILA_RENT_URL,
  단독: HOUSE_RENT_URL,
};

// 국토부 RTMS 실거래가 API 레거시 시군구코드 팬아웃.
// 부천시는 2016년 책임읍면동제 전환으로 원미/소사/오정구(자치구)를 폐지했으나, RTMS
// 실거래가 API는 여전히 폐지 전 자치구 단위 레거시 코드로만 데이터를 제공한다. 통합코드
// 41190으로 조회하면 resultCode=000(정상)이지만 totalCount=0(빈 응답)이 온다. 따라서
// 41190 조회 시 세 레거시 구 코드로 각각 조회한 뒤 병합한다. 저장/조회 키는 논리코드
// 41190 하나로 유지되고(호출부는 41190만 넘김), 이 팬아웃은 fetch 단계 내부에서만 일어난다.
// (2026-07-16 라이브 확인: DEAL_YMD=202506 기준 41190=0 / 41192(원미)=397 / 41194(소사)=214 / 41196(오정)=73)
// 매핑에 없는 일반 지역은 자기 자신 단일 코드로 그대로 조회되어 회귀가 없다.
const LAWD_FANOUT: Record<string, string[]> = {
  "41190": ["41192", "41194", "41196"],
};

/** 조회 대상 실제 LAWD_CD 목록. 팬아웃 대상이면 레거시 구 코드들, 아니면 자기 자신 1개. */
function resolveLawdCodes(lawdCd: string): string[] {
  return LAWD_FANOUT[lawdCd] ?? [lawdCd];
}

export interface TradeRecord {
  deal_type: "매매";
  building_type: BuildingType;
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
  building_type: BuildingType;
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
    // 2026-07-15 prewarm 504 사고 대응: 30s는 Vercel maxDuration(60s) 대비 너무 길어
    // 페이지 하나(특히 콜드 지역의 다중 페이지)가 전체 예산을 인질로 잡을 수 있었다.
    // 8s로 단축 — 국토부 API는 보통 수백ms~2s 내 응답하므로 정상 케이스엔 영향 없다.
    signal: AbortSignal.timeout(8_000),
    // 국토부 API는 매 호출 결과가 최신 신고분 반영이므로 캐시하지 않는다.
    cache: "no-store",
  });
  return res.text();
}

function textOf(node: unknown): string {
  if (node === undefined || node === null) return "";
  return String(node).trim();
}

/** 매매 실거래가 조회 (한 달치, 페이지네이션 포함). buildingType으로 아파트/빌라/단독 구분.
 * 팬아웃 대상 코드(예: 부천 41190)는 레거시 구 코드별로 각각 조회해 병합한다. */
export async function fetchTrade(
  lawdCd: string,
  dealYmd: string,
  buildingType: BuildingType = "아파트"
): Promise<TradeRecord[]> {
  const codes = resolveLawdCodes(lawdCd);
  if (codes.length === 1) {
    return fetchTradeSingle(codes[0], dealYmd, buildingType);
  }
  const perCode = await Promise.all(
    codes.map((code) => fetchTradeSingle(code, dealYmd, buildingType))
  );
  return perCode.flat();
}

/** 단일 LAWD_CD 한 달치 매매 조회(페이지네이션 포함) — fetchTrade의 팬아웃 내부 구현. */
async function fetchTradeSingle(
  lawdCd: string,
  dealYmd: string,
  buildingType: BuildingType
): Promise<TradeRecord[]> {
  const baseUrl = TRADE_URLS[buildingType];
  const results: TradeRecord[] = [];
  let page = 1;

  while (true) {
    let text: string;
    try {
      text = (await callApi(baseUrl, lawdCd, dealYmd, page)).trim();
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
      // 원본 fetcher.py의 (excluUseAr or area or "0")과 동일하게, 빈 문자열도
      // fallback되도록 `??`(null/undefined만)가 아니라 `||`로 단계별 폴백한다.
      // (빌라/단독 API는 excluUseAr 대신 area 필드를 쓰는 경우가 있어 특히 중요)
      const areaRaw = textOf(item.excluUseAr) || textOf(item.area) || "0";
      const price = Number(priceRaw);
      const area = Number(areaRaw);
      if (!Number.isFinite(price) || !Number.isFinite(area)) continue;

      // 이름 필드 fallback: 아파트 aptNm → 빌라 mhouseNm → 단독 houseNm (원본 fetcher.py 동일)
      const name =
        textOf(item.aptNm) || textOf(item.mhouseNm) || textOf(item.houseNm);

      results.push({
        deal_type: "매매",
        building_type: buildingType,
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

/** 전월세 실거래가 조회 (한 달치, 페이지네이션 포함). buildingType으로 아파트/빌라/단독 구분.
 * 팬아웃 대상 코드(예: 부천 41190)는 레거시 구 코드별로 각각 조회해 병합한다. */
export async function fetchRent(
  lawdCd: string,
  dealYmd: string,
  buildingType: BuildingType = "아파트"
): Promise<RentRecord[]> {
  const codes = resolveLawdCodes(lawdCd);
  if (codes.length === 1) {
    return fetchRentSingle(codes[0], dealYmd, buildingType);
  }
  const perCode = await Promise.all(
    codes.map((code) => fetchRentSingle(code, dealYmd, buildingType))
  );
  return perCode.flat();
}

/** 단일 LAWD_CD 한 달치 전월세 조회(페이지네이션 포함) — fetchRent의 팬아웃 내부 구현. */
async function fetchRentSingle(
  lawdCd: string,
  dealYmd: string,
  buildingType: BuildingType
): Promise<RentRecord[]> {
  const baseUrl = RENT_URLS[buildingType];
  const results: RentRecord[] = [];
  let page = 1;

  while (true) {
    let text: string;
    try {
      text = (await callApi(baseUrl, lawdCd, dealYmd, page)).trim();
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
      // 원본 fetcher.py의 (excluUseAr or area or "0")과 동일하게, 빈 문자열도
      // fallback되도록 `??`(null/undefined만)가 아니라 `||`로 단계별 폴백한다.
      // (빌라/단독 API는 excluUseAr 대신 area 필드를 쓰는 경우가 있어 특히 중요)
      const areaRaw = textOf(item.excluUseAr) || textOf(item.area) || "0";

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
      // 이름 필드 fallback: 아파트 aptNm → 빌라 mhouseNm → 단독 houseNm (원본 fetcher.py 동일)
      const name =
        textOf(item.aptNm) || textOf(item.mhouseNm) || textOf(item.houseNm);
      const contractType = textOf(item.contractType);

      results.push({
        deal_type: rentType,
        building_type: buildingType,
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

/** 지정한 월(YYYYMM) 하나의 매매+전세+월세 데이터를 모두 수집(건물유형별) */
export async function collectMonth(
  lawdCd: string,
  ym: string,
  buildingType: BuildingType = "아파트"
): Promise<MonthData> {
  const [trades, rents] = await Promise.all([
    fetchTrade(lawdCd, ym, buildingType),
    fetchRent(lawdCd, ym, buildingType),
  ]);
  const jeonse = rents.filter((r) => r.deal_type === "전세");
  const wolse = rents.filter((r) => r.deal_type === "월세");
  return { 매매: trades, 전세: jeonse, 월세: wolse };
}
