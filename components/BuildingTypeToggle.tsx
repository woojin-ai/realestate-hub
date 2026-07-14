"use client";

import type { BuildingType } from "@/lib/types";

interface BuildingTypeToggleProps {
  value: BuildingType;
  onChange: (type: BuildingType) => void;
}

// 아파트/빌라/단독 3종 모두 실제 조회 지원(마이그레이션 로드맵 2단계 완료).
// 선택 값은 상위 페이지에서 /api/data?building_type=... 로 전달된다.
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
