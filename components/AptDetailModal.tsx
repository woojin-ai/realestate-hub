"use client";

import { useEffect, useRef, useState } from "react";
import type { AptStat } from "@/lib/analyzer";
import { formatPrice } from "@/lib/analyzer";

interface AptDetailModalProps {
  apt: AptStat; // 표시할 단지(선택된 row). 부모가 selected !== null일 때만 마운트한다.
  onClose: () => void; // ✕ / 오버레이 바깥 / ESC에서 호출
  /**
   * 예산(만원, `area_stats[].avg`와 동일 단위). 있으면 `avg <= budgetMax`인 평형 행을
   * "예산 이하"로 하이라이트한다. 없으면(대시보드 DealsTable 경로) 하이라이트 없이 기존과 동일 렌더.
   */
  budgetMax?: number;
  /**
   * 시군구코드 5자리·행정구명 — 위치 섹션(/api/apt-location) 조회 자연키(design §14).
   * 값이 없으면(빈 문자열) 위치 섹션은 크래시 없이 "위치 정보 없음"으로 폴백한다.
   */
  lawdCd: string;
  gu: string;
}

// 위치 섹션(design §10·§13) 독립 로딩 상태 + 응답 계약(design §14-2).
type LocState = "loading" | "ok" | "empty" | "error";
interface LocationData {
  found: boolean;
  lat: number | null;
  lng: number | null;
  subway_name: string;
  subway_dist: number;
}

// 단지정보 섹션(design §11·§13) 독립 로딩 상태 + 응답 계약(design §14-2).
type InfoState = "loading" | "ok" | "empty" | "error";
interface InfoData {
  found: boolean;
  households: number | null;
  buildings: number | null;
  hallway: string | null;
  heating: string | null;
  park_total: number | null;
  addr: string | null;
  far_ratio: string | null;
  cov_ratio: string | null;
  elev_pass: number | null;
  elev_per_hh: number | null;
  park_above: number | null;
  park_under: number | null;
}

// 주변시설 섹션(design §12·§13) 독립 로딩 상태 + 응답 계약(design §14-2 C행).
type NearbyState = "loading" | "ok" | "empty" | "error";
interface SchoolEntry {
  name: string;
  distance: number;
}
interface NearbyData {
  elementary: SchoolEntry[];
  middle: SchoolEntry[];
  high: SchoolEntry[];
}

export default function AptDetailModal({
  apt,
  onClose,
  budgetMax,
  lawdCd,
  gu,
}: AptDetailModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // ── 위치 섹션: 모달 열릴 때 lazy fetch(닫히면 부모 언마운트로 상태 리셋) ──────────
  const [locState, setLocState] = useState<LocState>("loading");
  const [loc, setLoc] = useState<LocationData | null>(null);
  const [locReloadKey, setLocReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      lawd_cd: lawdCd,
      gu,
      name: apt.name,
      dong: apt.dong ?? "",
    });
    (async () => {
      try {
        const res = await fetch(`/api/apt-location?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as LocationData;
        const hasSubway = json.subway_name !== "-" && json.subway_dist < 9999;
        const hasCoord = json.lat != null && json.lng != null;
        setLoc(json);
        // 좌표·지하철 모두 미확인이면 빈 상태(자리 유지). 하나라도 있으면 ok.
        setLocState(hasCoord || hasSubway ? "ok" : "empty");
      } catch {
        if (controller.signal.aborted) return; // 언마운트/재요청으로 중단된 경우 무시
        setLocState("error");
      }
    })();
    return () => controller.abort();
    // locReloadKey 변경(=[다시 시도])마다 재fetch. loading 표시는 재시도 핸들러에서 선반영.
  }, [lawdCd, gu, apt.name, apt.dong, locReloadKey]);

  const retryLocation = () => {
    setLoc(null);
    setLocState("loading");
    setLocReloadKey((k) => k + 1);
  };

  // ── 단지정보 섹션: 위치와 독립된 병렬 lazy fetch(하나 느려도/실패해도 서로 렌더 안 막음) ──
  const [infoState, setInfoState] = useState<InfoState>("loading");
  const [info, setInfo] = useState<InfoData | null>(null);
  const [infoReloadKey, setInfoReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      lawd_cd: lawdCd,
      gu,
      name: apt.name,
      dong: apt.dong ?? "",
    });
    (async () => {
      try {
        const res = await fetch(`/api/apt-info?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as InfoData;
        // found:false 또는 모든 표시 필드 null이면 빈 상태(자리 유지). 하나라도 있으면 ok.
        const hasAny =
          json.found &&
          (json.households != null ||
            json.buildings != null ||
            json.hallway != null ||
            json.heating != null ||
            json.park_total != null ||
            json.addr != null ||
            json.elev_pass != null ||
            json.elev_per_hh != null ||
            json.far_ratio != null ||
            json.cov_ratio != null);
        setInfo(json);
        setInfoState(hasAny ? "ok" : "empty");
      } catch {
        if (controller.signal.aborted) return; // 언마운트/재요청으로 중단된 경우 무시
        setInfoState("error");
      }
    })();
    return () => controller.abort();
  }, [lawdCd, gu, apt.name, apt.dong, infoReloadKey]);

  const retryInfo = () => {
    setInfo(null);
    setInfoState("loading");
    setInfoReloadKey((k) => k + 1);
  };

  // ── 주변시설 섹션: 위치/단지정보와 독립된 병렬 lazy fetch(하나 느려도/실패해도 서로 렌더 안 막음) ──
  const [nearbyState, setNearbyState] = useState<NearbyState>("loading");
  const [nearby, setNearby] = useState<NearbyData | null>(null);
  const [nearbyReloadKey, setNearbyReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      lawd_cd: lawdCd,
      gu,
      name: apt.name,
      dong: apt.dong ?? "",
    });
    (async () => {
      try {
        const res = await fetch(`/api/apt-nearby?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as NearbyData;
        // 세 급 모두 0개면 빈 상태. 하나라도 있으면 ok(없는 급은 "반경 1km 내 없음"으로 표기).
        const hasAny =
          (json.elementary?.length ?? 0) > 0 ||
          (json.middle?.length ?? 0) > 0 ||
          (json.high?.length ?? 0) > 0;
        setNearby(json);
        setNearbyState(hasAny ? "ok" : "empty");
      } catch {
        if (controller.signal.aborted) return; // 언마운트/재요청으로 중단된 경우 무시
        setNearbyState("error");
      }
    })();
    return () => controller.abort();
  }, [lawdCd, gu, apt.name, apt.dong, nearbyReloadKey]);

  const retryNearby = () => {
    setNearby(null);
    setNearbyState("loading");
    setNearbyReloadKey((k) => k + 1);
  };

  // ESC 닫기 + 스크롤 락 + 포커스 이동/복귀 (mount/unmount 생명주기에 묶음)
  useEffect(() => {
    // 열기 직전 포커스(트리거였던 건물명 버튼)를 저장해 닫을 때 복귀
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    // 배경 대시보드 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // 모달 열릴 때 ✕ 버튼으로 초기 포커스
    closeBtnRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const titleId = "apt-detail-modal-title";
  const currentYear = new Date().getFullYear();

  // meta 라인 구성: 존재하는 항목만 ` · `(가운뎃점)으로 연결
  const metaParts: string[] = [];
  if (apt.build_year) {
    metaParts.push(`${apt.build_year}년 준공`);
    metaParts.push(`${currentYear - Number(apt.build_year)}년차`);
  }
  if (apt.dong) metaParts.push(apt.dong);
  metaParts.push(`전체 ${apt.count}건`);
  metaParts.push(`평균 ${formatPrice(apt.avg_price)}`);

  // 비율 계산 근거:
  // - 표기 퍼센트(pct)는 "전체 area_stats count 합(total)" 기준 점유율(의미상).
  // - 막대 폭(barW)은 원본과 동일하게 "최댓값(maxCount)" 기준 정규화(시각 대비용).
  const total = apt.area_stats.reduce((a, s) => a + s.count, 0);
  const maxCount = Math.max(...apt.area_stats.map((s) => s.count), 1);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 오버레이 바깥(=오버레이 자기 자신) 클릭만 닫기, 모달 내부 클릭은 무시
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-2xl w-[calc(100%-2rem)] max-w-[560px] max-h-[85vh] md:max-h-[80vh] overflow-y-auto relative p-4 md:p-7"
      >
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute top-2.5 right-2.5 w-11 h-11 flex items-center justify-center text-2xl text-gray-400 hover:text-gray-600 leading-none"
        >
          ✕
        </button>

        {/* 헤더: 타이틀 + meta */}
        <h2 id={titleId} className="text-lg font-bold text-brand-dark mb-1 pr-10">
          🏢 {apt.name} — 평수별 실거래가
        </h2>
        <p className="text-xs text-gray-500 mb-3">{metaParts.join(" · ")}</p>

        {/* 평수별 표: 가로 스크롤 유지 + 첫 컬럼 sticky (방식 A) */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-xs md:text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0]">
                  평수 구간
                </th>
                <th className="sticky top-0 z-10 bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0] whitespace-nowrap">
                  전용/공급
                </th>
                <th className="sticky top-0 z-10 bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0] whitespace-nowrap">
                  평균가
                </th>
                <th className="sticky top-0 z-10 bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0] whitespace-nowrap">
                  거래건수
                </th>
                <th className="sticky top-0 z-10 bg-[#f5f7ff] px-3 py-2 text-left text-gray-600 border-b-2 border-[#e0e4f0]">
                  비율
                </th>
              </tr>
            </thead>
            <tbody>
              {apt.area_stats.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-5">
                    평수별 실거래 데이터가 없습니다
                  </td>
                </tr>
              ) : (
                apt.area_stats.map((s) => {
                  // 컬럼 2: repr_py 기반 대표 공급/전용 포인트값 (range 재출력 아님)
                  const gongup = Math.round(s.repr_py * 1.28);
                  const jeonyong = Math.round(s.repr_py);
                  // 컬럼 5: 퍼센트(total 기준) / 막대 폭(maxCount 기준)
                  const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  const barW = Math.round((s.count / maxCount) * 100);
                  // 예산 이하 하이라이트(§8 후속): budgetMax 있으면 avg ≤ budgetMax 행을 강조.
                  const underBudget =
                    budgetMax != null && s.avg != null && s.avg <= budgetMax;
                  return (
                    <tr key={s.range} className={underBudget ? "bg-[#e8f5e9]" : undefined}>
                      <td
                        className={`sticky left-0 ${
                          underBudget ? "bg-[#e8f5e9]" : "bg-white"
                        } px-3 py-2 border-b border-gray-100 whitespace-nowrap`}
                      >
                        {s.range}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                        <span className="font-semibold text-gray-800">{gongup}평</span>{" "}
                        <span className="text-gray-400 text-[0.78rem]">
                          (전용{jeonyong}평)
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap font-semibold">
                        {formatPrice(s.avg)}
                        {underBudget && (
                          <span className="text-[0.7rem] text-[#2e7d32] bg-[#e8f5e9] border border-[#a5d6a7] rounded px-1.5 py-0.5 ml-1 whitespace-nowrap">
                            예산 이하
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                        {s.count}건
                      </td>
                      <td className="px-3 py-2 border-b border-gray-100">
                        <span className="text-[0.78rem] text-gray-500">{pct}%</span>
                        <span
                          aria-hidden="true"
                          className="block bg-[#eef] rounded h-1.5 min-w-[60px] mt-1"
                        >
                          <span
                            className="block bg-brand h-1.5 rounded"
                            style={{ width: `${barW}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 구분선 + 위치 섹션(design §9·§10·§13). 평수별 표 아래에 추가. */}
        <hr className="my-4 border-t border-gray-100" />
        <section aria-live="polite">
          <h3 className="text-sm font-bold text-brand-dark mb-2 flex items-center gap-1.5">
            <span aria-hidden="true">📍</span> 위치
          </h3>

          {locState === "loading" && (
            <div>
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <span className="sr-only">위치 정보 불러오는 중</span>
            </div>
          )}

          {locState === "error" && (
            <p className="text-sm text-gray-500">
              위치 정보를 불러오지 못했습니다{" "}
              <button
                type="button"
                onClick={retryLocation}
                className="text-brand underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded"
              >
                다시 시도
              </button>
            </p>
          )}

          {locState === "empty" && (
            <p className="text-sm text-gray-500">위치 정보를 찾을 수 없습니다</p>
          )}

          {locState === "ok" && loc && (
            <div className="text-sm space-y-1">
              {/* 지하철 줄 */}
              {loc.subway_name !== "-" && loc.subway_dist < 9999 ? (
                <p className="flex items-center gap-1.5 text-gray-800">
                  <span aria-hidden="true">🚇</span>
                  {loc.subway_name} · 도보{" "}
                  <span className="text-xs text-brand bg-[#eef] rounded px-1.5 py-0.5">
                    {loc.subway_dist}m
                  </span>
                </p>
              ) : (
                <p className="text-gray-500">지하철 정보 없음</p>
              )}

              {/* 좌표 줄(좌표 있을 때만) + 카카오맵 링크 */}
              {loc.lat != null && loc.lng != null && (
                <p className="text-xs text-gray-500">
                  좌표 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}{" "}
                  <a
                    href={`https://map.kakao.com/link/map/${encodeURIComponent(
                      apt.name
                    )},${loc.lat},${loc.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${apt.name} 위치 카카오맵에서 새 탭으로 열기`}
                    className="text-brand underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded"
                  >
                    지도에서 보기 ↗
                  </a>
                </p>
              )}
            </div>
          )}
        </section>

        {/* 구분선 + 단지정보 섹션(design §11·§13). 위치 섹션 아래에 추가. */}
        <hr className="my-4 border-t border-gray-100" />
        <section aria-live="polite">
          <h3 className="text-sm font-bold text-brand-dark mb-2 flex items-center gap-1.5">
            <span aria-hidden="true">🏘</span> 단지 정보
          </h3>

          {infoState === "loading" && (
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
              <span className="sr-only">단지 정보 불러오는 중</span>
            </div>
          )}

          {infoState === "error" && (
            <p className="text-sm text-gray-500">
              단지 정보를 불러오지 못했습니다{" "}
              <button
                type="button"
                onClick={retryInfo}
                className="text-brand underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded"
              >
                다시 시도
              </button>
            </p>
          )}

          {infoState === "empty" && (
            <p className="text-sm text-gray-500">
              단지 상세 정보가 등록되어 있지 않습니다
            </p>
          )}

          {infoState === "ok" && info && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {/* MVP6: null 필드는 쌍 자체를 렌더하지 않음(빈 라벨 금지) */}
              {info.households != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">세대수</dt>
                  <dd className="font-medium text-gray-800">
                    {info.households.toLocaleString()}세대
                  </dd>
                </div>
              )}
              {info.buildings != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">동수</dt>
                  <dd className="font-medium text-gray-800">{info.buildings}개동</dd>
                </div>
              )}
              {info.hallway != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">복도</dt>
                  <dd className="font-medium text-gray-800">{info.hallway}</dd>
                </div>
              )}
              {info.heating != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">난방</dt>
                  <dd className="font-medium text-gray-800">{info.heating}</dd>
                </div>
              )}
              {info.park_total != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">총주차</dt>
                  <dd className="font-medium text-gray-800">
                    {info.park_total.toLocaleString()}대
                  </dd>
                </div>
              )}
              {/* 후순위: 값 있을 때만 행 추가(이번 Stage far/cov는 항상 null이라 자동 숨김) */}
              {info.elev_pass != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">승강기</dt>
                  <dd className="font-medium text-gray-800">{info.elev_pass}대</dd>
                </div>
              )}
              {info.elev_per_hh != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">세대당</dt>
                  <dd className="font-medium text-gray-800">{info.elev_per_hh}대</dd>
                </div>
              )}
              {info.far_ratio != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">용적률</dt>
                  <dd className="font-medium text-gray-800">{info.far_ratio}%</dd>
                </div>
              )}
              {info.cov_ratio != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 shrink-0 w-16">건폐율</dt>
                  <dd className="font-medium text-gray-800">{info.cov_ratio}%</dd>
                </div>
              )}
              {/* 주소는 값이 길어 전체폭(sm:col-span-2) */}
              {info.addr != null && (
                <div className="flex gap-2 sm:col-span-2">
                  <dt className="text-gray-500 shrink-0 w-16">주소</dt>
                  <dd className="font-medium text-gray-800">{info.addr}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        {/* 구분선 + 주변시설 섹션(design §12·§13). 단지정보 섹션 아래에 추가. MVP=학교(초/중/고)만. */}
        <hr className="my-4 border-t border-gray-100" />
        <section aria-live="polite">
          <h3 className="text-sm font-bold text-brand-dark mb-2 flex items-center gap-1.5">
            <span aria-hidden="true">🏫</span> 주변 시설
          </h3>

          {nearbyState === "loading" && (
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
              <span className="sr-only">주변 시설 불러오는 중</span>
            </div>
          )}

          {nearbyState === "error" && (
            <p className="text-sm text-gray-500">
              주변 시설을 불러오지 못했습니다{" "}
              <button
                type="button"
                onClick={retryNearby}
                className="text-brand underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded"
              >
                다시 시도
              </button>
            </p>
          )}

          {nearbyState === "empty" && (
            <p className="text-sm text-gray-500">
              반경 1km 내 학교 정보가 없습니다
            </p>
          )}

          {nearbyState === "ok" && nearby && (
            <ul>
              {(
                [
                  ["초", nearby.elementary],
                  ["중", nearby.middle],
                  ["고", nearby.high],
                ] as const
              ).map(([badge, list]) => {
                const nearest = list && list.length > 0 ? list[0] : null;
                return (
                  <li
                    key={badge}
                    className="flex items-center gap-2 py-1 text-sm"
                  >
                    <span className="text-[0.7rem] font-bold text-brand bg-[#eef] rounded px-1.5 py-0.5 shrink-0">
                      {badge}
                    </span>
                    {nearest ? (
                      <>
                        <span className="flex-1 truncate text-gray-800">
                          {nearest.name}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {nearest.distance}m
                        </span>
                      </>
                    ) : (
                      <span className="flex-1 text-gray-500">
                        반경 1km 내 없음
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
