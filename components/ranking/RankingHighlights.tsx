"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/analyzer";
import { formatRegionLabel } from "@/lib/regions";
import type { RankingRegionStat } from "@/lib/ranking";

interface RankingHighlightsProps {
  up: RankingRegionStat[];
  down: RankingRegionStat[];
}

function HighlightCard({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: RankingRegionStat[];
  tone: "up" | "down";
}) {
  const colorClass = tone === "up" ? "text-up" : "text-down";
  const arrow = tone === "up" ? "▲" : "▼";

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5">
      <h3 className="text-sm text-gray-600 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-flat py-4 text-center">변화율을 산출할 데이터가 없습니다.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row, i) => (
            <li key={row.lawdCd}>
              <Link
                href={`/?lawd_cd=${row.lawdCd}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 min-h-[44px]
                  hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-5 shrink-0 text-gray-400 text-xs">{i + 1}</span>
                  {formatRegionLabel(row)}
                </span>
                <span className={`text-sm font-semibold whitespace-nowrap ${colorClass}`}>
                  {arrow} {row.changePct !== null && row.changePct >= 0 ? "+" : ""}
                  {row.changePct}%
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    ({formatPrice(row.avgPrice)})
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 상승/하락 TOP10 하이라이트. changePct===null(변화율 산출 불가)인 지역은 이미 상위
 * (RankingBoard)에서 걸러져 들어온다 — 여기서는 정렬된 상위 10개를 그대로 렌더링만 한다.
 * 평균가는 참고용 보조 정보로 작게 병기(디자인 스펙 §1 하이라이트 예시).
 */
export default function RankingHighlights({ up, down }: RankingHighlightsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
      <HighlightCard title="▲ 상승 TOP 10 (전월 대비)" rows={up} tone="up" />
      <HighlightCard title="▼ 하락 TOP 10 (전월 대비)" rows={down} tone="down" />
    </div>
  );
}
