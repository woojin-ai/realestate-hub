// 아파트 상세 모달 — 위치 섹션 API (docs/design/apt-detail-modal.md §10·§14 / 기획안 §1-A·§2-A)
//
// apt_geo 영속 캐시 우선 조회 → 히트면 그대로 반환(추가 카카오/고도 호출 0),
// 미스면 lib/recommender.ts(getCoordinates+getNearestSubway=fillGeoDetail)로 라이브 조회 후 upsert.
// Supabase/apt_geo 부재·실패는 전부 try/catch로 라이브 폴백(라우트 무중단, app/api/recommend 패턴 계승).
//
// 경사도(slope_score/route_slope) — 2026-07-15 사용자 지시로 복원(이전 라운드의 "마스터 승인 제외"
// 코멘트는 자동화 라운드의 자체 판단이었고 실제 사용자 승인이 아니었음). 원본 recommender.py
// get_slope_score_vworld/get_route_slope_score를 lib/recommender.ts로 이관한 fillSlope로 계산하며,
// apt_geo에 slope_score/route_slope 컬럼이 있으면(supabase/apt_geo_slope.sql 적용 후) 함께 캐시한다.
// 컬럼이 아직 없어도(select 실패) try/catch로 매번 라이브 재계산해 응답은 항상 채워진다.
//
// 속도 개선(§3): 모달 단건 조회는 원본 /api/location과 동일하게 sleep 없이(fillGeoDetail) 조회하고,
// slope_score/route_slope 계산은 fillSlope 내부에서 서로 독립인 두 축(단지 경사·역좌표조회)을
// Promise.all로 병렬 실행한다. 시크릿은 로깅/응답에 노출하지 않는다.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  fillGeoDetail,
  fillSlope,
  type GeoInfo,
  type RouteSlope,
} from "@/lib/recommender";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LocationResponse {
  found: boolean; // 좌표 확보 여부(lat/lng 존재). 프론트 빈 상태 판별 보조.
  lat: number | null;
  lng: number | null;
  subway_name: string; // 미확인 시 "-"(원본 규약 계승)
  subway_dist: number; // 미확인 시 9999(원본 규약 계승)
  slope_score: number | null; // 단지 주변 경사도 점수(0~100). 계산 불가 시 null(원본은 기본값 50이나,
  // 프론트에 "계산 불가"를 숨기지 않고 구분하고자 좌표 자체가 없을 때만 null로 둔다. 좌표가 있으면
  // fillSlope가 최소 50을 반환하므로 실질적으로 항상 채워진다.)
  route_slope: RouteSlope | null; // 역→단지 경로 경사. 지하철 미확인/계산 불가 시 score:null,label:"측정불가".
}

// 미확인/필수값 부족 시 크래시 없이 반환하는 폴백(디자인 §10 빈 상태로 렌더됨).
const NOT_FOUND: LocationResponse = {
  found: false,
  lat: null,
  lng: null,
  subway_name: "-",
  subway_dist: 9999,
  slope_score: null,
  route_slope: null,
};

function toResponse(
  geo: GeoInfo,
  slope: { slope_score: number | null; route_slope: RouteSlope | null }
): LocationResponse {
  const found = geo.lat != null && geo.lng != null;
  return {
    found,
    lat: geo.lat,
    lng: geo.lng,
    subway_name: geo.subway_name,
    subway_dist: geo.subway_dist,
    slope_score: slope.slope_score,
    route_slope: slope.route_slope,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lawdCd = sp.get("lawd_cd");
  const name = (sp.get("name") ?? "").trim();
  const dong = (sp.get("dong") ?? "").trim();
  const gu = (sp.get("gu") ?? "").trim();

  // 필수값(시군구코드 5자리·단지명) 부족 → 미확인 폴백(프론트가 "위치 정보 없음"으로 렌더).
  if (!lawdCd || !/^\d{5}$/.test(lawdCd) || !name) {
    return NextResponse.json(NOT_FOUND);
  }

  // ── apt_geo 영속 캐시 조회(없어도/실패해도 라이브 폴백) ──────────────────────
  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    supabase = null; // Supabase 미구성 → 라이브 폴백만 진행
  }

  if (supabase) {
    try {
      // slope_score/route_slope 컬럼이 아직 없는 배포(apt_geo_slope.sql 미적용)에서도
      // select 자체가 죽지 않도록 두 단계로 나눈다: 먼저 기본 컬럼만 확정 조회.
      const { data, error } = await supabase
        .from("apt_geo")
        .select("lat,lng,subway_name,subway_dist,slope_score,route_slope")
        .eq("lawd_cd", lawdCd)
        .eq("name", name)
        .eq("dong", dong)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // 좌표가 확보된 행만 캐시 히트로 인정(좌표 null 행은 미스로 보고 라이브 재시도).
      if (data && data.lat != null && data.lng != null) {
        const geo: GeoInfo = {
          lat: data.lat,
          lng: data.lng,
          subway_name: data.subway_name ?? "-",
          subway_dist: data.subway_dist ?? 9999,
        };
        // 경사도까지 캐시된 완전 히트 → 추가 외부호출 없이 즉시 응답(가장 빠른 경로).
        if (data.slope_score != null) {
          return NextResponse.json(
            toResponse(geo, {
              slope_score: data.slope_score,
              route_slope: (data.route_slope as RouteSlope | null) ?? null,
            })
          );
        }
        // 좌표는 캐시됐지만 경사도가 없는 구(舊) 행(이번 복원 이전 캐시분) → 경사도만 라이브 계산해
        // 좌표/지하철 재조회 없이 채운다. 계산 후 같은 행에 upsert해 다음부터는 완전 히트.
        try {
          const slope = await fillSlope(
            data.lat,
            data.lng,
            geo.subway_name,
            geo.subway_dist
          );
          await upsertGeo(supabase, lawdCd, name, dong, geo, slope);
          return NextResponse.json(toResponse(geo, slope));
        } catch (err) {
          console.error("[apt-location: 구 캐시 경사도 보강 실패, 경사도만 null]", err);
          return NextResponse.json(
            toResponse(geo, { slope_score: null, route_slope: null })
          );
        }
      }
    } catch (err) {
      console.error("[apt-location: apt_geo 조회 실패, 라이브 폴백]", err);
    }
  }

  // ── 캐시 미스 → 라이브 조회(좌표+최근접지하철, sleep 없음) 후 apt_geo upsert ─────────
  let geo: GeoInfo;
  try {
    geo = await fillGeoDetail(name, dong, gu); // 키 없으면 내부에서 미확인 반환.
  } catch (err) {
    console.error("[apt-location: 라이브 지오코딩 실패]", err);
    return NextResponse.json(NOT_FOUND);
  }

  // 좌표를 확보한 경우에만 경사도 계산 + 캐시 적재(추천 라우트와 좌표/지하철 캐시 공유).
  let slope: { slope_score: number | null; route_slope: RouteSlope | null } = {
    slope_score: null,
    route_slope: null,
  };
  if (geo.lat != null && geo.lng != null) {
    try {
      slope = await fillSlope(geo.lat, geo.lng, geo.subway_name, geo.subway_dist);
    } catch (err) {
      console.error("[apt-location: 경사도 계산 실패, null로 응답]", err);
    }
    if (supabase) {
      await upsertGeo(supabase, lawdCd, name, dong, geo, slope);
    }
  }

  return NextResponse.json(toResponse(geo, slope));
}

// apt_geo upsert(좌표+지하철+경사도). 실패해도 응답에는 영향 없음(무중단, 원본 패턴 계승).
// slope_score/route_slope 컬럼이 없는 배포에서는 upsert 자체가 에러날 수 있으나 try/catch로 흡수.
async function upsertGeo(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  lawdCd: string,
  name: string,
  dong: string,
  geo: GeoInfo,
  slope: { slope_score: number | null; route_slope: RouteSlope | null }
): Promise<void> {
  try {
    const { error } = await supabase.from("apt_geo").upsert(
      {
        lawd_cd: lawdCd,
        name,
        dong,
        lat: geo.lat,
        lng: geo.lng,
        subway_name: geo.subway_name,
        subway_dist: geo.subway_dist,
        slope_score: slope.slope_score,
        route_slope: slope.route_slope,
        geocoded_at: new Date().toISOString(),
      },
      { onConflict: "lawd_cd,name,dong" }
    );
    if (error) throw error;
  } catch (err) {
    console.error("[apt-location: apt_geo upsert 실패(응답 영향 없음)]", err);
  }
}
