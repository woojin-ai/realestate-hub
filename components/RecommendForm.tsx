// 추천 입력 폼 (design §2). 예산·예산유형·신축연도 + 가중치 슬라이더 3종(평지 없음).
"use client";

import type { DealType } from "@/lib/types";

type Weights = { price: number; subway: number; new: number };

interface RecommendFormProps {
  budget: number | null; // 단위: 만원(서버·avg_price와 동일). 화면은 억으로 환산 표기.
  budgetType: "max" | "min";
  year: number;
  weights: Weights;
  flatOnly: boolean; // "평지 위주로 보기" 필터(2026-07-15)
  minHouseholds: number | null; // "최소 세대수" 필터(2026-07-15)
  dealType: DealType; // "현재 매매 기준" 라벨용
  dirty: boolean; // 예산·연도·필터 변경 시 "다시 추천 받기"
  onChange: (
    patch: Partial<{
      budget: number | null;
      budgetType: "max" | "min";
      year: number;
      weights: Weights;
      flatOnly: boolean;
      minHouseholds: number | null;
    }>
  ) => void;
  onSubmit: () => void;
  submitting: boolean;
}

const CUR_YEAR = new Date().getFullYear();

const SLIDERS: Array<{ key: keyof Weights; label: string; hint: string }> = [
  { key: "price", label: "💰 가격", hint: "#e53935" },
  { key: "subway", label: "🚇 역세권", hint: "#1e88e5" },
  { key: "new", label: "🏗 신축", hint: "#43a047" },
];

export default function RecommendForm({
  budget,
  budgetType,
  year,
  weights,
  flatOnly,
  minHouseholds,
  dealType,
  dirty,
  onChange,
  onSubmit,
  submitting,
}: RecommendFormProps) {
  const eok = budget === null ? "" : budget / 10000; // 만원 → 억 표기
  const wsum = weights.price + weights.subway + weights.new;
  const pct = (w: number) => (wsum > 0 ? Math.round((w / wsum) * 100) : 0);

  const handleBudget = (v: string) => {
    const n = parseFloat(v);
    onChange({ budget: v.trim() === "" || !Number.isFinite(n) ? null : Math.round(n * 10000) });
  };

  return (
    <div className="border-t border-[#e8eaf6] pt-4 mt-3">
      {/* 예산 / 예산유형 / 신축연도 */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-600">
          예산 (억)
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={eok}
            placeholder="예: 8"
            onChange={(e) => handleBudget(e.target.value)}
            className="rounded-lg border border-[#e0e4f0] px-3 py-2 text-sm min-h-[44px]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          기준
          <select
            value={budgetType}
            onChange={(e) => onChange({ budgetType: e.target.value === "min" ? "min" : "max" })}
            className="rounded-lg border border-[#e0e4f0] px-3 py-2 text-sm min-h-[44px] bg-white"
          >
            <option value="max">이하</option>
            <option value="min">이상</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          신축 기준연도
          <input
            type="number"
            inputMode="numeric"
            min={1980}
            max={CUR_YEAR}
            value={year}
            title="이 연도 이후 준공을 신축으로 우대합니다"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) onChange({ year: n });
            }}
            className="rounded-lg border border-[#e0e4f0] px-3 py-2 text-sm min-h-[44px]"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        현재 &lsquo;{dealType}&rsquo; 기준으로 추천합니다.
      </p>

      {/* 평지 선호 + 최소 세대수 필터(2026-07-15 추가) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <label className="flex items-center gap-2 text-sm text-gray-600 rounded-lg border border-[#e0e4f0] px-3 py-2 min-h-[44px]">
          <input
            type="checkbox"
            checked={flatOnly}
            onChange={(e) => onChange({ flatOnly: e.target.checked })}
            className="h-4 w-4 accent-[#3f51b5]"
          />
          <span>⛰ 평지 위주로 보기</span>
          <span className="text-xs text-gray-400">(경사 심한 단지 제외)</span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-gray-600">
          최소 세대수
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={minHouseholds ?? ""}
            placeholder="예: 500 (미입력 시 전체)"
            onChange={(e) => {
              const v = e.target.value;
              const n = parseInt(v, 10);
              onChange({ minHouseholds: v.trim() === "" || !Number.isFinite(n) ? null : n });
            }}
            className="rounded-lg border border-[#e0e4f0] px-3 py-2 text-sm min-h-[44px]"
          />
        </label>
      </div>

      {/* 가중치 슬라이더 3종 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {SLIDERS.map(({ key, label, hint }) => (
          <label key={key} className="flex flex-col gap-1 text-sm text-gray-600">
            <span className="flex items-center justify-between">
              <span>{label}</span>
              <span className="font-semibold text-gray-800">{weights[key]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={weights[key]}
              aria-valuetext={`${label} 선호 ${weights[key]}`}
              style={{ accentColor: hint }}
              onChange={(e) =>
                onChange({ weights: { ...weights, [key]: Number(e.target.value) } })
              }
              className="w-full"
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        가격 {pct(weights.price)} · 역세권 {pct(weights.subway)} · 신축 {pct(weights.new)} → 합 100%
      </p>
      <p className="text-xs text-gray-400">
        가중치는 상대 비율로 자동 환산됩니다. 슬라이더를 움직이면 추가 조회 없이 바로 다시 정렬돼요.
      </p>

      {/* CTA */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full md:w-auto rounded-lg bg-brand px-7 py-2.5 text-sm text-white
            hover:bg-[#303f9f] disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
        >
          {submitting ? "추천 계산 중..." : dirty ? "다시 추천 받기" : "추천 받기"}
        </button>
        {dirty && !submitting && (
          <span className="text-xs text-[#c62828] bg-[#fce4ec] rounded-full px-2 py-1">
            조건이 바뀌었어요
          </span>
        )}
      </div>
    </div>
  );
}
