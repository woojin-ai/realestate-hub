import { NextResponse, type NextRequest } from "next/server";
import {
  collectMonth,
  getYmList,
  type MonthData,
} from "@/lib/molit-api";
import { buildAptStats, type AllData, type AptStat } from "@/lib/analyzer";
import { getSupabaseServerClient } from "@/lib/supabase";
import { loadMonthFromDb } from "@/lib/db-cache";
import {
  priceScore,
  subwayScore,
  newbuildScore,
  compositeScore,
  computePriceRange,
  fillGeo,
  hasKakaoKey,
  getSlopeScore,
  type GeoInfo,
  type RecommendItem,
  type RecommendResponse,
} from "@/lib/recommender";

// 추천은 사용자 입력 의존·동적 결과이므로 캐시하지 않는다(기획 §4: SEO 인덱싱 대상 아님).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECOMMEND_MONTHS = 13; // 대시보드(/api/data)와 동일 수집 범위
const CANDIDATE_TOP_N = 200; // 후보 풀 확보(기본 30 아님, 기획 §0 주의사항)
const COLD_FILL_LIMIT = 8; // 콜드 채움 상한 K/라운드 (마스터 결정: Vercel 10초 가정 보수값)
const FETCH_CONCURRENCY = 3; // molit 폴백 시 월별 병렬 배치
const EMPTY_MONTH: MonthData = { 매매: [], 전세: [], 월세: [] };

const geoKey = (name: string, dong: string) => `${name}||${dong}`;

/**
 * 아파트 13개월 allData 확보. 대시보드(/api/data)의 Supabase 우선 + molit 폴백 패턴을
 * 그대로 따른다(추천 섹션은 이미 조회에 성공한 지역 위에서만 뜨므로 통상 DB 웜히트).
 * Supabase 미구성/실패 시에도 molit 라이브 호출로 폴백해 라우트가 죽지 않는다.
 */
async function loadAptAllData(lawdCd: string): Promise<AllData> {
  const ymList = getYmList(RECOMMEND_MONTHS);
  const allData: AllData = {};

  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[recommend: Supabase 초기화 실패, molit 폴백]", err);
  }

  const toFetch: string[] = [];
  if (supabase) {
    for (const ym of ymList) {
      try {
        allData[ym] = await loadMonthFromDb(supabase, lawdCd, "아파트", ym);
      } catch (err) {
        console.error(`[recommend: DB 조회 실패, molit 폴백] ym=${ym}`, err);
        toFetch.push(ym);
      }
    }
    // DB에 이 지역 데이터가 전혀 없으면(사전 수집 안 됨) molit로 전량 폴백.
    const anyRecords = Object.values(allData).some(
      (m) => m.매매.length + m.전세.length + m.월세.length > 0
    );
    if (!anyRecords && toFetch.length === 0) toFetch.push(...ymList);
  } else {
    toFetch.push(...ymList);
  }

  for (let i = 0; i < toFetch.length; i += FETCH_CONCURRENCY) {
    const chunk = toFetch.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (ym) => {
        try {
          return { ym, data: await collectMonth(lawdCd, ym, "아파트") };
        } catch (err) {
          console.error(`[recommend: collectMonth 실패] ym=${ym}`, err);
          return { ym, data: EMPTY_MONTH };
        }
      })
    );
    for (const { ym, data } of results) allData[ym] = data;
  }

  return allData;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const lawdCd = sp.get("lawd_cd");
  if (!lawdCd || !/^\d{5}$/.test(lawdCd)) {
    return NextResponse.json(
      { error: "lawd_cd(법정동 시군구코드, 5자리 숫자)가 필요합니다." },
      { status: 400 }
    );
  }

  const gu = sp.get("gu") ?? "";
  const dealType = sp.get("deal_type") === "전세" ? "전세" : "매매";

  // 예산: 비면 null. budget_type max=이하 / min=이상 (원본 app.py 1031~1033).
  const budgetRaw = (sp.get("budget") ?? "").trim();
  const budgetVal = budgetRaw ? Number(budgetRaw) : null;
  const budgetType = sp.get("budget_type") === "min" ? "min" : "max";
  const budgetMax =
    budgetType === "max" && budgetVal !== null && Number.isFinite(budgetVal) ? budgetVal : null;
  const budgetMin =
    budgetType === "min" && budgetVal !== null && Number.isFinite(budgetVal) ? budgetVal : null;

  // 신축기준연도. 클라(AiRecommendSection)의 기본값과 동일하게, year가 없거나 빈
  // 문자열이거나 파싱 불가일 때 (현재연도 - 10)을 폴백으로 쓴다.
  // (구버전 주석의 "default 2015"는 sp.get("year")==null 시 Number(null)===0 이라
  //  실제로는 도달 불가한 죽은 코드였으므로 클라 기본값과 통일한다.)
  const yearRaw = sp.get("year");
  const yearParsed = Number(yearRaw);
  const newYear =
    yearRaw !== null && yearRaw !== "" && Number.isFinite(yearParsed)
      ? yearParsed
      : new Date().getFullYear() - 10;

  // 가중치(design default 45/35/20). compositeScore가 합으로 정규화하므로 원시값 그대로 사용.
  const num = (v: string | null, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const weights = {
    price: num(sp.get("w_price"), 45),
    subway: num(sp.get("w_subway"), 35),
    new: num(sp.get("w_new"), 20),
  };

  // ── 2026-07-15 추가: "평지 선호" 필터 + "최소 세대수" 필터 ──────────────────
  // 평지 선호: 켜면 원본 recommender.py get_slope_score_vworld 기준 slope_score < 70
  //   (완만 미만=경사/급경사, 또는 좌표 미확인으로 측정 불가) 단지를 제외한다.
  const flatOnly = sp.get("flat_only") === "1" || sp.get("flat_only") === "true";
  const FLAT_MIN_SCORE = 70; // 원본 임계값: >=70 이면 평지(90)/완만(70) 구간
  // 최소 세대수: apt_info 캐시에 세대수가 있고 그 값이 기준 미만이면 제외. 캐시에 없는(미확인)
  // 단지는 "국토부 데이터에 없으면 필터링에서 제외 처리" 지시대로 필터를 적용하지 않고 통과시킨다.
  const minHouseholdsRaw = (sp.get("min_households") ?? "").trim();
  const minHouseholdsVal = minHouseholdsRaw ? Number(minHouseholdsRaw) : null;
  const minHouseholds =
    minHouseholdsVal !== null && Number.isFinite(minHouseholdsVal) && minHouseholdsVal > 0
      ? minHouseholdsVal
      : null;

  const empty: RecommendResponse = {
    items: [],
    filled: 0,
    total_candidates: 0,
    pending: false,
  };

  let allData: AllData;
  try {
    allData = await loadAptAllData(lawdCd);
  } catch (err) {
    console.error("[recommend: allData 로드 실패]", err);
    return NextResponse.json(empty);
  }

  // 후보 풀(top 200) + 지역 min/max 가격(원본: 필터 이전 전체 풀 기준).
  const pool: AptStat[] = buildAptStats(allData, dealType, CANDIDATE_TOP_N);
  const { maxPrice, priceRange, hasPrices } = computePriceRange(pool);
  if (!hasPrices) return NextResponse.json(empty);

  // 예산·신축 필터(원본 app.py 1065~1085, 세대수/평지 제외 = MVP).
  const candidates = pool.filter((a) => {
    const avg = a.avg_price || 0; // 원본: avg_price or 0
    if (budgetMax !== null && avg > budgetMax) return false;
    if (budgetMin !== null && avg < budgetMin) return false;
    if (newYear > 0 && newbuildScore(a.build_year, newYear) < 40) return false;
    return true;
  });

  const totalCandidates = candidates.length;
  if (totalCandidates === 0) return NextResponse.json(empty);

  // ── apt_geo 영속 캐시 조회(없어도/실패해도 라이브 호출로 폴백) ──────────────
  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    supabase = null;
  }

  const geoMap = new Map<string, GeoInfo>();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("apt_geo")
        .select("name,dong,lat,lng,subway_name,subway_dist")
        .eq("lawd_cd", lawdCd);
      if (error) throw error;
      for (const row of data ?? []) {
        geoMap.set(geoKey(row.name, row.dong ?? ""), {
          lat: row.lat,
          lng: row.lng,
          subway_name: row.subway_name ?? "-",
          subway_dist: row.subway_dist ?? 9999,
        });
      }
    } catch (err) {
      console.error("[recommend: apt_geo 조회 실패, 라이브 채움만 진행]", err);
    }
  }

  // ── 캐시 히트 사용 + 미스는 이번 라운드 최대 K개만 카카오 라이브 채움 ──────────
  const filled: Array<{ apt: AptStat; geo: GeoInfo }> = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toUpsert: any[] = [];
  let liveCalls = 0;
  const canLive = hasKakaoKey();

  for (const apt of candidates) {
    const key = geoKey(apt.name, apt.dong);
    let geo = geoMap.get(key);
    if (!geo) {
      if (canLive && liveCalls < COLD_FILL_LIMIT) {
        geo = await fillGeo(apt.name, apt.dong, gu); // 순차·sleep 0.1s(원본)
        liveCalls += 1;
        toUpsert.push({
          lawd_cd: lawdCd,
          name: apt.name,
          dong: apt.dong ?? "",
          lat: geo.lat,
          lng: geo.lng,
          subway_name: geo.subway_name,
          subway_dist: geo.subway_dist,
          geocoded_at: new Date().toISOString(),
        });
      } else {
        continue; // 미채움 → pending으로 이월(스켈레톤/더보기)
      }
    }
    filled.push({ apt, geo });
  }

  // 채운 결과를 apt_geo에 upsert(best-effort; 테이블 없음/실패해도 응답엔 영향 없음).
  if (supabase && toUpsert.length > 0) {
    try {
      const { error } = await supabase
        .from("apt_geo")
        .upsert(toUpsert, { onConflict: "lawd_cd,name,dong" });
      if (error) throw error;
    } catch (err) {
      console.error("[recommend: apt_geo upsert 실패(응답 영향 없음)]", err);
    }
  }

  // ── "평지 선호" 필터(2026-07-15) — filled(geo 확보분)만 대상, slope_score < 70(또는 좌표
  //   미확인으로 측정 불가)인 단지는 제외한다. 스코어링 전에 적용해 카드 개수에 반영한다.
  let filteredFilled = filled;
  const slopeMap = new Map<string, number | null>();
  if (flatOnly && filled.length > 0) {
    const withCoord = filled.filter(({ geo }) => geo.lat != null && geo.lng != null);
    const slopeResults = await Promise.all(
      withCoord.map(async ({ apt, geo }) => ({
        key: geoKey(apt.name, apt.dong),
        score: await getSlopeScore(geo.lat as number, geo.lng as number),
      }))
    );
    for (const { key, score } of slopeResults) slopeMap.set(key, score);
    filteredFilled = filled.filter(({ apt, geo }) => {
      if (geo.lat == null || geo.lng == null) return false; // 좌표 미확인 → 평지 판단 불가, 제외
      const score = slopeMap.get(geoKey(apt.name, apt.dong));
      return score != null && score >= FLAT_MIN_SCORE;
    });
  }

  // ── "최소 세대수" 필터(2026-07-15) — apt_info 캐시에서 households 배치 조회. 캐시 미스(세대수
  //   미확인)는 지시대로 필터링에서 제외 처리(=통과)한다. 캐시 자체가 없어도(supabase 미구성) 전체 통과.
  const householdsMap = new Map<string, number | null>();
  if (minHouseholds !== null && supabase && filteredFilled.length > 0) {
    try {
      const names = Array.from(new Set(filteredFilled.map(({ apt }) => apt.name)));
      const { data, error } = await supabase
        .from("apt_info")
        .select("name,dong,households")
        .eq("lawd_cd", lawdCd)
        .in("name", names);
      if (error) throw error;
      for (const row of data ?? []) {
        householdsMap.set(
          geoKey(row.name as string, (row.dong as string) ?? ""),
          row.households as number | null
        );
      }
    } catch (err) {
      console.error("[recommend: apt_info(세대수) 조회 실패, 필터 미적용]", err);
    }
    filteredFilled = filteredFilled.filter(({ apt }) => {
      const hh = householdsMap.get(geoKey(apt.name, apt.dong));
      if (hh == null) return true; // 미확인 → 필터 미적용(통과)
      return hh >= minHouseholds;
    });
  }

  // ── 스코어링 → 상위 10개(원본 컷오프 계승) ─────────────────────────────────
  const scored: RecommendItem[] = filteredFilled.map(({ apt, geo }) => {
    const ps = priceScore(apt.avg_price, maxPrice, priceRange);
    const ss = subwayScore(geo.subway_dist);
    const ns = newbuildScore(apt.build_year, newYear);
    return {
      name: apt.name,
      dong: apt.dong,
      build_year: apt.build_year,
      avg_price: apt.avg_price,
      subway_name: geo.subway_name,
      subway_dist: geo.subway_dist,
      price_score: ps,
      subway_score: ss,
      newbuild_score: ns,
      score: compositeScore(ps, ss, ns, weights),
      slope_score: flatOnly ? (slopeMap.get(geoKey(apt.name, apt.dong)) ?? null) : null,
      households: householdsMap.get(geoKey(apt.name, apt.dong)) ?? null,
      // 원본 AptStat 전체(area_stats 포함)를 실어 클라가 rows 조회 없이 모달을 연다(design §4-C 옵션 b).
      apt,
    };
  });
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const response: RecommendResponse = {
    items: scored.slice(0, 10),
    filled: filled.length,
    total_candidates: totalCandidates,
    pending: filled.length < totalCandidates,
    // 라이브 채움 가능 여부(boolean만; 키값은 로깅/노출하지 않음). 클라가 콜드+라이브불가
    // (can_live=false && filled=0 && items=0) 상태에서 무한 스켈레톤/더보기 대신 안내를 띄운다.
    can_live: canLive,
  };
  return NextResponse.json(response);
}
