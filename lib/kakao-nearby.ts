// 아파트 상세 모달 — 주변 시설 카카오 조회 (기획안 §1-C / design §12·§14, 2026-07-15 전면 확장)
//
// 원본 출처(문자단위 대조 이관):
//   C:\bitcoin_vdcode\realestate\recommender.py
//     get_nearby_schools(93~166) — 학교 SC4 + 급별 keyword 폴백 + 어린이집(국공립/사립),
//     _clean_school_name(42~58),
//     get_nearest_big_hospital(169~218) — 대형(3차)병원 키워드검색 + HP8 카테고리,
//     get_nearest_vet_hospital(221~237) — 동물병원 키워드검색,
//     get_nearby_convenience(240~290) — 편의점/마트/카페/음식점/약국/은행(MT1/CS2/CE7/FD6/PM9/BK9).
//   BIG_HOSPITAL_KEYWORDS(16~27) / ANIMAL_HOSPITAL_KEYWORDS(29) / _is_animal_hospital(32~33) /
//   _is_big_hospital(36~39) 도 그대로 이관.
//
// ⚠️ 서버 전용(카카오 REST 호출). Route Handler에서만 import 한다.
//    카카오 키(KAKAO_API_KEY)는 함수 호출 시점에만 process.env로 읽으며 로그/응답에 노출하지 않는다.

const KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json";

// 응답 계약(design §14-2 C행): 각 급 {name, distance}[] 배열(거리순).
export interface SchoolEntry {
  name: string;
  distance: number;
}
export interface NearbySchools {
  elementary: SchoolEntry[];
  middle: SchoolEntry[];
  high: SchoolEntry[];
  // 어린이집(반경 500m, 원본 recommender.py get_nearby_schools 138~163) — 2026-07-15 추가.
  daycare_public: number;
  daycare_private: number;
}

// 대형(3차) 병원 항목 — 원본 get_nearest_big_hospital 반환 형태.
export interface BigHospital {
  name: string;
  distance: number;
  address: string;
}

// 동물병원 항목 — 원본 get_nearest_vet_hospital 반환 형태.
export interface VetHospital {
  name: string;
  distance: number;
}

// 편의시설 개수 — 원본 get_nearby_convenience 반환 형태(카카오 카테고리 코드 그대로).
export interface ConvenienceCounts {
  supermarket: number; // MT1 대형마트
  convenience: number; // CS2 편의점
  cafe: number; // CE7 카페
  restaurant: number; // FD6 음식점
  pharmacy: number; // PM9 약국
  bank: number; // BK9 은행
}

// 주변시설 전체 응답(학교+어린이집+대형병원+동물병원+편의시설). apt_nearby.payload와 1:1.
export interface NearbyAll extends NearbySchools {
  big_hospital: BigHospital;
  vet_hospital: VetHospital;
  convenience: ConvenienceCounts;
}

// 스키마 버전 가드(2026-07-16 추가): apt_nearby 캐시 히트 시 payload가 "현재" NearbyAll 스키마의
// 필드를 모두 채우고 있는지 검증한다. 어린이집/대형병원/동물병원/편의시설 확장(2026-07-15) 이전에
// 캐시된 구버전 payload(학교 정보만 있음)는 나이(90일 TTL)만으로는 걸러지지 않으므로,
// 필드 존재 여부로 별도 판별해 구버전이면 캐시 미스로 취급하고 라이브 재조회 → upsert로 자동 갱신한다.
// 스키마가 또 확장되면 이 목록에 신규 필드 키만 추가하면 된다.
const REQUIRED_NEARBY_KEYS: (keyof NearbyAll)[] = [
  "elementary",
  "middle",
  "high",
  "daycare_public",
  "daycare_private",
  "big_hospital",
  "vet_hospital",
  "convenience",
];

export function isPayloadUpToDate(payload: unknown): payload is NearbyAll {
  if (!payload || typeof payload !== "object") return false;
  return REQUIRED_NEARBY_KEYS.every((key) => key in (payload as Record<string, unknown>));
}

// 원본 recommender.py 16~29: 대형(3차)병원 판별 키워드 + 동물병원 판별 키워드.
const BIG_HOSPITAL_KEYWORDS: string[] = [
  "대학병원", "대학교병원", "의과대학", "의대병원",
  "상급종합", "종합병원", "대학의료원", "의료원",
  "세브란스", "삼성서울", "서울아산", "서울성모", "강남성모",
  "서울대병원", "분당서울대", "보라매병원", "국립암센터",
  "아주대병원", "한양대병원", "경희대병원", "고려대병원",
  "이화여대목동", "중앙대병원", "인하대병원", "가천대길병원",
  "순천향대병원", "동국대병원", "원주세브란스", "강릉아산",
  "전남대병원", "전북대병원", "충남대병원", "충북대병원",
  "경북대병원", "부산대병원", "경상대병원", "제주대병원",
  "을지대병원", "건국대병원", "국립중앙의료원",
];
const ANIMAL_HOSPITAL_KEYWORDS: string[] = ["동물", "수의", "펫", "pet", "veterinary"];

function isAnimalHospital(name: string): boolean {
  const lower = name.toLowerCase();
  return ANIMAL_HOSPITAL_KEYWORDS.some((kw) => lower.includes(kw));
}

function isBigHospital(name: string, category = ""): boolean {
  if (isAnimalHospital(name)) return false;
  const combined = name + category;
  return BIG_HOSPITAL_KEYWORDS.some((kw) => combined.includes(kw));
}

function kakaoHeaders(): Record<string, string> | null {
  const key = process.env.KAKAO_API_KEY;
  if (!key) return null; // 키 없으면 라이브 호출 자체를 건너뛴다(빈 결과 반환)
  return { Authorization: `KakaoAK ${key}` };
}

/**
 * _clean_school_name — 원본 recommender.py 42~58 그대로 이관.
 * 카카오 place_name의 부속실 접미("교무실"·"급식실" 등)를 제거하고, 학교급 접미가 없으면 붙인다.
 */
function cleanSchoolName(placeName: string, schoolType: string): string {
  const REMOVE_SUFFIXES = [
    "교무실",
    "행정실",
    "급식실",
    "체육관",
    "도서관",
    "방과후",
    "유치원실",
  ];
  const suffixMap: Record<string, string> = {
    초등학교: "초등학교",
    중학교: "중학교",
    고등학교: "고등학교",
  };
  const schoolSuffix = suffixMap[schoolType] ?? "";
  let cleaned = placeName.trim();
  if (schoolSuffix && cleaned.includes(schoolSuffix)) {
    for (const suf of REMOVE_SUFFIXES) {
      if (cleaned.endsWith(suf)) {
        cleaned = cleaned.slice(0, cleaned.length - suf.length).trim();
      }
    }
    return cleaned;
  }
  for (const suf of REMOVE_SUFFIXES) {
    if (cleaned.includes(suf)) {
      cleaned = cleaned.slice(0, cleaned.indexOf(suf)).trim();
      break;
    }
  }
  if (schoolSuffix && !cleaned.endsWith(schoolSuffix)) {
    cleaned = cleaned + schoolSuffix;
  }
  return cleaned;
}

/**
 * get_nearby_schools의 학교 부분 이관(어린이집/병원 제외).
 * ① SC4 category 1콜(size=15, sort=distance) → category_name/place_name으로 초/중/고 분류(원본 분기 규칙 그대로).
 * ② 급별 결과 0개면 keyword.json 폴백(query=학교급, size=5) + cleanSchoolName 적용.
 * 각 배열은 거리순 정렬 유지. 개별 카카오 콜 실패는 try/catch로 무시(빈 배열). 키 없으면 빈 결과.
 */
export async function fetchNearbySchools(
  lat: number,
  lng: number,
  radius = 1000
): Promise<NearbySchools> {
  const result: NearbySchools = {
    elementary: [],
    middle: [],
    high: [],
    daycare_public: 0,
    daycare_private: 0,
  };

  const headers = kakaoHeaders();
  if (!headers) return result; // 키 없으면 빈 결과(폴백)

  // ── ① SC4 카테고리 검색(학교) 1콜 ─────────────────────────────────────────
  try {
    const url =
      `${KAKAO_CATEGORY_URL}?category_group_code=SC4` +
      `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as {
        documents?: Array<{
          category_name?: string;
          place_name: string;
          distance: string;
        }>;
      };
      for (const doc of json.documents ?? []) {
        const cat = doc.category_name ?? "";
        const name = doc.place_name;
        const dist = parseInt(doc.distance, 10);
        const entry: SchoolEntry = { name, distance: dist };
        // 원본 if/elif/elif 분기 규칙 그대로(중학교는 "고등학교" 미포함 조건).
        if (cat.includes("초등학교") || name.includes("초등학교")) {
          result.elementary.push(entry);
        } else if (
          cat.includes("중학교") ||
          (name.includes("중학교") && !name.includes("고등학교"))
        ) {
          result.middle.push(entry);
        } else if (cat.includes("고등학교") || name.includes("고등학교")) {
          result.high.push(entry);
        }
      }
    }
  } catch {
    // 원본: 학교SC4오류 로그만 남기고 진행 — 키 노출 방지 위해 상세 로그 생략.
  }

  // ── ② 급별 결과 0개면 keyword 폴백(각 최대 1콜) ────────────────────────────
  const fallbacks: Array<{ key: "elementary" | "middle" | "high"; keyword: string }> = [
    { key: "elementary", keyword: "초등학교" },
    { key: "middle", keyword: "중학교" },
    { key: "high", keyword: "고등학교" },
  ];
  for (const { key, keyword } of fallbacks) {
    if (result[key].length > 0) continue;
    try {
      const url =
        `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(keyword)}` +
        `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=5`;
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          documents?: Array<{ place_name: string; distance: string }>;
        };
        for (const doc of json.documents ?? []) {
          result[key].push({
            name: cleanSchoolName(doc.place_name, keyword),
            distance: parseInt(doc.distance, 10),
          });
        }
      }
    } catch {
      // 원본: 학교키워드오류 로그만 — 상세 로그 생략(키 노출 방지).
    }
  }

  // 거리순 정렬 유지(카카오 sort=distance이나 폴백 병합 후에도 보장).
  result.elementary.sort((a, b) => a.distance - b.distance);
  result.middle.sort((a, b) => a.distance - b.distance);
  result.high.sort((a, b) => a.distance - b.distance);

  // ── ③ 어린이집(반경 500m) — 원본 138~163: "국공립어린이집" 키워드로 국공립 개수,
  //     "어린이집" 전체 키워드에서 국공립 개수를 뺀 값을 사립으로 산출(중복 제거 없이 개수 차감).
  const DAYCARE_RADIUS = 500;
  try {
    const url =
      `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent("국공립어린이집")}` +
      `&x=${lng}&y=${lat}&radius=${DAYCARE_RADIUS}&sort=distance&size=15`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as { documents?: unknown[] };
      result.daycare_public = (json.documents ?? []).length;
    }
  } catch {
    // 원본: 어린이집(국공립) 오류 로그만 — 상세 로그 생략.
  }
  try {
    const url =
      `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent("어린이집")}` +
      `&x=${lng}&y=${lat}&radius=${DAYCARE_RADIUS}&sort=distance&size=15`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as { documents?: unknown[] };
      const totalDc = (json.documents ?? []).length;
      result.daycare_private = Math.max(0, totalDc - result.daycare_public);
    }
  } catch {
    // 원본: 어린이집(전체) 오류 로그만 — 상세 로그 생략.
  }

  return result;
}

/**
 * get_nearest_big_hospital — 원본 recommender.py 169~218 그대로 이관.
 * 대형병원 키워드 5종(대학병원/상급종합병원/대학교병원/의료원/종합병원) keyword 검색(각 size=5)
 * + HP8 카테고리 검색(size=15)을 합쳐 이름 중복 제거 후 최단거리 1건 반환.
 */
export async function fetchNearestBigHospital(
  lat: number,
  lng: number,
  radius = 5000
): Promise<BigHospital> {
  const NOT_FOUND: BigHospital = { name: "-", distance: 9999, address: "" };
  const headers = kakaoHeaders();
  if (!headers) return NOT_FOUND;

  const candidates: BigHospital[] = [];

  for (const kw of ["대학병원", "상급종합병원", "대학교병원", "의료원", "종합병원"]) {
    try {
      const url =
        `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(kw)}` +
        `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=5`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = (await res.json()) as {
          documents?: Array<{
            place_name: string;
            distance: string;
            category_name?: string;
            road_address_name?: string;
          }>;
        };
        for (const doc of json.documents ?? []) {
          const name = doc.place_name;
          const cat = doc.category_name ?? "";
          if (isAnimalHospital(name)) continue;
          if (isBigHospital(name, cat) || cat.includes("종합병원")) {
            candidates.push({
              name,
              distance: parseInt(doc.distance, 10),
              address: doc.road_address_name ?? "",
            });
          }
        }
      }
    } catch {
      // 원본: 대형병원오류 로그만 — 상세 로그 생략.
    }
  }

  try {
    const url =
      `${KAKAO_CATEGORY_URL}?category_group_code=HP8` +
      `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as {
        documents?: Array<{
          place_name: string;
          distance: string;
          category_name?: string;
          road_address_name?: string;
        }>;
      };
      for (const doc of json.documents ?? []) {
        const name = doc.place_name;
        const cat = doc.category_name ?? "";
        if (isAnimalHospital(name)) continue;
        if (cat.includes("종합병원") || isBigHospital(name, cat)) {
          candidates.push({
            name,
            distance: parseInt(doc.distance, 10),
            address: doc.road_address_name ?? "",
          });
        }
      }
    }
  } catch {
    // 원본: 대형병원HP8오류 로그만 — 상세 로그 생략.
  }

  if (candidates.length === 0) return NOT_FOUND;
  const seen = new Set<string>();
  const unique: BigHospital[] = [];
  for (const c of candidates) {
    if (!seen.has(c.name)) {
      seen.add(c.name);
      unique.push(c);
    }
  }
  return unique.reduce((best, c) => (c.distance < best.distance ? c : best), unique[0]);
}

/**
 * get_nearest_vet_hospital — 원본 recommender.py 221~237 그대로 이관.
 * "동물병원" keyword 검색(radius=1000, size=3) 최근접 1건.
 */
export async function fetchNearestVetHospital(
  lat: number,
  lng: number,
  radius = 1000
): Promise<VetHospital> {
  const NOT_FOUND: VetHospital = { name: "-", distance: 9999 };
  const headers = kakaoHeaders();
  if (!headers) return NOT_FOUND;
  try {
    const url =
      `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent("동물병원")}` +
      `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=3`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as {
        documents?: Array<{ place_name: string; distance: string }>;
      };
      const docs = json.documents ?? [];
      if (docs.length > 0) {
        return { name: docs[0].place_name, distance: parseInt(docs[0].distance, 10) };
      }
    }
  } catch {
    // 원본: 동물병원오류 로그만 — 상세 로그 생략.
  }
  return NOT_FOUND;
}

/**
 * get_nearby_convenience — 원본 recommender.py 240~290 그대로 이관.
 * 카카오 카테고리 코드(MT1/CS2/CE7/FD6/PM9/BK9)별 반경 내 개수(size=15 상한)를 센다.
 */
export async function fetchConvenience(
  lat: number,
  lng: number,
  radius = 500
): Promise<ConvenienceCounts> {
  const result: ConvenienceCounts = {
    supermarket: 0,
    convenience: 0,
    cafe: 0,
    restaurant: 0,
    pharmacy: 0,
    bank: 0,
  };
  const headers = kakaoHeaders();
  if (!headers) return result;

  const catMap: Array<{ code: string; key: keyof ConvenienceCounts }> = [
    { code: "MT1", key: "supermarket" },
    { code: "CS2", key: "convenience" },
    { code: "CE7", key: "cafe" },
    { code: "FD6", key: "restaurant" },
    { code: "PM9", key: "pharmacy" },
    { code: "BK9", key: "bank" },
  ];

  for (const { code, key } of catMap) {
    try {
      const url =
        `${KAKAO_CATEGORY_URL}?category_group_code=${code}` +
        `&x=${lng}&y=${lat}&radius=${radius}&sort=distance&size=15`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = (await res.json()) as { documents?: unknown[] };
        result[key] = (json.documents ?? []).length;
      }
    } catch {
      // 원본: 편의시설오류 로그만 — 상세 로그 생략.
    }
  }

  return result;
}

/**
 * 주변시설 전체 조회 — 학교(+어린이집) + 대형병원 + 동물병원 + 편의시설을 한 번에 채운다.
 * apt-nearby Route Handler에서 사용(apt_nearby.payload 그대로 저장/반환).
 * 병렬로 호출해 지연을 줄인다(원본 app.py는 순차 호출이었으나 서버리스 타임아웃 고려해 병렬화).
 */
export async function fetchNearbyAll(lat: number, lng: number): Promise<NearbyAll> {
  const [schools, bigHospital, vetHospital, convenience] = await Promise.all([
    fetchNearbySchools(lat, lng),
    fetchNearestBigHospital(lat, lng),
    fetchNearestVetHospital(lat, lng),
    fetchConvenience(lat, lng),
  ]);
  return {
    ...schools,
    big_hospital: bigHospital,
    vet_hospital: vetHospital,
    convenience,
  };
}
