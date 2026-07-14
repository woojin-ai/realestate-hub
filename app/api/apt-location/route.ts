// 아파트 상세 모달 — 위치 섹션 API (docs/design/apt-detail-modal.md §10·§14 / 기획안 §1-A·§2-A)
//
// apt_geo 영속 캐시 우선 조회 → 히트면 그대로 반환(추가 카카오 호출 0),
// 미스면 lib/recommender.ts(getCoordinates+getNearestSubway=fillGeo)로 라이브 조회 후 upsert.
// Supabase/apt_geo 부재·실패는 전부 try/catch로 라이브 폴백(라우트 무중단, app/api/recommend 패턴 계승).
// 경사도(slope_score/route_slope) 필드 없음(마스터 승인, 기획안 §3). 시크릿은 로깅/응답에 노출하지 않는다.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { fillGeo, type GeoInfo } from "@/lib/recommender";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LocationResponse {
  found: boolean; // 좌표 확보 여부(lat/lng 존재). 프론트 빈 상태 판별 보조.
  lat: number | null;
  lng: number | null;
  subway_name: string; // 미확인 시 "-"(원본 규약 계승)
  subway_dist: number; // 미확인 시 9999(원본 규약 계승)
}

// 미확인/필수값 부족 시 크래시 없이 반환하는 폴백(디자인 §10 빈 상태로 렌더됨).
const NOT_FOUND: LocationResponse = {
  found: false,
  lat: null,
  lng: null,
  subway_name: "-",
  subway_dist: 9999,
};

function toResponse(geo: GeoInfo): LocationResponse {
  const found = geo.lat != null && geo.lng != null;
  return {
    found,
    lat: geo.lat,
    lng: geo.lng,
    subway_name: geo.subway_name,
    subway_dist: geo.subway_dist,
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
      const { data, error } = await supabase
        .from("apt_geo")
        .select("lat,lng,subway_name,subway_dist")
        .eq("lawd_cd", lawdCd)
        .eq("name", name)
        .eq("dong", dong)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // 좌표가 확보된 행만 캐시 히트로 인정(좌표 null 행은 미스로 보고 라이브 재시도).
      if (data && data.lat != null && data.lng != null) {
        return NextResponse.json(
          toResponse({
            lat: data.lat,
            lng: data.lng,
            subway_name: data.subway_name ?? "-",
            subway_dist: data.subway_dist ?? 9999,
          })
        );
      }
    } catch (err) {
      console.error("[apt-location: apt_geo 조회 실패, 라이브 폴백]", err);
    }
  }

  // ── 캐시 미스 → 카카오 라이브 조회(좌표+최근접지하철) 후 apt_geo upsert ─────────
  let geo: GeoInfo;
  try {
    geo = await fillGeo(name, dong, gu); // 순차·sleep 0.1s(원본). 키 없으면 내부에서 미확인 반환.
  } catch (err) {
    console.error("[apt-location: 라이브 지오코딩 실패]", err);
    return NextResponse.json(NOT_FOUND);
  }

  // 좌표를 확보한 경우에만 캐시에 적재(추천 라우트와 캐시 공유 → 재호출 시 히트).
  if (supabase && geo.lat != null && geo.lng != null) {
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
          geocoded_at: new Date().toISOString(),
        },
        { onConflict: "lawd_cd,name,dong" }
      );
      if (error) throw error;
    } catch (err) {
      console.error("[apt-location: apt_geo upsert 실패(응답 영향 없음)]", err);
    }
  }

  return NextResponse.json(toResponse(geo));
}
