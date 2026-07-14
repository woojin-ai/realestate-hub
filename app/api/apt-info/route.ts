// 아파트 상세 모달 — 단지 정보 섹션 API (docs/design/apt-detail-modal.md §11·§14-2 / 기획안 §1-B·§2-B·§5-2단계)
//
// apt_info 영속 캐시 우선 조회 → 히트면 그대로 반환(MOLIT 재호출 0),
// 미스면 resolveKaptCode(구 단지목록) → fetchAptInfo(Bass/Dtl 2콜)로 라이브 조회 후 upsert.
// Supabase/apt_info 부재·조회실패·upsert실패는 전부 try/catch로 라이브 폴백(라우트 무중단,
// app/api/apt-location 패턴 계승). 콜드에서 구목록 로드가 느릴 수 있어 라이브 전체를 try/catch로
// 감싸 예외 시 {found:false} 반환(500 금지 → 프론트가 빈 상태로 렌더). 시크릿은 노출하지 않는다.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  resolveKaptCode,
  fetchAptInfo,
  type AptInfoFields,
} from "@/lib/molit-aptinfo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 음성 캐시(found=false) 재조회 억제 TTL: 30일 지나면 미스로 보고 라이브 재시도(기획안 §2-B).
const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// 프론트가 소비하는 응답 계약(design §14-2). 미확보 필드는 null.
interface InfoResponse {
  found: boolean;
  households: number | null;
  buildings: number | null;
  hallway: string | null;
  heating: string | null;
  park_total: number | null;
  addr: string | null;
  far_ratio: string | null;
  cov_ratio: string | null;
  elev_pass: number | null;
  elev_per_hh: number | null;
  park_above: number | null;
  park_under: number | null;
}

const NOT_FOUND: InfoResponse = {
  found: false,
  households: null,
  buildings: null,
  hallway: null,
  heating: null,
  park_total: null,
  addr: null,
  far_ratio: null,
  cov_ratio: null,
  elev_pass: null,
  elev_per_hh: null,
  park_above: null,
  park_under: null,
};

// apt_info 행/필드 → 응답 계약으로 매핑(found=true).
function toResponse(f: AptInfoFields): InfoResponse {
  return {
    found: true,
    households: f.households,
    buildings: f.buildings,
    hallway: f.hallway,
    heating: f.heating,
    park_total: f.park_total,
    addr: f.addr,
    far_ratio: f.far_ratio,
    cov_ratio: f.cov_ratio,
    elev_pass: f.elev_pass,
    elev_per_hh: f.elev_per_hh,
    park_above: f.park_above,
    park_under: f.park_under,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const lawdCd = sp.get("lawd_cd");
  const name = (sp.get("name") ?? "").trim();
  const dong = (sp.get("dong") ?? "").trim();

  // 필수값(시군구코드 5자리·단지명) 부족 → 미확인 폴백(프론트가 빈 상태로 렌더).
  if (!lawdCd || !/^\d{5}$/.test(lawdCd) || !name) {
    return NextResponse.json(NOT_FOUND);
  }

  // ── Supabase 클라이언트(없어도/실패해도 라이브 폴백) ─────────────────────────────
  let supabase: ReturnType<typeof getSupabaseServerClient> | null = null;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    supabase = null; // Supabase 미구성 → 라이브 폴백만 진행
  }

  // ── apt_info 캐시-우선 조회 ──────────────────────────────────────────────────
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("apt_info")
        .select(
          "households,buildings,hallway,heating,elev_pass,elev_per_hh,park_above,park_under,park_total,far_ratio,cov_ratio,addr,found,fetched_at"
        )
        .eq("lawd_cd", lawdCd)
        .eq("name", name)
        .eq("dong", dong)
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        if (data.found) {
          // 성공 캐시 → 그대로 응답(MOLIT 재호출 0)
          return NextResponse.json(toResponse(data as AptInfoFields));
        }
        // 음성 캐시(found=false): 30일 이내면 즉시 {found:false}, 초과면 미스로 취급해 라이브 재시도.
        const fetchedAt = data.fetched_at
          ? new Date(data.fetched_at as string).getTime()
          : 0;
        if (Date.now() - fetchedAt < NEGATIVE_TTL_MS) {
          return NextResponse.json(NOT_FOUND);
        }
      }
    } catch (err) {
      console.error("[apt-info: apt_info 조회 실패, 라이브 폴백]", err);
    }
  }

  // ── 캐시 미스 → 라이브 조회(전체 try/catch로 격리, 예외 시 {found:false}) ──────────
  try {
    const sigunguCd = lawdCd.slice(0, 5);
    const kaptCode = await resolveKaptCode(name, sigunguCd);

    if (!kaptCode) {
      // 매칭 실패 → 음성 캐시 upsert(무한 재조회 억제) 후 {found:false}.
      await upsertRow(supabase, lawdCd, name, dong, null, null, false);
      return NextResponse.json(NOT_FOUND);
    }

    const fields = await fetchAptInfo(kaptCode);
    await upsertRow(supabase, lawdCd, name, dong, kaptCode, fields, true);
    return NextResponse.json(toResponse(fields));
  } catch (err) {
    console.error("[apt-info: 라이브 조회 실패, {found:false} 폴백]", err);
    return NextResponse.json(NOT_FOUND);
  }
}

// apt_info upsert(kapt_code + 필드 + found + fetched_at). 실패는 응답에 영향 없음(무중단).
async function upsertRow(
  supabase: ReturnType<typeof getSupabaseServerClient> | null,
  lawdCd: string,
  name: string,
  dong: string,
  kaptCode: string | null,
  fields: AptInfoFields | null,
  found: boolean
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("apt_info").upsert(
      {
        lawd_cd: lawdCd,
        name,
        dong,
        kapt_code: kaptCode,
        households: fields?.households ?? null,
        buildings: fields?.buildings ?? null,
        hallway: fields?.hallway ?? null,
        heating: fields?.heating ?? null,
        elev_pass: fields?.elev_pass ?? null,
        elev_per_hh: fields?.elev_per_hh ?? null,
        park_above: fields?.park_above ?? null,
        park_under: fields?.park_under ?? null,
        park_total: fields?.park_total ?? null,
        far_ratio: fields?.far_ratio ?? null,
        cov_ratio: fields?.cov_ratio ?? null,
        addr: fields?.addr ?? null,
        found,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lawd_cd,name,dong" }
    );
    if (error) throw error;
  } catch (err) {
    console.error("[apt-info: apt_info upsert 실패(응답 영향 없음)]", err);
  }
}
