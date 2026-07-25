"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/analyzer";
import { formatRegionLabel } from "@/lib/regions";
import type { RankingRegionStat, RankingSortKey, SortDir } from "@/lib/ranking";

interface RankingTableProps {
  rows: RankingRegionStat[];
  sortKey: RankingSortKey;
  sortDir: SortDir;
  onSort: (key: RankingSortKey) => void;
}

interface ColumnDef {
  key: RankingSortKey | "rank" | "region" | "refYm";
  label: string;
  sortable: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "rank", label: "순위", sortable: false },
  { key: "region", label: "지역", sortable: false },
  { key: "avgPrice", label: "평균가", sortable: true },
  { key: "changePct", label: "전월대비", sortable: true },
  { key: "dealCount", label: "거래량", sortable: true },
  { key: "refYm", label: "기준월", sortable: false },
];

function trendOf(pct: number | null): "up" | "down" | "flat" {
  if (pct === null) return "flat";
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

/**
 * 랭킹 리그테이블. DealsTable(components/DealsTable.tsx) 관례를 그대로 따른다 — sticky
 * 헤더/첫 열, 정렬 헤더 클릭 토글, 상승/하락 배지 색상·화살표. 행 전체를 <a>로 감싸지
 * 않는 이유: <tr>/<td>를 통째로 <a>로 감싸는 것은 유효한 HTML 표 구조가 아니고, 이
 * 저장소의 DealsTable도 셀 안의 인터랙티브 요소(버튼) 방식을 쓴다 — 동일하게 지역명
 * 셀의 링크만 클릭 영역으로 하되 min-h-[44px]로 터치타깃을 확보한다.
 */
export default function RankingTable({ rows, sortKey, sortDir, onSort }: RankingTableProps) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
      <h3 className="text-sm text-gray-600 mb-2">
        지역별 순위{" "}
        <span className="font-normal text-gray-400">
          (ⓘ 평균가는 면적 구성에 따라 달라질 수 있어 참고용입니다 — 평(3.3㎡)당 가격
          순위와 다릅니다)
        </span>
      </h3>
      <div className="overflow-x-auto">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full border-collapse text-xs md:text-sm">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => onSort(col.key as RankingSortKey) : undefined}
                    className={`sticky top-0 z-10 bg-[#f5f7ff] px-2 py-2.5 md:px-3 text-left text-gray-600 border-b-2 border-[#e0e4f0] whitespace-nowrap ${
                      col.sortable ? "cursor-pointer" : ""
                    } ${col.key === "region" ? "sticky left-0 z-20" : ""}`}
                  >
                    {col.label}
                    {col.sortable && sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-2 py-8 text-center text-flat">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => {
                  const trend = trendOf(row.changePct);
                  const colorClass =
                    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-flat";
                  const badgeBg =
                    trend === "up" ? "bg-[#ffebee]" : trend === "down" ? "bg-[#e3f2fd]" : "bg-gray-100";
                  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "━";

                  return (
                    <tr key={row.lawdCd}>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100 text-gray-400">
                        {i + 1}
                      </td>
                      <td className="sticky left-0 bg-white px-2 py-2.5 md:px-3 border-b border-gray-100">
                        <Link
                          href={`/?lawd_cd=${row.lawdCd}`}
                          className="font-bold text-brand-dark underline decoration-dotted underline-offset-2
                            hover:text-brand focus-visible:outline focus-visible:outline-2
                            focus-visible:outline-brand focus-visible:rounded min-h-[44px] inline-flex items-center"
                        >
                          {formatRegionLabel(row)}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {formatPrice(row.avgPrice)}
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">
                        {row.changePct === null ? (
                          <span className="text-flat">데이터 없음</span>
                        ) : (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badgeBg} ${colorClass}`}
                          >
                            {arrow} {row.changePct >= 0 ? "+" : ""}
                            {row.changePct}%
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100">{row.dealCount}</td>
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100 text-gray-400">
                        {row.refYm ? `${row.refYm.slice(0, 4)}.${row.refYm.slice(4)}` : "-"}
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
