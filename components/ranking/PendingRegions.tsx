"use client";

import Link from "next/link";
import { formatRegionLabel } from "@/lib/regions";
import type { RankingRegionStat } from "@/lib/ranking";

interface PendingRegionsProps {
  rows: RankingRegionStat[];
}

/**
 * 최신월 집계가 아직 없는(avg_price===null 또는 deal_count===0) 지역을 순위와 분리해
 * 보여준다. 빈 값이 정렬상 1위/최하위로 튀어 오정보가 되는 것을 막는 조치(기획 리스크
 * "커버리지" 대응, docs/planning/next-features-2026-07-17.md §1-4). 클릭은 그대로
 * 딥링크를 유지한다(대시보드에서 직접 확인 가능하도록).
 */
export default function PendingRegions({ rows }: PendingRegionsProps) {
  if (rows.length === 0) return null;

  return (
    <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 md:p-5 mb-5">
      <h3 className="text-sm text-gray-500 mb-2">집계 준비 중</h3>
      <p className="text-xs text-gray-400 mb-3">
        아래 지역은 최신월 집계가 아직 확보되지 않아 순위에서 제외했습니다. 수집이 끝나면
        다음 갱신에 반영됩니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <Link
            key={row.lawdCd}
            href={`/?lawd_cd=${row.lawdCd}`}
            className="rounded-full bg-white border border-gray-200 px-3 py-1.5 text-xs text-gray-500
              hover:bg-gray-100 min-h-[44px] inline-flex items-center
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          >
            {formatRegionLabel(row)}
          </Link>
        ))}
      </div>
    </section>
  );
}
