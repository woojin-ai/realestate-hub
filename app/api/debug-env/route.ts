// 임시 진단 엔드포인트 — 프로덕션에서 Supabase 캐시가 계속 source=live로만 나오는 원인 확인용.
// 시크릿 값 자체는 절대 반환하지 않고, 존재 여부/길이/실제 연결 테스트 결과(에러 메시지)만 반환한다.
// 원인 파악 후 반드시 삭제할 것.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const info: Record<string, unknown> = {
    url_present: !!url,
    url_value_masked: url ? url.slice(0, 20) + "..." + url.slice(-10) : null,
    anon_present: !!anonKey,
    anon_length: anonKey?.length ?? 0,
    service_present: !!serviceKey,
    service_length: serviceKey?.length ?? 0,
    service_prefix: serviceKey ? serviceKey.slice(0, 12) : null,
    service_suffix: serviceKey ? serviceKey.slice(-8) : null,
  };

  if (url && serviceKey) {
    try {
      const supabase = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase
        .from("fetch_cache_status")
        .select("lawd_cd")
        .limit(1);
      info.connection_test = error
        ? { ok: false, error_message: error.message, code: error.code }
        : { ok: true, row_count: data?.length ?? 0 };
    } catch (err) {
      info.connection_test = {
        ok: false,
        thrown: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    info.connection_test = { ok: false, reason: "url 또는 service key 누락" };
  }

  return NextResponse.json(info);
}
