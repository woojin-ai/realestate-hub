"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DealTypeTabs from "@/components/DealTypeTabs";
import RankingHighlights from "@/components/ranking/RankingHighlights";
import RankingTable from "@/components/ranking/RankingTable";
import PendingRegions from "@/components/ranking/PendingRegions";
import { REGION_CODES } from "@/lib/regions";
import type { DealType } from "@/lib/types";
import type { RankingDataset, RankingRegionStat, RankingSortKey, SortDir } from "@/lib/ranking";

interface RankingBoardProps {
  dataset: RankingDataset;
  /** 대표 기준월("YYYYMM") — 활성 지역이 하나도 없으면 null. */
  referenceMonth: string | null;
  /** 서버에서 이 데이터를 조회한 시각(ISO). */
  updatedAt: string;
  /** monthly_stats 조회 자체가 실패했는지(Supabase 연동 문제 등) — 안내 배너용. */
  loadError: boolean;
}

const SIDO_NAMES = Object.keys(REGION_CODES).sort((a, b) => a.localeCompare(b, "ko"));

const SORT_LABELS: Record<RankingSortKey, string> = {
  avgPrice: "평균가",
  changePct: "변화율",
  dealCount: "거래량",
};
const SORT_ORDER: RankingSortKey[] = ["avgPrice", "changePct", "dealCount"];

function formatRefMonth(ym: string | null): string {
  if (!ym) return "집계 준비 중";
  return `${ym.slice(0, 4)}.${ym.slice(4)}`;
}

/**
 * 전국 시세 랭킹 보드(/ranking) 클라이언트 오케스트레이터. 데이터는 서버 컴포넌트
 * (app/ranking/page.tsx)가 ISR로 캐싱해 props로 넘기고, 탭/시도필터/정렬은 여기서
 * in-memory로 처리한다(재요청 없음 — docs/design/ranking-board-spec-2026-07-17.md §2-3).
 *
 * 전용 그라디언트 히어로 헤더/자체 footer는 두지 않는다 — 이 페이지는 app/layout.tsx가
 * 전역 마운트하는 SiteHeader(2026-07-18)·SiteFooter(2026-07-25) 아래에서 렌더링되므로,
 * 그 두 컴포넌트를 다시 그리면 헤더/푸터가 중복된다(설계 스펙은 그 두 전역 컴포넌트가
 * 생기기 전인 2026-07-17 작성이라 이 부분만 반영해 조정했다). 대신 /about 페이지와
 * 동일한 패턴(간단한 h1 타이틀 블록)을 쓰고, YMYL 면책 문구만 본문 하단에 유지한다.
 */
export default function RankingBoard({ dataset, referenceMonth, updatedAt, loadError }: RankingBoardProps) {
  const [dealType, setDealType] = useState<DealType>("매매");
  const [sido, setSido] = useState("");
  const [sortKey, setSortKey] = useState<RankingSortKey>("avgPrice");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const allRows = dataset[dealType];

  const { activeRows, pendingRows } = useMemo(() => {
    const active: RankingRegionStat[] = [];
    const pending: RankingRegionStat[] = [];
    for (const row of allRows) {
      if (sido && row.sido !== sido) continue;
      (row.isPending ? pending : active).push(row);
    }
    return { activeRows: active, pendingRows: pending };
  }, [allRows, sido]);

  const sortedRows = useMemo(() => {
    const list = [...activeRows];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [activeRows, sortKey, sortDir]);

  const { upTop10, downTop10 } = useMemo(() => {
    const withChange = activeRows.filter(
      (r): r is RankingRegionStat & { changePct: number } => r.changePct !== null
    );
    // null 제외만으로는 부족하다 — 시/도 필터로 표본이 10개 미만인 부호만 남으면(실측:
    // 서울만 필터 시 실제 하락 지역이 9곳뿐) 나머지 한 자리가 반대 부호로 채워져
    // RankingHighlights가 "▼ +1.34%"처럼 화살표(카드 톤 고정)와 부호가 모순되는 행을
    // 그린다. 상승 카드는 changePct>0, 하락 카드는 <0인 행만 남겨 그 자체로 방지한다
    // (0%는 "유지"로 보고 어느 쪽에도 넣지 않음 — RankingTable trendOf 관례와 동일).
    const up = withChange
      .filter((r) => r.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 10);
    const down = withChange
      .filter((r) => r.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 10);
    return { upTop10: up, downTop10: down };
  }, [activeRows]);

  const handleSort = (key: RankingSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-5 md:px-5 flex-1 w-full">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1.5">
          <span className="text-2xl md:text-3xl" aria-hidden="true">
            🏆
          </span>
          <h1 className="text-lg md:text-2xl font-bold text-brand-dark">전국 아파트 시세 랭킹</h1>
        </div>
        <p className="text-xs md:text-sm text-gray-500">
          국토교통부 공공데이터 기반 · 아파트 매매·전세 · 기준월 {formatRefMonth(referenceMonth)}
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5 text-sm text-gray-600 leading-relaxed">
        <p>
          전국 시·군·구 아파트 실거래가 평균을 단순 비교한 통계표입니다. 순위가 높다고 더
          좋은·투자에 유리한 지역이라는 의미가 아닙니다.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          ⓘ 시·군·구 평균가는 그 달 거래된 아파트의 <strong>면적 구성</strong>에 크게
          좌우됩니다(대형 평형 거래가 많으면 평균가가 올라갑니다). 따라서 평균가 순위는{" "}
          <strong>평(3.3㎡)당 가격 순위와 다릅니다.</strong>
        </p>
      </section>

      {loadError && (
        <div className="bg-[#fce4ec] border border-[#f8bbd0] rounded-lg px-4 py-3 mb-4 text-sm text-[#c62828]">
          랭킹 데이터를 일시적으로 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}

      <DealTypeTabs value={dealType} onChange={setDealType} />

      <div className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
        <select
          aria-label="시/도 필터"
          className="w-full md:w-auto min-w-[150px] rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm"
          value={sido}
          onChange={(e) => setSido(e.target.value)}
        >
          <option value="">전체 시/도</option>
          {SIDO_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div
          className="flex gap-2 overflow-x-auto md:ml-auto"
          role="group"
          aria-label="정렬 기준"
        >
          {SORT_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              data-active={sortKey === key}
              onClick={() => handleSort(key)}
              className="shrink-0 rounded-full border border-gray-200 px-3.5 py-2 text-xs md:text-sm min-h-[44px]
                data-[active=true]:border-brand data-[active=true]:bg-[#f5f7ff] data-[active=true]:text-brand
                data-[active=true]:font-semibold text-gray-600"
            >
              {SORT_LABELS[key]}
              {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
            </button>
          ))}
        </div>
      </div>

      <RankingHighlights up={upTop10} down={downTop10} />

      <RankingTable rows={sortedRows} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />

      <PendingRegions rows={pendingRows} />

      <p className="text-xs text-gray-500 leading-relaxed mb-6">
        데이터 출처: 국토교통부 실거래가 공개시스템(공공데이터포털). 신고 지연·정정이
        반영되며, 특정 지역·자산의 시세를 단정하거나 투자를 권유하지 않습니다. 마지막 집계:{" "}
        {new Date(updatedAt).toLocaleString("ko-KR")}
      </p>

      <Link href="/" className="text-sm text-brand hover:underline">
        ← 메인 대시보드로 돌아가기
      </Link>
    </div>
  );
}
