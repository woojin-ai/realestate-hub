"use client";

import { useState } from "react";
import RegionSelector from "@/components/RegionSelector";
import BuildingTypeToggle from "@/components/BuildingTypeToggle";
import DealTypeTabs from "@/components/DealTypeTabs";
import SummaryCards from "@/components/SummaryCards";
import MonthlyChart from "@/components/MonthlyChart";
import DealsTable from "@/components/DealsTable";
import type { BuildingType, DealType, DealsApiResponse, DealsApiError } from "@/lib/types";

type FetchStatus = "idle" | "loading" | "ready" | "error";

export default function DashboardPage() {
  const [sido, setSido] = useState("");
  const [gu, setGu] = useState("");
  const [lawdCd, setLawdCd] = useState<string | null>(null);
  const [buildingType, setBuildingType] = useState<BuildingType>("아파트");
  const [dealType, setDealType] = useState<DealType>("매매");

  const [status, setStatus] = useState<FetchStatus>("idle");
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

  const fetchData = async () => {
    if (!lawdCd) return;
    setStatus("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/data?lawd_cd=${lawdCd}&months=13&building_type=${buildingType}`
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
      <header className="bg-gradient-to-br from-brand-dark to-[#283593] text-white px-4 py-3 md:px-8 md:py-5 flex items-center gap-3">
        <span className="text-2xl md:text-3xl">🏘️</span>
        <div>
          <h1 className="text-base md:text-2xl font-bold">부동산 실거래가 대시보드</h1>
          <p className="text-xs md:text-sm opacity-80">
            국토교통부 공공데이터 기반 아파트·빌라·단독 실거래가 조회
          </p>
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

            <MonthlyChart monthly={summary?.monthly} dealType={dealType} />

            <DealsTable rows={rows} dealType={dealType} />
          </>
        )}
      </div>

      <footer className="text-center text-xs text-gray-400 py-6">
        데이터 출처: 국토교통부 실거래가 공개시스템(공공데이터포털)
      </footer>
    </>
  );
}
