// 면책/안내 콜아웃. docs/design/blog.md §3 스펙 그대로 구현(색상·마크업 변경 금지).
// info: 일반 안내. warning: 투자자문 오인 방지·데이터 한계 고지(이 사이트는 warning 사용 빈도가 높음).

interface CalloutProps {
  variant: "info" | "warning";
  children: React.ReactNode;
}

export default function Callout({ variant, children }: CalloutProps) {
  if (variant === "warning") {
    return (
      <div className="flex gap-2.5 rounded-lg border-l-4 border-[#c62828] bg-[#fce4ec] px-4 py-3 my-4">
        <span aria-hidden="true" className="text-[#c62828] text-lg leading-none">
          ⚠️
        </span>
        <p className="text-sm text-[#7f1d1d] leading-relaxed font-medium">{children}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 rounded-lg border border-[#bbdefb] bg-[#e3f2fd] px-4 py-3 my-4">
      <span aria-hidden="true" className="text-[#1e88e5] text-lg leading-none">
        ℹ️
      </span>
      <p className="text-sm text-[#0d47a1] leading-relaxed">{children}</p>
    </div>
  );
}
