"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RegionSelector from "@/components/RegionSelector";
import BuildingTypeToggle from "@/components/BuildingTypeToggle";
import DealTypeTabs from "@/components/DealTypeTabs";
import SummaryCards from "@/components/SummaryCards";
import MonthlyChart from "@/components/MonthlyChart";
import DealsTable from "@/components/DealsTable";
import AiRecommendSection from "@/components/AiRecommendSection";
import { HeaderNavLinks } from "@/components/SiteHeader";
import { getRegionByLawdCd } from "@/lib/regions";
import type { BuildingType, DealType, DealsApiResponse, DealsApiError } from "@/lib/types";

type FetchStatus = "idle" | "loading" | "ready" | "error";

/**
 * ?lawd_cd= 쿼리스트링(랭킹 보드 /ranking의 딥링크, 2026-07-25 신규) 최초 진입값을 해석한다.
 * REGION_CODES에 실재하는 5자리 코드만 통과시키고, 미매칭/형식오류는 무시한다(오표기 방지).
 */
function resolveDeepLink(
  searchParams: URLSearchParams
): { lawdCd: string; sido: string; gu: string } | null {
  const code = searchParams.get("lawd_cd");
  if (!code || !/^\d{5}$/.test(code)) return null;
  const region = getRegionByLawdCd(code);
  if (!region) return null;
  return { lawdCd: code, sido: region.sido, gu: region.gu };
}

function DashboardContent() {
  const searchParams = useSearchParams();
  // 마운트 시 1회만 계산해 고정한다(세터를 쓰지 않는 지연 초기화) — 이후 searchParams가
  // 바뀌어도(예: 브라우저 뒤로/앞으로가기) 다시 반영하지 않는다. 딥링크는 "최초 진입 시
  // 초기값"이라는 계약이고, 그 다음은 이 페이지의 일반적인 수동 조회 흐름(조회하기 버튼)을
  // 그대로 따른다.
  const [initialDeepLink] = useState(() => resolveDeepLink(searchParams));

  const [sido, setSido] = useState(initialDeepLink?.sido ?? "");
  const [gu, setGu] = useState(initialDeepLink?.gu ?? "");
  const [lawdCd, setLawdCd] = useState<string | null>(initialDeepLink?.lawdCd ?? null);
  const [buildingType, setBuildingType] = useState<BuildingType>("아파트");
  const [dealType, setDealType] = useState<DealType>("매매");

  // 딥링크가 있으면 첫 렌더부터 "loading"으로 시작한다(초깃값으로만 반영 — setState 호출이
  // 아니다). react-hooks/set-state-in-effect가 이 프로젝트에서 error로 켜져 있어(아래 useEffect
  // 참고, components/AptDetailModal.tsx:156 동일 전례) effect 안에서 "loading"으로 동기
  // 전환하는 대신 이렇게 초깃값에서 흡수한다.
  const [status, setStatus] = useState<FetchStatus>(() =>
    initialDeepLink ? "loading" : "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<DealsApiResponse | null>(null);

  const handleRegionChange = (newSido: string, newGu: string, newLawdCd: string | null) => {
    setSido(newSido);
    setGu(newGu);
    setLawdCd(newLawdCd);
  };

  // 건물유형 변경 시 이전 조회결과가 오해를 주지 않도록 결과를 초기화한다.
  const handleBuildingTypeChange = (type: BuildingType) => {
    setBuildingType(type);
    setData(null);
    setStatus("idle");
    setErrorMessage(null);
  };

  // 현재 보는 유형 라벨 (아파트/빌라/단독 3종)
  const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
    아파트: "🏢 아파트",
    빌라: "🏘️ 빌라",
    단독: "🏠 단독",
  };

  // 실제 fetch 본체 — 첫 statement가 await라 동기 setState가 없다(react-hooks/set-state-in-effect
  // 대상 아님, AptDetailModal.tsx:168-184의 async IIFE와 동일 원칙). "조회하기" 버튼(fetchData)과
  // 딥링크 초기 조회(아래 useEffect) 양쪽이 이 함수 하나를 공유해 로직이 갈라지지 않는다.
  const runFetch = async (targetLawdCd: string, targetBuildingType: BuildingType) => {
    try {
      const res = await fetch(
        `/api/data?lawd_cd=${targetLawdCd}&months=13&building_type=${targetBuildingType}`
      );
      const json = (await res.json()) as DealsApiResponse | DealsApiError;

      if (!res.ok || "error" in json) {
        setErrorMessage("error" in json ? json.error : "알 수 없는 오류가 발생했습니다.");
        setStatus("error");
        return;
      }

      setData(json);
      setStatus("ready");
    } catch {
      setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setStatus("error");
    }
  };

  // "조회하기" 버튼 onClick 전용 — 이벤트 핸들러라 동기 setState("loading")를 바로 써도
  // react-hooks/set-state-in-effect 규칙 대상이 아니다(effect 본문에서만 금지).
  const fetchData = () => {
    if (!lawdCd) return;
    setStatus("loading");
    setErrorMessage(null);
    void runFetch(lawdCd, buildingType);
  };

  // 랭킹 보드(/ranking)에서 ?lawd_cd= 딥링크로 들어온 경우, 지역만 선택해 두고 사용자가
  // "조회하기"를 한 번 더 눌러야 한다면 딥링크의 가치가 반감된다(기획 §1-1 "각 행 클릭 →
  // 딥링크", 디자인 스펙 §8-2 "자동 선택·조회" 요건). "loading" 전환은 위 status 초깃값이
  // 이미 맡았다.
  // ⚠️ 이 프로젝트의 react-hooks/set-state-in-effect(error)는 effect가 이름 있는 함수
  // (runFetch)를 호출하는 것만으로도 "동기 setState 가능성"으로 잡는다(실측: runFetch(...)로
  // 위임했더니 그대로 재발). AptDetailModal.tsx:168-184처럼 async IIFE를 effect 안에 직접
  // 인라인해야 통과해, runFetch와 로직이 일부 겹치지만 그대로 따른다(버튼 경로는
  // fetchData→runFetch 그대로 재사용). 마운트 시 1회만 실행하고, 이후 lawdCd/buildingType이
  // 바뀌어도(사용자가 셀렉터만 조작한 경우) 재실행되면 안 되므로 의도적으로 빈 deps를 쓴다.
  useEffect(() => {
    if (!initialDeepLink) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/data?lawd_cd=${initialDeepLink.lawdCd}&months=13&building_type=${buildingType}`
        );
        const json = (await res.json()) as DealsApiResponse | DealsApiError;

        if (!res.ok || "error" in json) {
          setErrorMessage("error" in json ? json.error : "알 수 없는 오류가 발생했습니다.");
          setStatus("error");
          return;
        }

        setData(json);
        setStatus("ready");
      } catch {
        setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary[dealType];
  const rows = dealType === "매매" ? data?.aptStatsMaeMae : data?.aptStatsJeonse;

  // 조회 결과가 사실상 비어있는지 판별.
  // (빌라·단독은 현재 국토부 추가 서비스 승인 대기로 403이 나서 summary가 전부 빈 값으로 옴)
  // 조건: 매매·전세 양쪽 모두 current_avg === null 이고, monthly의 모든 count 합이 0.
  // 아파트 등 정상 데이터에는 절대 걸리지 않도록(오탐 금지) 두 조건을 모두 요구한다.
  const isEmptyResult =
    status === "ready" &&
    data !== null &&
    data.summary["매매"].current_avg === null &&
    data.summary["전세"].current_avg === null &&
    (["매매", "전세"] as const).every((dt) =>
      Object.values(data.summary[dt].monthly).every((m) => m.count === 0)
    );

  return (
    <>
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-dark to-[#283593] text-white px-4 py-3 md:px-8 md:py-5">
        <div className="hidden md:block absolute inset-y-0 right-0 w-[46%] lg:w-[40%] pointer-events-none">
          <Image
            src="/images/hero-illustration.png"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 46vw, 40vw"
            className="object-cover object-left opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-dark via-brand-dark/70 to-transparent" />
        </div>
        {/* 내비게이션 메뉴(블로그/소개/문의하기)를 기존 히어로 배너 안에 통합(2026-07-18).
            데스크톱: 타이틀 아래 별도 줄. 히어로 일러스트는 우측 46%/40%에만 있어 겹치지 않음. */}
        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl md:text-3xl">🏘️</span>
            <div>
              <h1 className="text-base md:text-2xl font-bold">부동산 실거래가 대시보드</h1>
              <p className="text-xs md:text-sm opacity-80">
                국토교통부 공공데이터 기반 아파트 실거래가 조회 (빌라·단독 조회 준비 중)
              </p>
            </div>
          </div>
          <HeaderNavLinks />
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-4 py-5 md:px-5 flex-1 w-full">
        <section className="bg-white rounded-xl shadow-sm p-4 md:p-5 mb-5">
          <RegionSelector sido={sido} gu={gu} onChange={handleRegionChange} />
          <BuildingTypeToggle value={buildingType} onChange={handleBuildingTypeChange} />
          <button
            type="button"
            disabled={!lawdCd || status === "loading"}
            onClick={fetchData}
            className="w-full md:w-auto mt-3 rounded-lg bg-brand px-7 py-2.5 text-sm text-white
              hover:bg-[#303f9f] disabled:bg-gray-400 disabled:cursor-not-allowed min-h-[44px]"
          >
            {status === "loading" ? "조회 중..." : "조회하기"}
          </button>
          {data && (
            <p className="mt-2 text-xs text-gray-400">
              마지막 업데이트: {new Date(data.updatedAt).toLocaleString("ko-KR")}
            </p>
          )}
        </section>

        {status === "loading" && (
          <div className="bg-[#f5f7ff] border border-[#dde1f5] rounded-lg px-4 py-3 mb-4 flex items-center gap-3 text-sm text-brand">
            <span className="inline-block h-4 w-4 rounded-full border-2 border-brand border-t-transparent animate-spin" />
            <span>최근 13개월치 실거래가를 국토교통부에서 조회하고 있습니다...</span>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="bg-[#fce4ec] border border-[#f8bbd0] rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3 text-sm text-[#c62828]">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={fetchData}
              className="shrink-0 rounded-md border border-[#c62828] px-3 py-1.5 text-xs hover:bg-[#f8bbd0]"
            >
              다시 시도
            </button>
          </div>
        )}

        {status === "ready" && data && (
          <p className="text-sm text-gray-500 mb-4">
            현재 보는 유형: {BUILDING_TYPE_LABEL[buildingType]}
          </p>
        )}

        {isEmptyResult ? (
          // 데이터 없음: 빈 대시보드를 버그로 오해하지 않도록 중립 정보 배너를 표시한다.
          <div className="bg-[#f5f7ff] border border-[#dde1f5] rounded-lg px-4 py-3 mb-4 text-sm text-gray-600">
            선택하신 지역·유형의 실거래 데이터가 조회되지 않았습니다. 빌라·단독은 현재 국토부
            실거래가 추가 서비스 승인 대기 중이라 조회가 제한될 수 있습니다.
          </div>
        ) : (
          <>
            <DealTypeTabs value={dealType} onChange={setDealType} />

            <SummaryCards summary={summary} dealType={dealType} />

            <MonthlyChart monthly={summary?.monthly} dealType={dealType} currentYm={summary?.current_ym ?? null} />

            <DealsTable rows={rows} dealType={dealType} lawdCd={lawdCd} gu={gu} />

            <AiRecommendSection
              lawdCd={lawdCd}
              gu={gu}
              dealType={dealType}
              rows={rows}
              buildingType={buildingType}
            />
          </>
        )}
      </div>

      <footer className="text-center text-xs text-gray-400 py-6">
        <p>데이터 출처: 국토교통부 실거래가 공개시스템(공공데이터포털)</p>
        <nav className="mt-2 flex items-center justify-center gap-3">
          <Link href="/privacy" className="hover:text-gray-600 hover:underline">
            개인정보처리방침
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-gray-600 hover:underline">
            이용약관
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/about" className="hover:text-gray-600 hover:underline">
            소개
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/support" className="hover:text-gray-600 hover:underline">
            문의하기
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/blog" className="hover:text-gray-600 hover:underline">
            부동산 정보
          </Link>
        </nav>
      </footer>
    </>
  );
}

/** DashboardContent가 하이드레이션되기 전 초기 HTML에 보일 최소 자리표시자. */
function DashboardFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <span
        className="inline-block h-6 w-6 rounded-full border-2 border-brand border-t-transparent animate-spin"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * DashboardContent가 useSearchParams()를 쓰므로(랭킹 보드 딥링크, 2026-07-25) 정적 빌드 시
 * "Missing Suspense boundary with useSearchParams" 오류를 피하려면 가장 가까운 상위에 Suspense
 * 경계가 있어야 한다(node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * use-search-params.md "Prerendering" 절 권장 패턴 그대로 — 개발 모드는 온디맨드 렌더라
 * suspend되지 않지만, 프로덕션 빌드의 정적 페이지는 반드시 필요하다).
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
