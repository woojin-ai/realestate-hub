"use client";

import { REGION_CODES } from "@/lib/regions";

interface RegionSelectorProps {
  sido: string;
  gu: string;
  onChange: (sido: string, gu: string, lawdCd: string | null) => void;
}

// lib/regions.ts의 REGION_CODES 키 순서는 원본(인구순)을 그대로 유지해야 하므로
// (다른 로직이 원본 순서에 의존할 수 있음) 렌더링 시에만 가나다순으로 정렬한다.
const sidoNames = Object.keys(REGION_CODES).sort((a, b) => a.localeCompare(b, "ko"));

export default function RegionSelector({ sido, gu, onChange }: RegionSelectorProps) {
  const guMap = sido ? REGION_CODES[sido]?.구 ?? {} : {};
  const guNames = Object.keys(guMap).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <div className="flex flex-col md:flex-row gap-3 mb-3">
      <select
        className="w-full md:w-auto min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm"
        value={sido}
        onChange={(e) => {
          const newSido = e.target.value;
          onChange(newSido, "", null);
        }}
      >
        <option value="">시/도 선택</option>
        {sidoNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <select
        className="w-full md:w-auto min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm disabled:opacity-50"
        value={gu}
        disabled={!sido}
        onChange={(e) => {
          const newGu = e.target.value;
          const lawdCd = newGu ? guMap[newGu] : null;
          onChange(sido, newGu, lawdCd);
        }}
      >
        <option value="">구/시 선택</option>
        {guNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
