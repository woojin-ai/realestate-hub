// 아파트 상세 모달 — 주변 시설(Stage 3) 섹션 API (docs/design/apt-detail-modal.md §12·§14-2 / 기획안 §1-C·§2-C·§5-3단계)
//
// apt_nearby 영속 캐시 우선 조회 → 히트 & fetched_at 90일 이내 & 현재 스키마 필드 완비(isPayloadUpToDate)
// 면 payload 즉시 반환(카카오 0콜). 미스(90일 초과 또는 구버전 스키마)면 좌표 확보 후
// fetchNearbyAll 라이브 조회 → payload upsert(2026-07-16: 스키마 변경 시 수동 캐시 삭제 불필요하도록 가드 추가).
// 좌표는 apt_geo 캐시 조회 → 없으면 lib/recommender.ts getCoordinates 라이브. 좌표 확보 실패 시 빈 결과.
// Supabase/apt_nearby 부재·조회·upsert 실패는 전부 try/catch 무중단(라이브 폴백, apt-location/apt-info 패턴 계승).
// 콜드 예외 시 500이 아니라 {elementary:[],middle:[],high:[]}로 graceful 반환. 시크릿은 노출하지 않는다.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCoordinates } from "@/lib/recommender";
import { fetchNearbyAll, isPayloadUpToDate, type NearbyAll } from "@/lib/kakao-nearby";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 주변시설 장기 캐시 TTL: 90일 이내면 payload 재사용, 초과면 미스로 보고 라이브 재조회(기획안 §2-C).
const NEARBY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// 프론트가 소비하는 응답 계약(design §14-2 C행, 2026-07-15 전면 확장:
// 학교+어린이집+대형병원+동물병원+편의시설).
const EMPTY: NearbyAll = {
  elementary: [],
  middle: [],
  high: [],
  daycare_public: 0,
  daycare_private: 0,
  big_hospital: { name: "-", distance: 9999, address: "" },
  vet_hospital: { name: "-", distance: 9999 },
  convenience: { supermarket: 0, convenience: 0, cafe: 0, restaurant: 0, pharmacy: 0, bank: 0 },
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lawdCd = sp.get("lawd_cd");
  const name = (sp.get("name") ?? "").trim();
  const dong = (sp.get("dong") ?? "").trim();
  const gu = (sp.get("gu") ?? "").trim();

  // 필수값(시군구코드 5자리·단지명) 부족 → 빈 결과 폴백(프론트가 "학교 정보 없음"으로 렌더).
  if (!lawdCd || !/^\d{5}$/.test(lawdCd) || !name) {
    return NextResponse.json(EMPTY);
  }

  // ── Supabase 클라이언트(없어도/실패해도 라이브 폴백) ─────────────────────────────
  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    supabase = null; // Supabase 미구성 → 라이브 폴백만 진행
  }

  // ── apt_nearby 캐시-우선 조회(90일 TTL) ──────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("apt_nearby")
        .select("payload,fetched_at")
        .eq("lawd_cd", lawdCd)
        .eq("name", name)
        .eq("dong", dong)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data && data.payload) {
        const fetchedAt = data.fetched_at
          ? new Date(data.fetched_at as string).getTime()
          : 0;
        // 90일 이내 히트 + 현재 스키마의 필드를 모두 채운 payload일 때만 재사용(카카오 0콜).
        // TTL 초과 또는 구버전 스키마(필드 누락)면 아래 라이브 재조회로 진행해 최신 스키마로 갱신한다.
        if (Date.now() - fetchedAt < NEARBY_TTL_MS && isPayloadUpToDate(data.payload)) {
          return NextResponse.json(data.payload);
        }
      }
    } catch (err) {
      console.error("[apt-nearby: apt_nearby 조회 실패, 라이브 폴백]", err);
    }
  }

  // ── 캐시 미스 → 좌표 확보(전체 try/catch로 격리, 예외 시 빈 결과) ─────────────────
  try {
    let lat: number | null = null;
    let lng: number | null = null;

    // (1) apt_geo 캐시에서 좌표 조회(위치 섹션이 먼저 채웠으면 즉시 히트, 카카오 0콜).
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("apt_geo")
          .select("lat,lng")
          .eq("lawd_cd", lawdCd)
          .eq("name", name)
          .eq("dong", dong)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data && data.lat != null && data.lng != null) {
          lat = data.lat as number;
          lng = data.lng as number;
        }
      } catch (err) {
        console.error("[apt-nearby: apt_geo 좌표 조회 실패, 라이브 지오코딩 폴백]", err);
      }
    }

    // (2) apt_geo 미스 → 카카오 라이브 지오코딩(키 없으면 내부에서 null 반환).
    if (lat == null || lng == null) {
      const coord = await getCoordinates(name, dong, gu);
      lat = coord.lat;
      lng = coord.lng;
    }

    // 좌표 확보 실패 → 빈 결과(카카오 학교 호출 생략).
    if (lat == null || lng == null) {
      return NextResponse.json(EMPTY);
    }

    // ── 카카오 주변시설 조회(학교+어린이집+대형병원+동물병원+편의시설, 병렬) ──────────
    const nearby = await fetchNearbyAll(lat, lng);
    await upsertRow(supabase, lawdCd, name, dong, nearby);
    return NextResponse.json(nearby);
  } catch (err) {
    console.error("[apt-nearby: 라이브 조회 실패, 빈 결과 폴백]", err);
    return NextResponse.json(EMPTY);
  }
}

// apt_nearby upsert(payload + fetched_at). 실패는 응답에 영향 없음(무중단).
async function upsertRow(
  supabase: ReturnType<typeof getSupabaseServerClient> | null,
  lawdCd: string,
  name: string,
  dong: string,
  payload: NearbyAll
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("apt_nearby").upsert(
      {
        lawd_cd: lawdCd,
        name,
        dong,
        payload,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lawd_cd,name,dong" }
    );
    if (error) throw error;
  } catch (err) {
    console.error("[apt-nearby: apt_nearby upsert 실패(응답 영향 없음)]", err);
  }
}
