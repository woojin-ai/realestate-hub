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
import type { DealType } from "@/lib/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface MonthlyChartProps {
  monthly: Record<string, MonthlyStat> | undefined;
  dealType: DealType;
}

function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4)}`;
}

export default function MonthlyChart({ monthly, dealType }: MonthlyChartProps) {
  const sortedYms = Object.keys(monthly ?? {}).sort();
  const labels = sortedYms.map(formatYm);
  const values = sortedYms.map((ym) => monthly?.[ym]?.avg ?? null);

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
        pointRadius: 3,
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
            return v === null ? "데이터 없음" : `${v.toLocaleString()}만원`;
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
    </section>
  );
}
