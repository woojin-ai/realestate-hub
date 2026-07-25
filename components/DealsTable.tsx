"use client";

import { useMemo, useState } from "react";
import type { AptStat } from "@/lib/analyzer";
import { formatPrice } from "@/lib/analyzer";
import type { DealType } from "@/lib/types";
import AptDetailModal from "@/components/AptDetailModal";
import { JEONSE_POPULATION_NOTICE_TABLE } from "@/lib/disclosures";

interface DealsTableProps {
  rows: AptStat[] | undefined;
  dealType: DealType;
  lawdCd: string | null; // 위치 섹션(/api/apt-location) 자연키 — 모달로 전달
  gu: string;
}

type SortKey = "name" | "build_year" | "avg_price" | "mom_pct" | "count" | "latest_ym";

// 라벨의 괄호 안 기간은 analyzer.buildAptStats가 실제로 쓰는 범위다(임의 표기 아님).
//  - avg_price: "거래가 있었던 최근 3개 달"의 레코드만 평균(analyzer.ts recentYms = slice(0,3)).
//    연속 3개월이 아니므로 "최근 3개월"이 아니라 "최근 거래 3개월"로 적는다.
//  - count: 수집창 전체 = 13개월(app/page.tsx의 months=13, /api/data DEFAULT_MONTHS=13,
//    /api/recommend RECOMMEND_MONTHS=13 모두 동일).
//  - mom_pct: recentYms[0] vs recentYms[1] = "거래가 있었던 최근 두 달"의 비교라 인접 달이
//    보장되지 않는다. 기존 "전월대비"는 거래가 뜸한 단지에서 사실과 달라져 "직전 거래월 대비"로 고친다.
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "건물명" },
  { key: "build_year", label: "연식" },
  { key: "avg_price", label: "평균가(최근 거래 3개월)" },
  { key: "mom_pct", label: "직전 거래월 대비" },
  { key: "count", label: "거래건수(13개월)" },
  { key: "latest_ym", label: "최근거래월" },
];

function trendOf(pct: number | null): "up" | "down" | "flat" {
  if (pct === null) return "flat";
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

export default function DealsTable({ rows, dealType, lawdCd, gu }: DealsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortAsc, setSortAsc] = useState(false);
  // 평수별 상세 모달: 선택된 row를 통째로 저장(재조회 없음). 상태는 DealsTable이 소유.
  const [selected, setSelected] = useState<AptStat | null>(null);

  // 매매↔전세 탭 전환 시 열린 모달을 닫는다(이전 탭 수치가 stale로 남는 오인 방지).
  // 구성안은 useEffect(() => setSelected(null), [dealType]) 를 제시했으나, 이 프로젝트의
  // eslint 규칙(react-hooks/set-state-in-effect)이 effect 내 setState를 error로 막아 lint
  // 게이트가 깨진다. 동작(탭 변경 시 모달 닫기)은 동일하게 유지하되, React 공식 문서가
  // 권장하는 "prop 변경 시 렌더 중 state 조정" 패턴으로 대체한다.
  const [prevDealType, setPrevDealType] = useState(dealType);
  if (dealType !== prevDealType) {
    setPrevDealType(dealType);
    setSelected(null);
  }

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

  const avgLabel =
    dealType === "매매"
      ? "평균 매매가(최근 거래 3개월)"
      : "평균 전세가(최근 거래 3개월)";

  // 전세 탭에서만 "전체 N / 신규 M"을 병기한다. 매매는 국토부 API에 신규/갱신 구분이
  // 없어(contract_type=null → analyzer가 new_count=null) 병기 대상이 아니다.
  // new_count가 없는 예전 응답(캐시된 JSON 등)에서도 undefined면 자동으로 미표기된다.
  const showNewCount = dealType === "전세";

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
      <h3 className="text-sm text-gray-600 mb-2">아파트 목록</h3>
      {/* 전세 집계 기준 공시: 같은 행의 '평균 전세가'(신규 계약만)와 '거래건수'(갱신 포함 전체)는
          모집단이 다르다. 두 값이 나란히 보이는 표라 헤더 바로 위에 고지한다(매매 탭은 구분 없음). */}
      {dealType === "전세" && (
        <p className="text-xs text-gray-500 leading-relaxed mb-3">
          {JEONSE_POPULATION_NOTICE_TABLE}
        </p>
      )}
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
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={`${row.name} 평수별 상세 보기`}
                          onClick={() => setSelected(row)}
                          className="text-left font-bold text-brand-dark underline decoration-dotted underline-offset-2
                            hover:text-brand
                            focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded
                            min-h-[44px] flex items-center bg-transparent py-1"
                        >
                          {row.name}
                        </button>
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
                      <td className="px-2 py-2.5 md:px-3 border-b border-gray-100 whitespace-nowrap">
                        {/* 병기 시 스크린리더가 "237 신규 144"로 읽어 앞 숫자가 전체인지
                            불명확해지므로, 시각적으로는 그대로 두고 한정어만 sr-only로 보충한다.
                            단위("건")도 모달(`전체 N건(신규 M건)`) 표기와 맞춘다. */}
                        {showNewCount && row.new_count != null && (
                          <span className="sr-only">전체 </span>
                        )}
                        {row.count}
                        {showNewCount && row.new_count != null && (
                          <span className="block text-[11px] text-gray-400">
                            신규 {row.new_count}건
                          </span>
                        )}
                      </td>
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

      {selected && (
        <AptDetailModal
          apt={selected}
          onClose={() => setSelected(null)}
          lawdCd={lawdCd ?? ""}
          gu={gu}
          dealType={dealType}
        />
      )}
    </section>
  );
}
