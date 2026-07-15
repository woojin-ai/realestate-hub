// AI 맞춤 추천 섹션 컨테이너 (design §8-1). 상태머신 collapsed→form→running→result.
// 가중치 재정렬은 useMemo로 무호출 재계산(§3-B). 카드 클릭 → 부모 rows의 원본 AptStat로
// AptDetailModal 무수정 재사용(§4-C). dealType/lawdCd 변경 시 결과 폐기+접힘+모달 닫기(§6).
"use client";

import { useMemo, useState } from "react";
import type { AptStat } from "@/lib/analyzer";
import type { DealType, BuildingType } from "@/lib/types";
import type { RecommendItem } from "@/lib/recommender";
import RecommendForm from "@/components/RecommendForm";
import RecommendCard from "@/components/RecommendCard";
import RecommendCardSkeleton from "@/components/RecommendCardSkeleton";
import AptDetailModal from "@/components/AptDetailModal";

interface AiRecommendSectionProps {
  lawdCd: string | null; // 조회된 지역코드
  gu: string; // 지역명(요청 param)
  dealType: DealType; // 상단 탭 연동
  rows: AptStat[] | undefined; // 후보 풀 + 모달용 원본 AptStat 소스
  buildingType: BuildingType; // 아파트일 때만 노출(§1-2)
}

type Phase = "collapsed" | "form" | "running" | "result";
type Weights = { price: number; subway: number; new: number; slope: number };
type Progress = { filled: number; total: number; pending: boolean; canLive: boolean };
type Submitted = {
  budget: number | null;
  budgetType: "max" | "min";
  year: number;
  minHouseholds: number | null;
};

const CUR_YEAR = new Date().getFullYear();
// 2026-07-15: "⛰ 평지 위주로 보기" 이진 필터 → 4번째 가중치 슬라이더로 전환(원본 app.py w_slope=10 복원).
const DEFAULT_WEIGHTS: Weights = { price: 45, subway: 35, new: 20, slope: 10 };
const geoKey = (name: string, dong: string) => `${name}||${dong}`;

function compositeScore(item: RecommendItem, w: Weights): number {
  const sum = w.price + w.subway + w.new + w.slope;
  const slopeRaw = item.slope_score ?? 0; // 측정불가 시 원본 규약대로 0 대입
  if (sum <= 0)
    return Math.round(
      (item.price_score + item.subway_score + item.newbuild_score + slopeRaw) / 4
    );
  return Math.round(
    (item.price_score * w.price +
      item.subway_score * w.subway +
      item.newbuild_score * w.new +
      slopeRaw * w.slope) /
      sum
  );
}

function ProgressBadge({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="bg-[#f5f7ff] border border-[#dde1f5] rounded-lg px-4 py-3 text-sm text-brand flex items-center gap-3 mb-4">
      <span className="inline-block h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      <span>
        이 지역 추천 데이터를 준비하고 있어요 · {filled}/{total}
        <span className="text-xs text-gray-400 ml-2">정렬은 즉시, 데이터 채움은 진행 중</span>
      </span>
    </div>
  );
}

export default function AiRecommendSection({
  lawdCd,
  gu,
  dealType,
  rows,
  buildingType,
}: AiRecommendSectionProps) {
  const [phase, setPhase] = useState<Phase>("collapsed");
  const [budget, setBudget] = useState<number | null>(null); // 만원 단위
  const [budgetType, setBudgetType] = useState<"max" | "min">("max");
  const [year, setYear] = useState<number>(CUR_YEAR - 10);
  const [minHouseholds, setMinHouseholds] = useState<number | null>(null); // "최소 세대수" 필터(2026-07-15)
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [items, setItems] = useState<RecommendItem[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [selected, setSelected] = useState<AptStat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<Submitted | null>(null);

  // dealType/lawdCd 변경 시 결과 폐기 + 접힘 + 모달 닫기(§6).
  // (프로젝트 eslint 규칙 react-hooks/set-state-in-effect가 effect 내 setState를 막으므로
  //  DealsTable과 동일하게 "prop 변경 시 렌더 중 state 조정" 패턴을 쓴다. 동작은 동일.)
  const ctx = `${dealType}|${lawdCd}`;
  const [prevCtx, setPrevCtx] = useState(ctx);
  if (ctx !== prevCtx) {
    setPrevCtx(ctx);
    setPhase("collapsed");
    setItems([]);
    setProgress(null);
    setSelected(null);
    setError(null);
    setLastSubmitted(null);
    setMinHouseholds(null);
  }

  // 무호출 재정렬: 가중치 변경 시 원점수만으로 종합점수 재계산 후 정렬(§3-B).
  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => compositeScore(b, weights) - compositeScore(a, weights)),
    [items, weights]
  );

  // 모달용: 부모 rows를 name+dong으로 O(1) 인덱싱(§4-C).
  const rowsMap = useMemo(() => {
    const m = new Map<string, AptStat>();
    for (const r of rows ?? []) m.set(geoKey(r.name, r.dong), r);
    return m;
  }, [rows]);

  // 예산/연도/최소세대수 변경 감지 → "다시 추천 받기" dirty(§6). (평지는 이제 슬라이더라서
  // sortedItems useMemo가 무호출로 즉시 재정렬하므로 dirty 대상이 아니다.)
  const dirty =
    lastSubmitted !== null &&
    (budget !== lastSubmitted.budget ||
      budgetType !== lastSubmitted.budgetType ||
      year !== lastSubmitted.year ||
      minHouseholds !== lastSubmitted.minHouseholds);

  const patch = (
    p: Partial<{
      budget: number | null;
      budgetType: "max" | "min";
      year: number;
      weights: Weights;
      minHouseholds: number | null;
    }>
  ) => {
    if ("budget" in p) setBudget(p.budget!);
    if (p.budgetType) setBudgetType(p.budgetType);
    if (typeof p.year === "number") setYear(p.year);
    if (p.weights) setWeights(p.weights);
    if ("minHouseholds" in p) setMinHouseholds(p.minHouseholds!);
  };

  const runRecommend = async () => {
    if (!lawdCd) return;
    setPhase("running");
    setError(null);
    const params = new URLSearchParams({
      lawd_cd: lawdCd,
      gu,
      deal_type: dealType,
      budget: budget === null ? "" : String(budget),
      budget_type: budgetType,
      year: String(year),
      w_price: String(weights.price),
      w_subway: String(weights.subway),
      w_new: String(weights.new),
      w_slope: String(weights.slope),
      min_households: minHouseholds === null ? "" : String(minHouseholds),
    });
    try {
      const res = await fetch(`/api/recommend?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError("추천 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        setPhase("result");
        return;
      }
      setItems(json.items ?? []);
      setProgress({
        filled: json.filled,
        total: json.total_candidates,
        pending: json.pending,
        // 라우트가 can_live를 안 주는 구버전 호환: 미정의면 true(기존 스켈레톤/더보기 동작 유지).
        canLive: json.can_live !== false,
      });
      setLastSubmitted({ budget, budgetType, year, minHouseholds });
      setPhase("result");
    } catch {
      setError("추천 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      setPhase("result");
    }
  };

  const onCardClick = (item: RecommendItem) => {
    // 1차 소스: 추천 item이 실어온 원본 AptStat(top-30 밖 단지도 모달이 열림, design §4-C 옵션 b).
    // 폴백: 혹시 apt가 비면 부모 rows에서 name+dong으로 조회.
    const apt = item.apt ?? rowsMap.get(geoKey(item.name, item.dong));
    if (apt) setSelected(apt);
  };

  // 노출조건(§1-2): 아파트 탭 + 조회된 지역일 때만. (부모도 ready/비어있지 않음으로 가드)
  if (buildingType !== "아파트" || !lawdCd) return null;

  // ── collapsed: 접힘 배너 ────────────────────────────────────────────────
  if (phase === "collapsed") {
    return (
      <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-2xl">✨</span>
          <div>
            <h3 className="text-base font-bold text-brand-dark">AI 맞춤 추천</h3>
            <p className="text-sm text-gray-500">
              예산·역세권·신축 선호도로 이 지역 단지를 점수화해 추천해요
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setPhase("form")}
          className="rounded-lg bg-brand px-7 py-2.5 text-sm text-white hover:bg-[#303f9f] min-h-[44px] w-full md:w-auto"
        >
          AI 맞춤 추천 보기
        </button>
      </section>
    );
  }

  const running = phase === "running";
  const remaining = progress ? Math.max(0, progress.total - progress.filled) : 0;
  const skeletonCount = running
    ? progress
      ? Math.min(remaining || 6, 8)
      : 6
    : Math.min(remaining, 8);
  const showEmpty =
    phase === "result" && !error && items.length === 0 && !(progress?.pending ?? false);
  // 콜드+라이브불가 고착 가드(§L3): 라이브 채움 불가 + 이번 라운드 채움 0 + 카드 0이면
  // pending=true라도 스켈레톤/진행배지/더보기 대신 중립 안내를 띄운다(진전 불가).
  const cannotFill =
    phase === "result" &&
    !error &&
    items.length === 0 &&
    progress !== null &&
    progress.canLive === false &&
    progress.filled === 0;

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-brand-dark">
          ✨ AI 맞춤 추천 <span className="text-xs text-gray-400 font-normal">(예산·역세권·신축 기준)</span>
        </h3>
        <button
          type="button"
          aria-expanded
          onClick={() => setPhase("collapsed")}
          className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] px-2"
        >
          접기 ▲
        </button>
      </div>

      {/* 입력 폼(§2) — form/running/result 모두 상단 유지 */}
      <RecommendForm
        budget={budget}
        budgetType={budgetType}
        year={year}
        weights={weights}
        minHouseholds={minHouseholds}
        dealType={dealType}
        dirty={dirty}
        onChange={patch}
        onSubmit={runRecommend}
        submitting={running}
        key="rec-form"
      />

      {/* 에러 배너(§5) — 부분결과 카드는 유지 */}
      {error && (
        <div className="mt-4 bg-[#fce4ec] border border-[#f8bbd0] rounded-lg px-4 py-3 flex items-center justify-between gap-3 text-sm text-[#c62828]">
          <span>{error}</span>
          <button
            type="button"
            onClick={runRecommend}
            className="shrink-0 rounded-md border border-[#c62828] px-3 py-1.5 text-xs hover:bg-[#f8bbd0]"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 진행 배지(§3-A) — running이거나 result인데 미채움 남은 경우(단, 라이브불가 고착은 제외) */}
      {(running || (phase === "result" && progress?.pending)) && progress !== null && !cannotFill && (
        <div className="mt-4">
          <ProgressBadge filled={progress.filled} total={progress.total} />
        </div>
      )}
      {running && progress === null && (
        <div className="mt-4">
          <ProgressBadge filled={0} total={0} />
        </div>
      )}

      {/* 빈 결과(§5) */}
      {showEmpty && (
        <p className="text-center text-flat py-8">
          조건에 맞는 신축 아파트가 없어요. 예산을 높이거나 연도 기준을 낮춰보세요.
        </p>
      )}

      {/* 라이브 채움 불가 안내(§L3) — 스켈레톤/더보기 고착 대신 중립 안내 */}
      {cannotFill && (
        <p className="text-center text-flat py-8">
          추천 데이터를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      {/* 카드 그리드(§4-D) + 스켈레톤 */}
      {(sortedItems.length > 0 || running) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {sortedItems.map((item, i) => (
            <RecommendCard
              key={geoKey(item.name, item.dong)}
              rank={i}
              item={item}
              weights={weights}
              onClick={() => onCardClick(item)}
            />
          ))}
          {skeletonCount > 0 &&
            Array.from({ length: skeletonCount }).map((_, i) => (
              <RecommendCardSkeleton key={`sk-${i}`} />
            ))}
        </div>
      )}

      {/* 더 불러오기(§3-A) — 미채움분 남았을 때(라이브불가 고착은 제외) */}
      {phase === "result" && progress?.pending && !cannotFill && (
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400 mb-2">
            아직 채우지 못한 단지가 있어요. 데이터를 더 불러오면 후보가 늘어납니다.
          </p>
          <button
            type="button"
            onClick={runRecommend}
            className="rounded-lg border border-brand text-brand px-5 py-2 text-sm hover:bg-[#f5f7ff] min-h-[44px]"
          >
            남은 단지 더 불러오기
          </button>
        </div>
      )}

      {/* 카드 클릭 → 원본 AptStat로 모달 재사용(§4-C).
          예산 하이라이트(§8 후속): 제출된 값 기준, budgetType이 "max"일 때만 예산 전달.
          min이거나 budget이 null이면 undefined(하이라이트 off). live 편집값이 아닌 lastSubmitted 사용. */}
      {selected && (
        <AptDetailModal
          apt={selected}
          onClose={() => setSelected(null)}
          lawdCd={lawdCd ?? ""}
          gu={gu}
          budgetMax={
            lastSubmitted?.budgetType === "max" && lastSubmitted?.budget != null
              ? lastSubmitted.budget
              : undefined
          }
        />
      )}
    </section>
  );
}
