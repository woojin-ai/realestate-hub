// 추천 카드 (design §4). 원본 renderRecCards 계승 — 평지 막대 복원(2026-07-15, 원본 색상 #fb8c00).
"use client";

import { formatPrice } from "@/lib/analyzer";
import type { RecommendItem } from "@/lib/recommender";

interface RecommendCardProps {
  rank: number; // 0-based → 메달/N위
  item: RecommendItem;
  weights: { price: number; subway: number; new: number; slope: number }; // 종합점수 재계산용(무호출 재정렬)
  onClick: () => void; // 부모가 원본 AptStat 찾아 모달 오픈
}

const MEDALS = ["🥇", "🥈", "🥉"];
// 1~3위 미묘한 강조(과한 금테 지양, design §4-B)
const RANK_RING = ["ring-1 ring-amber-200", "ring-1 ring-gray-200", "ring-1 ring-orange-200"];

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div role="img" aria-label={`${label} 점수 ${score}점`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-semibold text-gray-700">{score}점</span>
      </div>
      <span aria-hidden="true" className="block bg-[#eef] rounded h-1.5 mt-1">
        <span
          className="block h-1.5 rounded transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color }}
        />
      </span>
    </div>
  );
}

export default function RecommendCard({ rank, item, weights, onClick }: RecommendCardProps) {
  // 종합점수는 슬라이더 가중치로 실시간 재계산(서버 재호출 없음, design §3-B).
  // slope_score가 null(고도 데이터 확보 실패)이면 원본 규약대로 0으로 대입해 계산한다.
  const slopeRaw = item.slope_score ?? 0;
  const wsum = weights.price + weights.subway + weights.new + weights.slope;
  const total =
    wsum <= 0
      ? Math.round((item.price_score + item.subway_score + item.newbuild_score + slopeRaw) / 4)
      : Math.round(
          (item.price_score * weights.price +
            item.subway_score * weights.subway +
            item.newbuild_score * weights.new +
            slopeRaw * weights.slope) /
            wsum
        );

  const medal = MEDALS[rank];
  const ring = rank < 3 ? RANK_RING[rank] : "";
  const meta = [item.build_year ? `${item.build_year}년 준공` : "", item.dong]
    .filter(Boolean)
    .join(" · ");
  const subwayText =
    item.subway_dist < 9999
      ? `🚇 ${item.subway_name} · 도보 ${item.subway_dist}m`
      : "🚇 도보 미확인";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${item.name} 평수별 상세 보기`}
      className={`text-left w-full bg-white rounded-xl border border-[#e8eaf6] p-4 shadow-sm hover:shadow-md transition cursor-pointer
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${ring}`}
    >
      <div className="flex items-center justify-between mb-1">
        {medal ? (
          <span className="text-lg" aria-label={`${rank + 1}위`}>
            {medal}
          </span>
        ) : (
          <span className="text-sm font-bold text-flat">{rank + 1}위</span>
        )}
        <span className="text-[0.7rem] text-[#9fa8da]">클릭 → 평수별 상세</span>
      </div>

      <div className="text-base font-bold text-brand-dark">{item.name}</div>
      {meta && <div className="text-xs text-flat mt-0.5">{meta}</div>}

      <div className="mt-1 text-brand-dark font-semibold">
        {formatPrice(item.avg_price)}{" "}
        <span className="text-xs text-flat font-normal">전체 평균</span>
      </div>

      <div className="mt-2">
        <span className="inline-flex items-center bg-[#e8eaf6] text-brand rounded-full px-2 py-0.5 text-xs">
          {subwayText}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-brand">{total}점</span>
        <span className="text-xs text-flat">/100</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <ScoreBar label="💰 가격" score={item.price_score} color="#e53935" />
        <ScoreBar label="🚇 역세권" score={item.subway_score} color="#1e88e5" />
        <ScoreBar label="🏗 신축" score={item.newbuild_score} color="#43a047" />
        {item.slope_score != null ? (
          <ScoreBar label="⛰ 평지" score={item.slope_score} color="#fb8c00" />
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500">⛰ 평지</span>
            <span className="text-xs text-gray-400">측정불가</span>
          </div>
        )}
      </div>
    </button>
  );
}
