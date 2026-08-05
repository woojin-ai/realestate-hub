// 추천 입력 폼 (design §2). 예산·예산유형·신축연도 + 가중치 슬라이더 4종
// (2026-07-15: "⛰ 평지 위주로 보기" 이진 체크박스 → 4번째 가중치 슬라이더로 전환, 원본 app.py w_slope 복원).
"use client";

import { useState } from "react";
import type { DealType } from "@/lib/types";

type Weights = { price: number; subway: number; new: number; slope: number };

interface RecommendFormProps {
  budget: number | null; // 단위: 만원(서버·avg_price와 동일). 화면은 억으로 환산 표기.
  budgetType: "max" | "min";
  year: number;
  weights: Weights;
  minHouseholds: number | null; // "최소 세대수" 필터(2026-07-15)
  dealType: DealType; // "현재 매매 기준" 라벨용
  dirty: boolean; // 예산·연도·필터 변경 시 "다시 추천 받기"
  onChange: (
    patch: Partial<{
      budget: number | null;
      budgetType: "max" | "min";
      year: number;
      weights: Weights;
      minHouseholds: number | null;
    }>
  ) => void;
  onSubmit: () => void;
  submitting: boolean;
}

const CUR_YEAR = new Date().getFullYear();
const MIN_YEAR = 1980; // 연도 input의 하한(= input min 속성과 동일 값)

/**
 * 신축 기준연도 입력 문자열 → 채택 가능한 연도. 아니면 null.
 * 숫자 input이라도 `-5` / `2016e3` / 빈 문자열 같은 값이 그대로 들어오므로 문자열 단계에서 거른다.
 * (음수가 상위로 전파되면 서버 후보 필터가 통째로 스킵되고 신축점수가 전부 100점이 된다 —
 *  같은 방어가 app/api/recommend/route.ts 신축기준연도 산출부에도 있다.)
 */
function parseYearInput(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null; // 빈칸·음수·소수·지수표기 배제
  const n = parseInt(t, 10);
  return n >= MIN_YEAR && n <= CUR_YEAR ? n : null;
}

const SLIDERS: Array<{ key: keyof Weights; label: string; hint: string }> = [
  { key: "price", label: "💰 가격", hint: "#e53935" },
  { key: "subway", label: "🚇 역세권", hint: "#1e88e5" },
  { key: "new", label: "🏗 신축", hint: "#43a047" },
  { key: "slope", label: "⛰ 평지", hint: "#fb8c00" },
];

export default function RecommendForm({
  budget,
  budgetType,
  year,
  weights,
  minHouseholds,
  dealType,
  dirty,
  onChange,
  onSubmit,
  submitting,
}: RecommendFormProps) {
  const eok = budget === null ? "" : budget / 10000; // 만원 → 억 표기
  const wsum = weights.price + weights.subway + weights.new + weights.slope;
  // 가중치 합이 0이면 엔진은 0%가 아니라 **4항 단순평균**(=각 25%)으로 점수를 낸다
  // (lib/recommender.ts:165 / RecommendCard.tsx:46-47 / AiRecommendSection.tsx:41-44).
  // 그래서 여기서도 25를 돌려줘야 표시가 엔진과 일치하고 아래 "→ 합 100%"도 참이 된다.
  const pct = (w: number) => (wsum > 0 ? Math.round((w / wsum) * 100) : 25);

  // 신축 기준연도는 로컬 draft 문자열로 들고 있는다. 예전에는 input이 `value={year}`
  // controlled인데 빈칸(파싱 불가)일 때 상위 전파를 건너뛰어, **화면은 빈칸인데 직전 값으로
  // 조회되는** 거짓 표시가 됐다. 이제 타이핑은 항상 화면에 반영하고(setDraft), 유효한 값만
  // 상위로 올린다. 포커스를 떠나면 무효값은 실제 적용값으로 스냅백한다.
  // (eslint react-hooks/set-state-in-effect로 effect 내 setState가 금지돼 있어 useEffect 대신
  //  이 저장소가 이미 쓰는 "prop 변경 시 렌더 중 state 조정" 패턴을 따른다 —
  //  실례: components/AiRecommendSection.tsx:88-99 prevCtx.)
  const [draft, setDraft] = useState(String(year));
  const [prevYear, setPrevYear] = useState(year);
  if (year !== prevYear) {
    setPrevYear(year);
    setDraft(String(year));
  }

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
            min={MIN_YEAR}
            max={CUR_YEAR}
            value={draft}
            title="이 연도 이후 준공을 신축으로 우대합니다"
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v); // 화면은 언제나 사용자가 친 그대로(빈칸 포함)
              const n = parseYearInput(v);
              if (n !== null) onChange({ year: n }); // 유효한 값만 상위로 전파
            }}
            onBlur={() => {
              // 무효값(빈칸·범위 밖)으로 떠나면 실제 적용 중인 값으로 되돌린다.
              if (parseYearInput(draft) === null) setDraft(String(year));
            }}
            className="rounded-lg border border-[#e0e4f0] px-3 py-2 text-sm min-h-[44px]"
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        현재 &lsquo;{dealType}&rsquo; 기준으로 추천합니다.
      </p>

      {/* 최소 세대수 필터(2026-07-15 추가) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
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

      {/* 가중치 슬라이더 4종(가격/역세권/신축/평지) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
        가격 {pct(weights.price)} · 역세권 {pct(weights.subway)} · 신축 {pct(weights.new)} · 평지{" "}
        {pct(weights.slope)} → 합 100%
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
