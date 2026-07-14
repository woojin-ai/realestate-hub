// 아파트 상세 모달 — 단지 정보(Stage 2) MOLIT 조회 모듈
//
// 원본 Flask C:\bitcoin_vdcode\realestate\app.py 의 _get_kapt_code(1234-1273)와
// /api/aptinfo 본문(1287-1407)의 MOLIT 부분을 TS로 포팅.
//
// - resolveKaptCode: getSigunguAptList3(구 전체 단지목록)를 페이지네이션 로드 후 이름 정규화
//   완전일치 → 부분일치로 kaptCode 매칭. 서버리스라 프로세스 메모리 캐시 없음(매 콜드마다 로드).
//   대신 결과 kaptCode는 라우트가 apt_info에 영속화하므로 재방문 시 이 함수를 아예 건너뛴다.
// - fetchAptInfo: getAphusBassInfoV4 + getAphusDtlInfoV4(_type=json) 2콜로 MVP6+후순위 필드 추출.
//   far_ratio/cov_ratio(건축HUB)는 이번 Stage에서 호출하지 않고 항상 null(기획안 §1-B 후순위).
//
// ⚠️ MOLIT_API_KEY(.env.local)는 순수 hex라 특수문자가 없어 URL에 직접 붙여도 이중인코딩
//   문제가 없다(lib/molit-api.ts 상단 주석 참조 — 그 파일과 동일하게 serviceKey를 직접 보간).
//   시크릿(API 키)은 로그/반환값에 절대 노출하지 않는다.

const LIST_URL =
  "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3";
const BASS_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4";
const DTL_URL =
  "https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusDtlInfoV4";

/** fetchAptInfo가 반환하는 단지 정보 필드(미확보는 null). far/cov는 이번 Stage 항상 null. */
export interface AptInfoFields {
  households: number | null;
  buildings: number | null;
  hallway: string | null;
  heating: string | null;
  elev_pass: number | null;
  elev_per_hh: number | null;
  park_above: number | null;
  park_under: number | null;
  park_total: number | null;
  far_ratio: string | null;
  cov_ratio: string | null;
  addr: string | null;
}

function getApiKey(): string {
  const key = process.env.MOLIT_API_KEY;
  if (!key) {
    throw new Error("MOLIT_API_KEY가 설정되지 않았습니다 (.env.local 확인)");
  }
  return key;
}

// MOLIT JSON 응답은 항목 존재 여부에 따라 배열/객체가 오락가락한다(느슨하게 다룬다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

// 이름 정규화: 공백/괄호/하이픈 제거(원본 _get_kapt_code normalize와 동일).
function normalizeName(s: unknown): string {
  return String(s ?? "")
    .replace(/ /g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/-/g, "");
}

// 원본 iv() 헬퍼: 빈값/"0"/"null"/"None" 제외, 첫 유효값 반환.
function iv(d: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = d[k];
    if (v != null) {
      const s = String(v).trim();
      if (s !== "" && s !== "0" && s !== "null" && s !== "None") return v;
    }
  }
  return null;
}

// 문자열 필드: 트림 후 빈 문자열이면 null.
function strOf(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// 숫자 필드: 콤마 제거 후 int 파싱, 실패 시 null.
function intOf(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 단지명 + 시군구코드(5자리)로 kaptCode를 해결한다.
 * getSigunguAptList3를 numOfRows=1000 페이지네이션으로 totalCount까지 로드 후
 * 정규화 완전일치 → 부분일치 순으로 매칭. 실패 시 null.
 * 예외/네트워크 오류는 삼켜 null 반환(라우트가 음성 캐시로 처리).
 */
export async function resolveKaptCode(
  name: string,
  sigunguCd: string
): Promise<string | null> {
  const key = getApiKey();
  const allItems: Json[] = [];
  let page = 1;

  while (true) {
    const url =
      `${LIST_URL}?ServiceKey=${key}` +
      `&sigunguCode=${sigunguCd}` +
      `&numOfRows=1000&pageNo=${page}&_type=json`;
    let json: Json;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!res.ok) break;
      json = await res.json();
    } catch (e) {
      console.error("[apt-info: 단지목록 로드 오류]", e);
      break;
    }

    const body = json?.response?.body ?? {};
    const itemsRaw = body?.items;
    let raw: Json[];
    if (Array.isArray(itemsRaw)) raw = itemsRaw;
    else if (itemsRaw && typeof itemsRaw === "object") {
      const it = itemsRaw.item;
      raw = Array.isArray(it) ? it : it ? [it] : [];
    } else raw = [];

    if (raw.length === 0) break;
    allItems.push(...raw);

    const total = intOf(body?.totalCount) ?? 0;
    if (allItems.length >= total) break;
    page += 1;
  }

  const nameN = normalizeName(name);
  if (!nameN) return null;

  // 1) 완전일치
  for (const it of allItems) {
    if (normalizeName(it?.kaptName) === nameN) {
      const code = strOf(it?.kaptCode);
      if (code) return code;
    }
  }
  // 2) 부분일치
  for (const it of allItems) {
    const k = normalizeName(it?.kaptName);
    if (k && (k.includes(nameN) || nameN.includes(k))) {
      const code = strOf(it?.kaptCode);
      if (code) return code;
    }
  }
  return null;
}

// getAphusBassInfoV4 / getAphusDtlInfoV4 단건 조회(_type=json). item 객체 또는 {} 반환.
async function fetchItem(baseUrl: string, kaptCode: string): Promise<Record<string, unknown>> {
  const key = getApiKey();
  const url = `${baseUrl}?ServiceKey=${key}&kaptCode=${kaptCode}&_type=json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json: Json = await res.json();
    const item = json?.response?.body?.item;
    return item && typeof item === "object" && !Array.isArray(item) ? item : {};
  } catch (e) {
    console.error("[apt-info: 단지 상세 조회 오류]", e);
    return {};
  }
}

/**
 * kaptCode로 Bass+Dtl 2콜을 호출해 단지 정보 필드를 추출한다.
 * 원본 /api/aptinfo(1292-1407)의 MOLIT 부분 포팅. far/cov는 이번 Stage 항상 null.
 */
export async function fetchAptInfo(kaptCode: string): Promise<AptInfoFields> {
  const [bass, dtl] = await Promise.all([
    fetchItem(BASS_URL, kaptCode),
    fetchItem(DTL_URL, kaptCode),
  ]);

  const households = intOf(iv(bass, "kaptdaCnt", "hoCnt"));
  const buildings = intOf(iv(bass, "kaptDongCnt"));
  const hallway = strOf(iv(bass, "codeHallNm"));
  const heating = strOf(iv(bass, "codeHeatNm"));
  const addr = strOf(iv(bass, "kaptAddr", "doroJuso"));

  // 후순위(공짜로 딸려오는 것만): 승강기·주차 분해값.
  const elev_pass = intOf(iv(bass, "kaptdEcntp") ?? iv(dtl, "kaptdEcnt"));
  const park_above = intOf(iv(dtl, "kaptdPcnt"));
  const park_under = intOf(iv(dtl, "kaptdPcntu"));

  // 총주차: 지상+지하 합(둘 중 하나만 있으면 그 값). 원본 park_total 로직 계승.
  let park_total: number | null = null;
  if (park_above != null && park_under != null) park_total = park_above + park_under;
  else if (park_above != null) park_total = park_above;
  else if (park_under != null) park_total = park_under;

  // 세대당 승강기: households>0일 때만 파생(원본 round 3자리).
  let elev_per_hh: number | null = null;
  if (households != null && households > 0 && elev_pass != null) {
    elev_per_hh = Math.round((elev_pass / households) * 1000) / 1000;
  }

  return {
    households,
    buildings,
    hallway,
    heating,
    elev_pass,
    elev_per_hh,
    park_above,
    park_under,
    park_total,
    far_ratio: null, // 건축HUB 미호출(후순위, 기획안 §1-B) — 컬럼만 존재, 값 null 고정
    cov_ratio: null,
    addr,
  };
}
