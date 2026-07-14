"use client";

import { useMemo, useState } from "react";
import type { AptStat } from "@/lib/analyzer";
import { formatPrice } from "@/lib/analyzer";
import type { DealType } from "@/lib/types";

interface DealsTableProps {
  rows: AptStat[] | undefined;
  dealType: DealType;
}

type SortKey = "name" | "build_year" | "avg_price" | "mom_pct" | "count" | "latest_ym";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "건물명" },
  { key: "build_year", label: "연식" },
  { key: "avg_price", label: "평균가" },
  { key: "mom_pct", label: "전월대비" },
  { key: "count", label: "거래건수" },
  { key: "latest_ym", label: "최근거래월" },
];

function trendOf(pct: number | null): "up" | "down" | "flat" {
  if (pct === null) return "flat";
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

export default function DealsTable({ rows, dealType }: DealsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const list = [...(rows ?? [])];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortAsc ? an - bn : bn - an;
    });
    return list;
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const avgLabel = dealType === "매매" ? "평균 매매가" : "평균 전세가";

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
      <h3 className="text-sm text-gray-600 mb-4">아파트 목록</h3>
      <div className="overflow-x-auto">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full border-collapse text-xs md:text-sm">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`sticky top-0 z-10 bg-[#f5f7ff] px-2 py-2.5 md:px-3 text-left text-gray-600 border-b-2 border-[#e0e4f0] cursor-pointer whitespace-nowrap ${
                      col.key === "name" ? "sticky left-0 z-20" : ""
                    }`}
                  >
                    {col.key === "avg_price" ? avgLabel : col.label}
                    {sortKey === col.key ? (sortAsc ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-flat">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                sorted.map((row) => {
                  const trend = trendOf(row.mom_pct);
                  const colorClass =
                    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-flat";
                  const badgeBg =
                    trend === "up" ? "bg-[#ffebee]" : trend === "down" ? "bg-[#e3f2fd]" : "bg-gray-100";
                  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "━";

                  return (
                    <tr key={row.name}>
                      <td className="sticky left-0 bg-white px-2 py-2.5 md:px-3 border-b border-gray-100">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-gray-400 text-[11px]">{row.dong}</div>
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {row.build_year || "-"}
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {formatPrice(row.avg_price)}
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {row.mom_pct === null ? (
                          <span className="text-flat">데이터 없음</span>
                        ) : (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBg} ${colorClass}`}
                          >
                            {arrow} {row.mom_pct >= 0 ? "+" : ""}
                            {row.mom_pct}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">{row.count}</td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {row.latest_ym ? `${row.latest_ym.slice(0, 4)}.${row.latest_ym.slice(4)}` : "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
