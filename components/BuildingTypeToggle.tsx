"use client";

import type { BuildingType } from "@/lib/types";

interface BuildingTypeToggleProps {
  value: BuildingType;
  onChange: (type: BuildingType) => void;
}

// 3종 모두 선택 가능하도록 노출한다. 단, 이번 라운드는 아파트만 실제 조회되고
// 빌라/단독 선택 시 상위 페이지가 "지원 준비 중" 안내를 표시한다(design 문서 준수).
const OPTIONS: { type: BuildingType; label: string }[] = [
  { type: "아파트", label: "🏢 아파트" },
  { type: "빌라", label: "🏘️ 빌라" },
  { type: "단독", label: "🏠 단독" },
];

export default function BuildingTypeToggle({ value, onChange }: BuildingTypeToggleProps) {
  return (
    <div className="flex gap-2 overflow-x-auto mb-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.type}
          type="button"
          data-active={value === opt.type}
          onClick={() => onChange(opt.type)}
          className="shrink-0 rounded-full border-2 px-4 py-2 text-sm transition-colors
            border-gray-200 hover:border-[#9fa8da]
            data-[active=true]:border-brand data-[active=true]:bg-brand data-[active=true]:text-white"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
