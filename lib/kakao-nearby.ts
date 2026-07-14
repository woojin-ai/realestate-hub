// 아파트 상세 모달 — 주변 시설(Stage 3) 카카오 학교 조회 (기획안 §1-C / design §12·§14)
//
// 원본 출처(문자단위 대조 이관, 학교 부분만):
//   C:\bitcoin_vdcode\realestate\recommender.py  get_nearby_schools(93~166) 중 학교 SC4 + 급별 keyword 폴백,
//   _clean_school_name(42~58).
// 어린이집/병원/동물병원/편의시설은 이번 MVP 범위 밖이므로 포팅하지 않는다(기획안 §1-C).
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
  const result: NearbySchools = { elementary: [], middle: [], high: [] };

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
  const fallbacks: Array<{ key: keyof NearbySchools; keyword: string }> = [
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

  return result;
}
