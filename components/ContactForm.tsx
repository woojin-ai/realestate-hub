// 문의 폼 (/support). 계산기 허브(C:\claude code webside\components\SupportInquiryForm.tsx)의
// UX 패턴(이름 선택·이메일/문의내용 필수, idle/submitting/success/error 상태, 필드 단위 에러)을
// 이 프로젝트의 색상 토큰(brand, gray-*)에 맞춰 이식. 제출 시 /api/contact로 POST.
"use client";

import { useState, type FormEvent } from "react";

interface FieldErrors {
  email?: string;
  message?: string;
}

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const INPUT_BASE =
  "rounded-lg border px-3 py-2 text-sm min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const submitting = status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    if (!email.trim()) {
      nextErrors.email = "답장받으실 이메일을 입력해주세요.";
    }
    if (!message.trim()) {
      nextErrors.message = "문의 내용을 입력해주세요.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setStatus("submitting");
    setStatusMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setStatus("error");
        setStatusMessage(
          data?.error ?? "문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요."
        );
        return;
      }

      setStatus("success");
      setStatusMessage("문의가 접수되었습니다. 빠른 시일 내 답변드리겠습니다.");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setStatusMessage("문의 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-gray-600">
          이름 (선택)
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="홍길동"
          disabled={submitting}
          className={`${INPUT_BASE} border-gray-200`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-600">
          답장받으실 이메일
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="example@email.com"
          aria-invalid={errors.email ? true : undefined}
          disabled={submitting}
          className={`${INPUT_BASE} ${
            errors.email ? "border-[#c62828]" : "border-gray-200"
          }`}
        />
        {errors.email && (
          <p className="text-xs text-[#c62828]" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium text-gray-600">
          문의 내용
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="(1) 조회한 지역, (2) 건물 유형·거래 유형, (3) 어떤 화면에서 발생했는지를 적어주시면 확인이 빠릅니다."
          rows={5}
          aria-invalid={errors.message ? true : undefined}
          disabled={submitting}
          className={`${INPUT_BASE} ${
            errors.message ? "border-[#c62828]" : "border-gray-200"
          }`}
        />
        {errors.message && (
          <p className="text-xs text-[#c62828]" role="alert">
            {errors.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm text-white hover:bg-[#303f9f] disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px] sm:w-auto"
      >
        {submitting ? "전송 중..." : "문의하기"}
      </button>

      {status === "success" && (
        <p
          role="status"
          className="rounded-lg bg-green-50 border border-green-100 p-3 text-sm text-gray-700"
        >
          {statusMessage}
        </p>
      )}

      {status === "error" && (
        <p
          role="alert"
          className="rounded-lg bg-[#fce4ec] border border-[#f8bbd0] p-3 text-sm text-[#c62828]"
        >
          {statusMessage}
        </p>
      )}
    </form>
  );
}
