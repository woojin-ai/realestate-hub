// 관리자용 캐시 리셋 엔드포인트 — 캐시 포이즈닝으로 굳은 지역(예: 화성 41590, 부천 41190)의
// deals/monthly_stats/fetch_cache_status 행을 삭제해 자가치유를 유도한다.
//
// 배경: 63391ab가 "신규" 오염(빈/부분 데이터가 ready로 굳는 것)은 막았지만, 이미 굳어버린
// 기존 오염(months_collected=13/ready인데 count=0/avg=null)은 자동으로 치유되지 않는다. 읽기
// 경로(/api/data)는 fetch_cache_status가 ready면 재-fetch 없이 오염 캐시를 계속 서빙하기
// 때문이다. 지금까지는 사용자가 Supabase에서 수동 SQL로 해당 지역 캐시 행을 삭제해야 했는데,
// 이 라우트가 그 수동 작업을 시크릿으로 보호되는 HTTP 호출 하나로 대체한다.
//
// 이 라우트가 캐시 행을 삭제하면, 다음 /api/data 조회가 캐시 미스로 국토부 API에 재-fetch를
// 걸고 63391ab 로직으로 정상 데이터를 다시 채워 넣어 자가치유된다.
//
// 보호: prewarm 크론과 동일하게 CRON_SECRET으로 보호한다(checkAuth 재사용). CRON_SECRET
// 미설정 시 항상 거부. Authorization: Bearer <secret> 헤더 또는 ?secret=<secret> 쿼리 허용.
// POST(운영용)와 GET(수동 curl 테스트 편의용) 둘 다 동일 핸들러 로직을 공유한다.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { resetRegionCache } from "@/lib/db-cache";
import type { BuildingType } from "@/lib/molit-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// CRON_SECRET 미설정 시 항상 거부(안전 기본값) — prewarm route의 checkAuth와 동일.
function checkAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  const queryKey = request.nextUrl.searchParams.get("secret");
  return queryKey === secret;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 파라미터: 쿼리스트링 우선, 없으면(POST) JSON body에서 읽는다.
  const params = request.nextUrl.searchParams;
  let lawdCd = params.get("lawd_cd") ?? undefined;
  let buildingType = params.get("building_type") ?? undefined;

  if ((!lawdCd || !buildingType) && request.method === "POST") {
    try {
      const body = (await request.json()) as {
        lawd_cd?: string;
        building_type?: string;
      };
      if (!lawdCd) lawdCd = body?.lawd_cd;
      if (!buildingType) buildingType = body?.building_type;
    } catch {
      // body가 비어있거나 JSON이 아니면 무시(쿼리스트링만으로도 동작).
    }
  }

  if (!lawdCd) {
    return NextResponse.json(
      { error: "lawd_cd(5자리)가 필요합니다" },
      { status: 400 }
    );
  }

  const resolvedBuildingType = (buildingType ?? "아파트") as BuildingType;

  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch (err) {
    console.error("[reset-cache: Supabase 미구성]", err);
    return NextResponse.json({ error: "supabase 미구성" }, { status: 500 });
  }

  try {
    const deleted = await resetRegionCache(supabase, lawdCd, resolvedBuildingType);
    return NextResponse.json({
      ok: true,
      lawd_cd: lawdCd,
      building_type: resolvedBuildingType,
      deleted,
    });
  } catch (err) {
    console.error(`[reset-cache: 삭제 실패] ${lawdCd} ${resolvedBuildingType}`, err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
