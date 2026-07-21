import type { DealTypeSummary } from "@/lib/analyzer";
import { formatPrice, getMonthKey } from "@/lib/analyzer";
import type { DealType } from "@/lib/types";
import {
  JEONSE_POPULATION_NOTICE_SUMMARY,
  REPORTING_IN_PROGRESS_BADGE,
  partialMonthNotice,
} from "@/lib/disclosures";

interface SummaryCardsProps {
  summary: DealTypeSummary | undefined;
  dealType: DealType;
}

type ChangeKey = "전월" | "3개월" | "6개월" | "1년";
const CHANGE_KEYS: ChangeKey[] = ["전월", "3개월", "6개월", "1년"];

function trendOf(pct: number | null): "up" | "down" | "flat" {
  if (pct === null) return "flat";
  if (pct > 0) return "up";
  if (pct < 0) return "down";
  return "flat";
}

function ChangeCard({
  label,
  pct,
  diff,
}: {
  label: string;
  pct: number | null;
  diff: number | null;
}) {
  const trend = trendOf(pct);
  const colorClass =
    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-flat";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "━";

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 md:p-5">
      <div className="text-xs text-gray-400 mb-1.5">{label} 대비</div>
      {pct === null ? (
        <div className="text-sm text-flat">수집 중</div>
      ) : (
        <div className={`text-lg md:text-2xl font-bold ${colorClass}`}>
          {arrow} {pct >= 0 ? "+" : ""}
          {pct}%
        </div>
      )}
      {diff !== null && (
        <div className={`text-xs mt-1 ${colorClass}`}>
          {diff >= 0 ? "+" : ""}
          {formatPrice(Math.abs(diff))}
        </div>
      )}
    </div>
  );
}

export default function SummaryCards({ summary, dealType }: SummaryCardsProps) {
  const currentLabel = dealType === "매매" ? "현재 평균 매매가" : "현재 평균 전세가";

  // 라벨(괄호 월 표기)과 하단 부분월 본문이 공유하는 월 문자열. current_ym이 없으면 "".
  const ymLabel = summary?.current_ym
    ? `${summary.current_ym.slice(0, 4)}.${summary.current_ym.slice(4)}`
    : "";
  // 기존 두 값의 비교. current_ym이 KST 당월과 같을 때만 부분월로 판정한다(스펙 §0-2).
  const isPartialMonth =
    summary?.current_ym != null && summary.current_ym === getMonthKey(0);

  return (
    <div className="mb-5">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-4 mb-2 md:mb-3">
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-5">
          {/* 부분월 공시 배지: current_ym이 KST 당월과 같을 때만 노출.
              거래 0건 지역에서 current_ym이 과거 달로 잡히면 배지를 띄우지 않는다. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-400 mb-1.5">
            <span>
              {currentLabel}
              {summary?.current_ym ? ` (${ymLabel})` : ""}
            </span>
            {isPartialMonth && (
              <span className="inline-block shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                {REPORTING_IN_PROGRESS_BADGE}
              </span>
            )}
          </div>
          <div className="text-lg md:text-2xl font-bold text-brand-dark">
            {formatPrice(summary?.current_avg ?? null)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 col-span-full md:contents">
          {CHANGE_KEYS.map((key) => (
            <ChangeCard
              key={key}
              label={key}
              pct={summary?.changes[key] ?? null}
              diff={summary?.diffs[key] ?? null}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {/* 부분월 공시: 표시 수치는 그대로 두고 최신월의 상태만 알린다.
            문구는 값 변화 방향(증가/감소)을 단정하지 않는다(스펙 §1-2 확정 문구). */}
        {isPartialMonth && (
          <p className="text-xs text-gray-500 leading-relaxed">{partialMonthNotice(ymLabel)}</p>
        )}

        {/* 전세 집계 기준 공시: 평균가는 신규 계약만(analyzer.ts avgJeonseDeposit, onlyNew=true),
            거래건수는 갱신 포함 전체(buildMonthlyStats의 count: records.length)로 모집단이 다르다.
            요약 카드·변동률·아래 월별 추이 그래프가 모두 같은 평균 기준이라 이 위치에 1회만 고지한다.
            매매에는 신규/갱신 구분 자체가 없어 전세 탭에서만 노출한다. */}
        {dealType === "전세" && (
          <p className="text-xs text-gray-500 leading-relaxed">{JEONSE_POPULATION_NOTICE_SUMMARY}</p>
        )}
      </div>
    </div>
  );
}
