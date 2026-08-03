import type { DealTypeSummary } from "@/lib/analyzer";
import { SAMPLE_FLOOR_N, formatPrice, getMonthKey } from "@/lib/analyzer";
import type { DealType } from "@/lib/types";
import {
  JEONSE_POPULATION_NOTICE_SUMMARY,
  REPORTING_IN_PROGRESS_BADGE,
  partialMonthNotice,
  sampleCountCaption,
  sampleFloorNotice,
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

/**
 * 카드의 강조 표시를 뺄지 판정한다. 조건을 만족하면 캡션에 그대로 쓸 두 건수를,
 * 아니면 null을 돌려준다(스펙 §3-1: `pct !== null && min(현재월, 비교월) < N`).
 *
 * - 건수는 **평균가에 실제로 쓰인 건수**(analyzer countAvgSample)다. 전체 신고 건수가 아니다.
 * - 건수를 못 받은 경우(옛 응답 등)는 **정상으로 취급**한다 — 근거 없이 회색으로 죽이지 않는다.
 * - 이 함수가 판정의 유일한 자리다. 카드 렌더(ChangeCard)와 하단 공시 문단 노출 조건이
 *   같은 함수를 부르므로, "회색 카드가 없는데 문단만 뜨는" 어긋남이 생길 수 없다.
 * - 임계값은 analyzer.SAMPLE_FLOOR_N 하나뿐이고, 같은 상수가 sampleFloorNotice(n)에도 들어간다.
 */
function lowSampleCounts(
  pct: number | null,
  sampleCurrent: number | null,
  sampleCompare: number | null
): { current: number; compare: number } | null {
  if (pct === null) return null;
  if (sampleCurrent === null || sampleCompare === null) return null;
  if (Math.min(sampleCurrent, sampleCompare) >= SAMPLE_FLOOR_N) return null;
  return { current: sampleCurrent, compare: sampleCompare };
}

function ChangeCard({
  label,
  pct,
  diff,
  sampleCurrent,
  sampleCompare,
}: {
  label: string;
  pct: number | null;
  diff: number | null;
  /** 현재월 평균가에 쓰인 건수. 달 계산은 buildSummary가 끝내서 내려보낸다(스펙 §3-4). */
  sampleCurrent: number | null;
  /** 이 카드의 비교월 평균가에 쓰인 건수. changes/diffs와 같은 키에서 꺼낸 값이어야 한다. */
  sampleCompare: number | null;
}) {
  const trend = trendOf(pct);
  const colorClass =
    trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-flat";
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "━";
  const lowSample = lowSampleCounts(pct, sampleCurrent, sampleCompare);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 md:p-5">
      <div className="text-xs text-gray-400 mb-1.5">{label} 대비</div>
      {pct === null ? (
        <div className="text-sm text-flat">수집 중</div>
      ) : (
        /* 표본이 하한 미만이면 등락색·볼드를 뺀다. 표시되는 **값과 화살표는 그대로**다 —
           두 평균가의 대소 관계는 참이고, 화살표를 빼거나 ━로 바꾸면 "보합"이라는 다른
           주장이 된다(마스터 확정). 글자 크기도 유지한다(스펙 §5-2: 크기가 카드마다 다르면
           2×2 그리드가 고장 난 것처럼 보인다).
           색은 text-gray-600. text-flat(#888)은 이 사이트에서 "보합"의 확립된 의미라
           ▼와 서로를 반박하고, 대비도 소형 텍스트 AA에 못 미친다(스펙 §5-2). */
        <div
          className={`text-lg md:text-2xl ${
            lowSample ? "font-semibold text-gray-600" : `font-bold ${colorClass}`
          }`}
        >
          {arrow} {pct >= 0 ? "+" : ""}
          {pct}%
        </div>
      )}
      {/* 금액 줄은 pct까지 non-null일 때만 낸다.
          pct === null이면 위 큰 글씨가 "수집 중"인데 이 줄은 원래 diff만 보는 독립 조건이라,
          둘이 동시에 뜨면 "수집 중"과 구체적 금액이 한 카드에 공존하는 모순 화면이 된다.
          도달 가능성: pct가 null이려면(analyzer.ts pctChange) current/previous가 null이거나
          previous === 0인데, diff가 non-null이려면(buildSummary priceDiff) 둘 다 non-null이어야
          하므로 교집합은 **previous === 0인 경우뿐**이다. 그 previous는 avgTradePrice /
          avgJeonseDeposit의 반환값인데 두 함수 모두 양수 값만 남기고(p > 0 / deposit > 0)
          남은 게 없으면 null을 주므로, 평균은 양수의 평균이라 0이 되려면 만원 단위 평균이
          0.5 미만(= 5,000원 미만)이어야 한다. 실무상 도달 불가능하다. 그래도 집계 쪽 필터가
          바뀌면 조용히 깨지는 자리라 렌더 조건을 방어적으로 좁혀 둔다. */}
      {pct !== null && diff !== null && (
        <div className={`text-xs mt-1 ${lowSample ? "text-gray-600" : colorClass}`}>
          {/* 부호는 +/- 대칭이어야 한다. 예전에는 음수 분기가 ""여서 -5,000만원이 부호 없는
              "5,000만원"으로 렌더됐다(2026-08-04 라운드 56 실측: 인천 서구 28260 전세).
              기호는 ASCII 하이픈(U+002D)으로 통일한다 — 바로 위 퍼센트 줄이 JS 숫자
              toString 그대로라 음수가 "-15.62%"(ASCII)로 나오고, 저장소의 U+2212(−)는
              주석 산문에만 쓰여 화면 출력 관례가 아니다.
              Math.abs는 유지한다. formatPrice에 음수를 그대로 넘기면 Math.floor(v/10000)와
              v % 10000의 부호가 엇갈려 억 단위가 사라진다(formatPrice(-15000) → "-5,000만원").
              0은 기존대로 "+"에 둬서 퍼센트 줄("+0%")과 표기를 맞춘다. */}
          {diff >= 0 ? "+" : "-"}
          {formatPrice(Math.abs(diff))}
        </div>
      )}
      {/* 캡션은 카드의 마지막 줄. 변동률과 차액 둘 다 같은 두 달에서 나온 값이라 둘을 모두
          덮는 위치여야 한다.
          🔴 whitespace-nowrap·truncate를 붙이지 마라 — 전역 word-break: keep-all +
          overflow-wrap: break-word가 카드 밖 넘침을 막고 있는데 nowrap이 그 방어를 무력화하고,
          truncate는 건수를 잘라 공시를 훼손한다(스펙 §4-3).
          aria-hidden도 붙이지 마라 — 색은 스크린리더에 전달되지 않아 이 텍스트가 상태를
          비시각 사용자에게 전달하는 유일한 경로다(스펙 §5-2). */}
      {lowSample && (
        <div className="text-[11px] md:text-xs mt-1 text-gray-600">
          {sampleCountCaption(lowSample.current, lowSample.compare)}
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

  // 현재월 유효건수는 카드 4장이 공유하는 축이라 한 번만 꺼낸다.
  // sample_current/sample_compare는 buildSummary가 항상 채우지만, 옛 응답이 섞여도
  // 터지지 않게 옵셔널 체이닝으로 읽고 없으면 null(= 정상 취급)로 떨어뜨린다.
  const sampleCurrent = summary?.sample_current ?? null;
  // 하단 공시 문단은 **카드 4장 중 하나라도** 강조를 뺐을 때만 낸다. 카드 렌더와 같은
  // 판정 함수를 쓰므로 둘이 어긋날 수 없다. 매매·전세 공통이다(표본 크기는 거래유형과 무관).
  const hasLowSampleCard = CHANGE_KEYS.some(
    (key) =>
      lowSampleCounts(
        summary?.changes[key] ?? null,
        sampleCurrent,
        summary?.sample_compare?.[key] ?? null
      ) !== null
  );

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
              sampleCurrent={sampleCurrent}
              // changes/diffs와 **같은 키**로 꺼낸다. 키가 갈리면 캡션이 다른 카드의 달을 말한다.
              sampleCompare={summary?.sample_compare?.[key] ?? null}
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

        {/* 표본 하한 공시: 강조를 뺀 카드가 왜 회색인지, 캡션의 건수가 무슨 건수인지를
            설명하는 유일한 자리다. <details>로 접거나 툴팁 뒤로 숨기지 마라(스펙 §4-6).
            순서는 일반 → 특수: 부분월(헤드라인 평균가 자체의 상태) → 표본(그 평균가로 만든
            변동률을 읽는 법) → 전세(그 평균가의 모집단이라는 유형 한정 단서). 기존 두 문단의
            상대 순서는 그대로다. 클래스도 기존 두 문단과 완전히 동일하게 둔다. */}
        {hasLowSampleCard && (
          <p className="text-xs text-gray-500 leading-relaxed">{sampleFloorNotice(SAMPLE_FLOOR_N)}</p>
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
