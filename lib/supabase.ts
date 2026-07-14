// Supabase 클라이언트 초기화
// 서버 전용(Route Handler 등)에서만 import한다 — SUPABASE_SERVICE_ROLE_KEY는
// RLS를 우회하는 관리자 권한 키이므로 클라이언트 컴포넌트/브라우저 번들에 노출되면 안 된다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * 서버 전용 Supabase 클라이언트(Service Role Key 사용, RLS 우회, 읽기/쓰기 모두 가능).
 * Route Handler(app/api/**\/route.ts) 등 서버 코드에서만 호출할 것.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다 (.env.local 확인)"
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
