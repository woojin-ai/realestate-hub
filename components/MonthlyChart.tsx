"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { MonthlyStat } from "@/lib/analyzer";
import { getMonthKey } from "@/lib/analyzer";
import type { DealType } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface MonthlyChartProps {
  monthly: Record<string, MonthlyStat> | undefined;
  dealType: DealType;
  currentYm: string | null;
}

function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4)}`;
}

export default function MonthlyChart({ monthly, dealType, currentYm }: MonthlyChartProps) {
  const sortedYms = Object.keys(monthly ?? {}).sort();
  const labels = sortedYms.map(formatYm);
  const values = sortedYms.map((ym) => monthly?.[ym]?.avg ?? null);

  // currentYm이 KST 당월과 같을 때만 부분월로 본다(SummaryCards와 동일 판정). 아니면 lastIdx = -1.
  const isPartial = currentYm !== null && currentYm === getMonthKey(0);
  const lastIdx = isPartial ? sortedYms.indexOf(currentYm!) : -1;
  const ymLabel = lastIdx >= 0 ? formatYm(currentYm!) : "";

  const data = {
    labels,
    datasets: [
      {
        label: dealType === "매매" ? "평균 매매가(만원)" : "평균 전세가(만원)",
        data: values,
        borderColor: "#3f51b5",
        backgroundColor: "rgba(63, 81, 181, 0.15)",
        spanGaps: true,
        tension: 0.3,
        // 마지막 구간(끝점이 최신월인 구간)만 점선. 그 외 구간은 undefined 반환으로 실선 유지.
        segment: {
          borderDash: (ctx: { p1DataIndex: number }) =>
            ctx.p1DataIndex === lastIdx ? [6, 4] : undefined,
        },
        // 최신월 점만 반경 5 + 흰 속 채움. lastIdx가 -1이면 어느 점도 강조되지 않는다.
        pointRadius: sortedYms.map((_, i) => (i === lastIdx ? 5 : 3)),
        pointBackgroundColor: sortedYms.map((_, i) =>
          i === lastIdx ? "#ffffff" : "rgba(63, 81, 181, 0.15)"
        ),
        pointBorderColor: "#3f51b5",
        pointBorderWidth: sortedYms.map((_, i) => (i === lastIdx ? 2 : 1)),
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (v === null) return "데이터 없음";
            const suffix = ctx.dataIndex === lastIdx ? " (신고 진행 중)" : "";
            return `${v.toLocaleString()}만원${suffix}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 7,
        },
      },
      y: {
        ticks: {
          callback: (v) => Number(v).toLocaleString(),
        },
      },
    },
  };

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
      <h3 className="text-sm text-gray-600 mb-4">월별 평균가 추이</h3>
      <div className="h-[220px] md:h-[300px] w-full">
        {sortedYms.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-flat">
            거래 없음
          </div>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
      {lastIdx >= 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 leading-relaxed">
          <span
            aria-hidden="true"
            className="inline-block w-4 shrink-0 border-t-2 border-dashed border-brand align-middle"
          />
          점선 구간은 신고 기한이 지나지 않은 달({ymLabel})입니다.
        </p>
      )}
    </section>
  );
}
