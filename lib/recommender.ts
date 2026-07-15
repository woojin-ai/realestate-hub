// AI 맞춤 추천 엔진 — 점수 산식 포팅 (MVP: 가격·역세권·신축 3요소, 평지 제외)
//
// 원본 출처(문자단위 대조 이관):
//   C:\bitcoin_vdcode\realestate\recommender.py  score_apartments / get_coordinates / get_nearest_subway
//   C:\bitcoin_vdcode\realestate\app.py          /api/recommend (1004~1153줄)
//
// ⚠️ 이 모듈은 서버 전용(카카오 REST 호출)이다. Route Handler에서만 import 한다.
//    클라이언트 컴포넌트는 여기서 "타입만"(import type) 가져온다(런타임 코드 미포함).
//    카카오 키(KAKAO_API_KEY)는 함수 호출 시점에만 process.env로 읽으며 로그/응답에 노출하지 않는다.

import type { AptStat } from "./analyzer";

// ── 화면 데이터 계약 (design/ai-recommend-section.md §7) ─────────────────────
export interface RecommendItem {
  name: string;
  dong: string;
  build_year: string; // meta 표시
  avg_price: number | null; // "전체 평균" 표시
  // 지하철 배지
  subway_name: string; // 없으면 "-"(원본 규약 계승)
  subway_dist: number; // m, 미확인 시 9999(원본 규약 계승)
  // ★ 가중치 적용 전 "원점수" — 슬라이더 무호출 재정렬의 필수 입력(§3-B, §9)
  price_score: number; // 0~100
  subway_score: number; // 0~100
  newbuild_score: number; // 0~100
  score?: number; // 0~100 (서버가 넣어주는 초기값, 이후 클라가 재계산)
  // ★ 2026-07-15 추가: "평지 선호" 필터용 원점수. flat_only 미사용 시 조회 생략되어 null.
  slope_score?: number | null;
  // ★ 2026-07-15 추가: "최소 세대수" 필터용 참고값(apt_info 캐시 히트 시에만 채워짐, 미확인 시 null).
  households?: number | null;
  // ★ 원본 AptStat 전체(area_stats 포함) — 카드 클릭 시 AptDetailModal에 그대로 전달.
  //   후보 풀(top-200)은 클라의 rows(top-30)보다 넓어, rows 조회만으로는 top-30 밖 단지의
  //   모달이 열리지 않는다(design §4-C 옵션 b). 서버가 이미 가진 AptStat을 실어 rows 비의존화.
  apt: AptStat;
}

export interface RecommendResponse {
  items: RecommendItem[]; // 상위 10개(원본 컷오프 계승)
  filled: number; // 이번 라운드까지 geo가 채워진 후보 수 (진행 배지 N)
  total_candidates: number; // 예산·신축 필터 후 총 후보 수 (진행 배지 M)
  pending: boolean; // 아직 미채움분 남았는지(스켈레톤/더보기 여부)
  can_live?: boolean; // 라이브 지오코딩 채움 가능 여부(KAKAO 키 존재여부 boolean만; 키값 미노출)
}

export interface GeoInfo {
  lat: number | null;
  lng: number | null;
  subway_name: string;
  subway_dist: number;
}

// ★ 경사도 복원(2026-07-15) — 원본 recommender.py get_slope_score_vworld/get_route_slope_score
//   그대로 이관. 함수명은 "vworld"지만 실제로는 VWorld를 호출하지 않고 opentopodata(srtm30m) 우선 →
//   실패 시 open-elevation.com 폴백으로 고도값을 얻는다(원본 그대로, docs/planning/apt-detail-full-restore.md §0-1).
export interface RouteSlope {
  score: number | null; // 유효 고도 <3개면 null(원본: 측정불가)
  label: string; // 평지/완만/경사/급경사/측정불가
  elev_diff: number | null; // 역→아파트 고도차(m). +면 오르막
  elev_range: number | null;
  elev_start: number | null;
  elev_end: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 점수 산식 (recommender.py / app.py 그대로 이관)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 가격점수 = (지역 max_price − 단지 avg_price) / (max−min) × 100  — 저렴할수록 고득점.
 * 원본 app.py 1098~1100: price = avg_price or max_price; round((max_price - price)/price_range*100).
 * max_price / price_range 는 "후보 풀"(build_apt_stats top_n=200 전체, 필터 이전) 기준으로 계산한다(원본 동일).
 */
export function priceScore(
  avgPrice: number | null,
  maxPrice: number,
  priceRange: number
): number {
  const price = avgPrice || maxPrice; // 원본: avg_price가 없으면 max_price로 대체
  return Math.round(((maxPrice - price) / priceRange) * 100);
}

/**
 * 지역 후보 풀의 max_price 와 price_range(=max−min, 최소 1) 계산.
 * 원본 app.py 1058~1063: prices = [avg_price for a if avg_price]; max, range = max-min or 1.
 */
export function computePriceRange(pool: AptStat[]): {
  maxPrice: number;
  priceRange: number;
  hasPrices: boolean;
} {
  const prices = pool
    .map((a) => a.avg_price)
    .filter((p): p is number => p !== null && p !== undefined && p > 0);
  if (prices.length === 0) return { maxPrice: 0, priceRange: 1, hasPrices: false };
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  const priceRange = maxPrice - minPrice || 1; // 원본: or 1 (0 나눗셈 방지)
  return { maxPrice, priceRange, hasPrices: true };
}

/**
 * 역세권점수 — 거리 구간(원본 app.py 1128~1132 그대로).
 * ≤300m 100 / ≤500m 85 / ≤800m 65 / ≤1200m 40 / else 15.
 */
export function subwayScore(dist: number): number {
  if (dist <= 300) return 100;
  if (dist <= 500) return 85;
  if (dist <= 800) return 65;
  if (dist <= 1200) return 40;
  return 15;
}

/**
 * 신축점수 — 원본 app.py 1102~1118 그대로.
 * newYear>0: 기준연도 구간(기준≤ 100 / −5년 70 / −10년 40 / >0 10 / else 0).
 * newYear===0: 절대연도(2026 기준) 구간(−5 100 / −10 80 / −15 60 / −20 40 / −30 20 / >0 10 / else 0).
 */
export function newbuildScore(buildYearRaw: string, newYear: number): number {
  const buildYear = parseInt(buildYearRaw || "0", 10) || 0;
  if (newYear === 0) {
    const curYear = 2026; // 원본 app.py 1105: cur_year = 2026
    if (buildYear >= curYear - 5) return 100;
    if (buildYear >= curYear - 10) return 80;
    if (buildYear >= curYear - 15) return 60;
    if (buildYear >= curYear - 20) return 40;
    if (buildYear >= curYear - 30) return 20;
    if (buildYear > 0) return 10;
    return 0;
  }
  if (buildYear >= newYear) return 100;
  if (buildYear >= newYear - 5) return 70;
  if (buildYear >= newYear - 10) return 40;
  if (buildYear > 0) return 10;
  return 0;
}

/**
 * 종합점수(초기값) — MVP는 3요소만. 원본은 4요소(가격/역세권/신축/평지) 가중합이지만
 * 평지를 제외했으므로 3요소 가중치 합으로 재정규화한다(design §3-B / §7 공식과 동일:
 * score = Σ(wᵢ·raw)/Σwᵢ). 클라이언트도 동일 공식으로 슬라이더 재조정 시 재계산한다.
 */
export function compositeScore(
  priceRaw: number,
  subwayRaw: number,
  newRaw: number,
  weights: { price: number; subway: number; new: number }
): number {
  const sum = weights.price + weights.subway + weights.new;
  if (sum <= 0) return Math.round((priceRaw + subwayRaw + newRaw) / 3);
  return Math.round(
    (priceRaw * weights.price + subwayRaw * weights.subway + newRaw * weights.new) / sum
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 카카오 REST 호출 (recommender.py get_coordinates / get_nearest_subway 그대로 이관)
//  - 순차 호출, 각 호출 timeout 5s(원본 timeout=5), 호출 사이 sleep 0.1s(원본).
//  - 키는 함수 내부에서만 읽고 어떤 경로로도 노출하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

const KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const KAKAO_CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json";

function kakaoHeaders(): Record<string, string> | null {
  const key = process.env.KAKAO_API_KEY;
  if (!key) return null; // 키 없으면 라이브 호출 자체를 건너뛴다(폴백)
  return { Authorization: `KakaoAK ${key}` };
}

export function hasKakaoKey(): boolean {
  return !!process.env.KAKAO_API_KEY;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * get_coordinates — 카카오 키워드검색 1회 → 좌표(y=lat, x=lng).
 * 원본 recommender.py 61~73: query = f"{gu} {dong} {apt}", size=1, timeout=5.
 */
export async function getCoordinates(
  aptName: string,
  dong: string,
  guName: string
): Promise<{ lat: number | null; lng: number | null }> {
  const headers = kakaoHeaders();
  if (!headers) return { lat: null, lng: null };
  const query = `${guName} ${dong} ${aptName}`;
  try {
    const url = `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(query)}&size=1`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { lat: null, lng: null };
    const json = (await res.json()) as { documents?: Array<{ x: string; y: string }> };
    const docs = json.documents ?? [];
    if (docs.length > 0) {
      return { lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) };
    }
  } catch {
    // 원본은 좌표오류 로그만 남기고 None,None 반환 — 키 노출 방지 위해 상세 로그 생략.
  }
  return { lat: null, lng: null };
}

/**
 * get_nearest_subway — 카카오 카테고리검색(SW8) 1회 → 최근접 지하철 {name, distance}.
 * 원본 recommender.py 76~90: category_group_code=SW8, radius=2000, sort=distance, size=1, timeout=5.
 * 실패/미검색 시 {name:"-", distance:9999}(원본 규약).
 */
export async function getNearestSubway(
  lat: number,
  lng: number
): Promise<{ name: string; distance: number }> {
  const headers = kakaoHeaders();
  if (!headers) return { name: "-", distance: 9999 };
  try {
    const url =
      `${KAKAO_CATEGORY_URL}?category_group_code=SW8` +
      `&x=${lng}&y=${lat}&radius=2000&sort=distance&size=1`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { name: "-", distance: 9999 };
    const json = (await res.json()) as {
      documents?: Array<{ place_name: string; distance: string }>;
    };
    const docs = json.documents ?? [];
    if (docs.length > 0) {
      return { name: docs[0].place_name, distance: parseInt(docs[0].distance, 10) };
    }
  } catch {
    // 원본 규약대로 기본값 반환.
  }
  return { name: "-", distance: 9999 };
}

/**
 * 단지 1건의 좌표+최근접지하철을 라이브로 채운다(콜드 채움 1건).
 * 원본 app.py 1120~1125: 좌표 조회 → sleep 0.1 → (좌표 있으면) 지하철 조회 → sleep 0.1.
 * 좌표 조회 실패 시 지하철은 기본값(-, 9999)으로 두고 그대로 반환(원본과 동일하게 점수화 대상).
 */
export async function fillGeo(
  aptName: string,
  dong: string,
  guName: string
): Promise<GeoInfo> {
  const { lat, lng } = await getCoordinates(aptName, dong, guName);
  await sleep(100); // 원본 recommender/app.py: time.sleep(0.1)
  let subway = { name: "-", distance: 9999 };
  if (lat && lng) {
    subway = await getNearestSubway(lat, lng);
    await sleep(100); // 원본: time.sleep(0.1)
  }
  return { lat, lng, subway_name: subway.name, subway_dist: subway.distance };
}

/**
 * fillGeoDetail — 상세 모달(단건, on-demand 응답)용 좌표+지하철 채움.
 * 원본 app.py의 /api/location(1454~1470줄, 단건 조회 엔드포인트)은 recommend 배치 루프와 달리
 * time.sleep 호출이 전혀 없다(sleep은 score_apartments의 다건 순회에서만 레이트리밋 목적으로 존재).
 * fillGeo()의 sleep(100)×2는 배치 전용이므로, 모달 단건 조회에 그대로 쓰면 원본에 없는 ~200ms
 * 인위적 지연이 매 콜드조회마다 추가된다 → 상세모달 경로는 이 sleep-free 버전을 쓴다(속도 개선 §3).
 */
export async function fillGeoDetail(
  aptName: string,
  dong: string,
  guName: string
): Promise<GeoInfo> {
  const { lat, lng } = await getCoordinates(aptName, dong, guName);
  let subway = { name: "-", distance: 9999 };
  if (lat && lng) {
    subway = await getNearestSubway(lat, lng);
  }
  return { lat, lng, subway_name: subway.name, subway_dist: subway.distance };
}

// ─────────────────────────────────────────────────────────────────────────────
// 경사도(고도 기반) — recommender.py get_elevations_batch/get_slope_score_vworld/
// get_subway_coordinates/get_route_slope_score 그대로 이관.
// ─────────────────────────────────────────────────────────────────────────────

const OPENTOPODATA_URL = "https://api.opentopodata.org/v1/srtm30m";
const OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup";

/**
 * get_elevations_batch — opentopodata(srtm30m) 우선, 실패/전부 null이면 open-elevation.com POST 폴백.
 * 원본 recommender.py 293~315: 두 소스 모두 timeout=12, 좌표 순서 (lat,lng) 유지.
 */
export async function getElevationsBatch(
  points: Array<{ lat: number; lng: number }>
): Promise<Array<number | null>> {
  try {
    const locStr = points.map((p) => `${p.lat},${p.lng}`).join("|");
    const res = await fetch(`${OPENTOPODATA_URL}?locations=${locStr}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{ elevation: number | null }>;
      };
      const results = json.results ?? [];
      const elevations = results.map((r) =>
        r.elevation != null ? Number(r.elevation) : null
      );
      if (elevations.some((e) => e !== null)) return elevations;
    }
  } catch {
    // opentopodata 실패 → open-elevation 폴백(원본 그대로)
  }
  try {
    const locations = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    const res = await fetch(OPEN_ELEVATION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{ elevation: number | null }>;
      };
      const results = json.results ?? [];
      const elevations = results.map((r) =>
        r.elevation != null ? Number(r.elevation) : null
      );
      if (elevations.some((e) => e !== null)) return elevations;
    }
  } catch {
    // 두 소스 모두 실패 → 전부 null(호출부가 기본값으로 폴백)
  }
  return points.map(() => null);
}

/**
 * get_slope_score_vworld — 단지 좌표 주변 5점(중심+상하좌우 delta=0.002) 고도범위 → 평지점수.
 * 원본 recommender.py 318~330: 유효 고도 <3개면 기본값 50. elev_range<=5:90/<=15:70/<=30:40/else:15.
 */
export async function getSlopeScore(lat: number, lng: number): Promise<number> {
  const delta = 0.002;
  const points = [
    { lat, lng },
    { lat: lat + delta, lng },
    { lat: lat - delta, lng },
    { lat, lng: lng + delta },
    { lat, lng: lng - delta },
  ];
  const raw = await getElevationsBatch(points);
  const elevations = raw.filter((e): e is number => e !== null);
  if (elevations.length < 3) return 50; // 원본: 데이터 부족 기본값 50점
  const elevRange = Math.max(...elevations) - Math.min(...elevations);
  if (elevRange <= 5) return 90;
  if (elevRange <= 15) return 70;
  if (elevRange <= 30) return 40;
  return 15;
}

/**
 * get_subway_coordinates — 역명으로 카카오 키워드검색(SW8) → 좌표. 원본 333~352 이관.
 * 원본은 "역 " 포함 시 그 앞부분, "역임"/"역사거리" 포함 시 첫 단어만 잘라 검색어로 씀.
 */
export async function getSubwayCoordinates(
  subwayName: string
): Promise<{ lat: number | null; lng: number | null }> {
  const headers = kakaoHeaders();
  if (!headers) return { lat: null, lng: null };
  let cleanName = subwayName;
  if (subwayName.includes("역 ")) {
    cleanName = subwayName.slice(0, subwayName.indexOf("역 ") + 1);
  } else if (subwayName.includes("역임") || subwayName.includes("역사거리")) {
    cleanName = subwayName.split(/\s+/)[0];
  }
  try {
    const url =
      `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(cleanName)}` +
      `&category_group_code=SW8&size=1`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { lat: null, lng: null };
    const json = (await res.json()) as { documents?: Array<{ x: string; y: string }> };
    const docs = json.documents ?? [];
    if (docs.length > 0) {
      return { lat: parseFloat(docs[0].y), lng: parseFloat(docs[0].x) };
    }
  } catch {
    // 원본 규약대로 null,null 반환
  }
  return { lat: null, lng: null };
}

/**
 * get_route_slope_score — 역→아파트 직선을 steps(기본5) 등분한 지점들의 고도로 경로 경사 산출.
 * 원본 355~374 이관: 유효 고도 <3개면 {score:null,label:"측정불가"}(원본은 score:50이지만
 * 화면에서 "측정불가"와 함께 50점을 보여주면 오인식 소지가 있어, null로 표기해 UI가 점수를 숨기게 함
 * — 라벨/색상 로직은 rsScore가 falsy면 회색 처리하는 원본 app.py 1462줄 렌더 규칙과 일치).
 */
export async function getRouteSlopeScore(
  aptLat: number,
  aptLng: number,
  subLat: number,
  subLng: number,
  steps = 5
): Promise<RouteSlope> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      lat: subLat + (aptLat - subLat) * t,
      lng: subLng + (aptLng - subLng) * t,
    });
  }
  const raw = await getElevationsBatch(points);
  const elevations = raw.filter((e): e is number => e !== null);
  if (elevations.length < 3) {
    return { score: null, label: "측정불가", elev_diff: null, elev_range: null, elev_start: null, elev_end: null };
  }
  const elevStart = elevations[0];
  const elevEnd = elevations[elevations.length - 1];
  const elevDiff = elevEnd - elevStart;
  const elevRange = Math.max(...elevations) - Math.min(...elevations);
  let score: number;
  let label: string;
  if (elevRange <= 5) {
    score = 90;
    label = "평지";
  } else if (elevRange <= 15) {
    score = 70;
    label = "완만";
  } else if (elevRange <= 30) {
    score = 40;
    label = "경사";
  } else {
    score = 15;
    label = "급경사";
  }
  return {
    score,
    label,
    elev_diff: Math.round(elevDiff * 10) / 10,
    elev_range: Math.round(elevRange * 10) / 10,
    elev_start: Math.round(elevStart * 10) / 10,
    elev_end: Math.round(elevEnd * 10) / 10,
  };
}

/**
 * fillSlope — 단지 좌표(+확보된 최근접 지하철명)로 slope_score/route_slope를 함께 채운다.
 * 속도 개선(§3): 단지 경사도(slope_score)는 지하철 결과와 무관하므로, 지하철역 좌표조회와
 * "병렬"로 실행한다(원본/이전 순차 구현 대비 대기시간 단축). route_slope는 역 좌표가 있어야
 * 계산 가능하므로 역좌표 확보 이후에만 이어서 계산한다.
 */
export async function fillSlope(
  aptLat: number,
  aptLng: number,
  subwayName: string,
  subwayDist: number
): Promise<{ slope_score: number; route_slope: RouteSlope }> {
  const hasSubway = subwayName !== "-" && subwayDist < 9999;

  const [slopeScore, subwayCoord] = await Promise.all([
    getSlopeScore(aptLat, aptLng),
    hasSubway ? getSubwayCoordinates(subwayName) : Promise.resolve({ lat: null, lng: null }),
  ]);

  let routeSlope: RouteSlope = {
    score: null,
    label: "측정불가",
    elev_diff: null,
    elev_range: null,
    elev_start: null,
    elev_end: null,
  };
  if (subwayCoord.lat != null && subwayCoord.lng != null) {
    routeSlope = await getRouteSlopeScore(aptLat, aptLng, subwayCoord.lat, subwayCoord.lng);
  }

  return { slope_score: slopeScore, route_slope: routeSlope };
}
