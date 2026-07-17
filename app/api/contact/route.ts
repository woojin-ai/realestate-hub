import { NextResponse, type NextRequest } from "next/server";

// 문의 이메일 발송 (Resend). 계산기 허브(C:\claude code webside\app\api\contact\route.ts)의
// 로직을 그대로 포팅 — subject 접두어만 이 사이트용으로 다르게 하드코딩해 두 사이트 문의를
// 메일함에서 구분할 수 있게 한다(2026-07-17 사용자 지시, RESEND_API_KEY/CONTACT_TO_EMAIL 계정 공유).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 매우 느슨한 이메일 형식 체크: "@"와 "." 정도만 있으면 통과시키고,
// 명백히 이상한 값(예: "@" 없음)만 걸러낸다.
const LOOSE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactRequestBody {
  name?: unknown;
  email?: unknown;
  message?: unknown;
}

export async function POST(request: NextRequest) {
  let body: ContactRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "요청 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { ok: false, error: "문의 내용을 입력해주세요." },
      { status: 400 }
    );
  }

  if (!email || !LOOSE_EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { ok: false, error: "올바른 이메일 주소를 입력해주세요." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !toEmail) {
    return NextResponse.json(
      { ok: false, error: "문의 전송 설정이 완료되지 않았습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  const subject = "[부동산 실거래가 대시보드 문의]";
  const text = [
    `이름(또는 닉네임): ${name || "(미입력)"}`,
    `회신 받으실 이메일: ${email}`,
    "",
    "문의 내용:",
    message,
  ].join("\n");

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: toEmail,
        reply_to: email,
        subject,
        text,
      }),
    });

    if (!resendResponse.ok) {
      // Resend 응답 본문에는 민감정보가 없으나(요청 자체 오류 메시지), 혹시 모를 노출을
      // 방지하기 위해 상세 본문은 서버 로그로만 남기고 클라이언트에는 일반화된 메시지만 전달한다.
      let resendErrorDetail = "";
      try {
        const errorBody = await resendResponse.json();
        resendErrorDetail =
          typeof errorBody?.message === "string" ? errorBody.message : "";
      } catch {
        // ignore parse failure
      }
      console.error(
        `[api/contact] Resend API error: status=${resendResponse.status} detail=${resendErrorDetail}`
      );

      return NextResponse.json(
        { ok: false, error: "문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[api/contact] Failed to reach Resend API:", error);
    return NextResponse.json(
      { ok: false, error: "문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
