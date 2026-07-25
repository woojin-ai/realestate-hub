import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase";
import { loadRankingMonthlyStats } from "@/lib/db-cache";
import { buildRankingDataset, getReferenceMonth, type RankingDataset } from "@/lib/ranking";
import { getMonthKey } from "@/lib/analyzer";
import { SITE_URL } from "@/lib/site";
import RankingBoard from "@/components/RankingBoard";

// 프리워밍이 하루 1회 주기이므로 6시간 캐시면 신선도가 충분하고, Supabase read가
// 방문당→주기당으로 수렴한다(기획 docs/planning/next-features-2026-07-17.md §1-3,
// 디자인 docs/design/ranking-board-spec-2026-07-17.md §3-7 권장 범위 1~6시간 중 상한 채택).
// Next 16: next.config.ts에 cacheComponents가 없어 이 프로젝트는 "Previous Model"이다 —
// route segment config `revalidate`가 그대로 유효하다(app/api/data/route.ts의 기존 주석,
// node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md 확인).
export const revalidate = 21600;

const TITLE = "전국 아파트 시세 랭킹";
const DESCRIPTION =
  "국토교통부 실거래가 공개시스템 공공데이터를 기반으로 전국 시·군·구 아파트 매매·전세 평균가, 전월 대비 변화율, 거래량을 비교한 랭킹입니다.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/ranking` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/ranking`,
    siteName: "부동산 실거래가 대시보드",
    locale: "ko_KR",
    type: "website",
  },
};

export default async function RankingPage() {
  let dataset: RankingDataset = { 매매: [], 전세: [] };
  let loadError = false;

  try {
    const supabase = getSupabaseServerClient();
    // 최근 약 3개월(+당월) 창 — 지역별 최신 2개 유효월을 안전히 포함(집계 지연 지역 대응).
    const sinceYm = getMonthKey(3);
    const rows = await loadRankingMonthlyStats(supabase, "아파트", sinceYm);
    dataset = buildRankingDataset(rows);
  } catch (err) {
    // /api/data와 동일한 방어 원칙: Supabase 연동 실패가 페이지 전체를 죽이지 않는다.
    // 빈 데이터셋 + loadError=true로 RankingBoard가 중립적인 안내 배너를 보여준다.
    console.error("[ranking] monthly_stats 조회 실패", err);
    loadError = true;
  }

  const referenceMonth = getReferenceMonth(dataset);
  const updatedAt = new Date().toISOString();

  return (
    <RankingBoard
      dataset={dataset}
      referenceMonth={referenceMonth}
      updatedAt={updatedAt}
      loadError={loadError}
    />
  );
}
