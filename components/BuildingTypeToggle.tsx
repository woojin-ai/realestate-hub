"use client";

import Image from "next/image";
import type { BuildingType } from "@/lib/types";

interface BuildingTypeToggleProps {
  value: BuildingType;
  onChange: (type: BuildingType) => void;
}

// 빌라/단독 조회는 백엔드 로직상으로는 구현돼 있으나(마이그레이션 로드맵 2단계),
// 사용자 요청(2026-07-14)에 따라 원본 앱의 기존 핵심 기능(상세보기·AI추천)을
// 먼저 복원하는 동안 UI에서는 "준비중"으로 노출만 비활성화한다.
const OPTIONS: { type: BuildingType; label: string; icon: string; comingSoon?: boolean }[] = [
  { type: "아파트", label: "아파트", icon: "/images/icons/apartment.svg" },
  { type: "빌라", label: "빌라", icon: "/images/icons/villa.svg", comingSoon: true },
  { type: "단독", label: "단독", icon: "/images/icons/house.svg", comingSoon: true },
];

export default function BuildingTypeToggle({ value, onChange }: BuildingTypeToggleProps) {
  return (
    <div className="flex gap-2 overflow-x-auto mb-3">
      {OPTIONS.map((opt) => {
        const active = value === opt.type;
        return (
          <button
            key={opt.type}
            type="button"
            disabled={opt.comingSoon}
            data-active={active}
            onClick={() => onChange(opt.type)}
            title={opt.comingSoon ? "준비중입니다" : undefined}
            className="shrink-0 flex items-center gap-1.5 rounded-full border-2 px-4 py-2 text-sm transition-colors relative
              border-gray-200 hover:border-[#9fa8da]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200
              data-[active=true]:border-brand data-[active=true]:bg-brand data-[active=true]:text-white"
          >
            <Image
              src={opt.icon}
              alt=""
              width={20}
              height={20}
              loading="eager"
              className={active ? "brightness-0 invert" : ""}
            />
            {opt.label}
            {opt.comingSoon && (
              <span className="ml-1 align-middle text-[10px] font-semibold text-gray-500">
                (준비중)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
