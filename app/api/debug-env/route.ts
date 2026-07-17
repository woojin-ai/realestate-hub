// 임시 진단 엔드포인트 — 구글/네이버 소유확인 메타태그가 프로덕션에 안 나오는 원인 확인용.
// 원인 파악 후 반드시 삭제할 것.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const g = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const n = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION;
  return NextResponse.json({
    google_present: !!g,
    google_length: g?.length ?? 0,
    google_value: g ?? null,
    naver_present: !!n,
    naver_length: n?.length ?? 0,
    naver_value: n ?? null,
  });
}
