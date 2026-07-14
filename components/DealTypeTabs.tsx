"use client";

import type { DealType } from "@/lib/types";

interface DealTypeTabsProps {
  value: DealType;
  onChange: (type: DealType) => void;
}

const TABS: DealType[] = ["매매", "전세"];

export default function DealTypeTabs({ value, onChange }: DealTypeTabsProps) {
  return (
    <div className="flex bg-white rounded-xl shadow-sm overflow-hidden mb-5">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          data-active={value === tab}
          onClick={() => onChange(tab)}
          className="flex-1 py-3.5 text-sm md:text-base min-h-[44px] border-b-[3px] border-transparent
            data-[active=true]:border-brand data-[active=true]:text-brand data-[active=true]:font-semibold
            data-[active=true]:bg-[#f5f7ff] text-gray-500"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
