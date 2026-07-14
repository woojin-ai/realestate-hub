"use client";

import { useEffect, useRef } from "react";
import type { AptStat } from "@/lib/analyzer";
import { formatPrice } from "@/lib/analyzer";

interface AptDetailModalProps {
  apt: AptStat; // 표시할 단지(선택된 row). 부모가 selected !== null일 때만 마운트한다.
  onClose: () => void; // ✕ / 오버레이 바깥 / ESC에서 호출
}

export default function AptDetailModal({ apt, onClose }: AptDetailModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

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
                  return (
                    <tr key={s.range}>
                      <td className="sticky left-0 bg-white px-3 py-2 border-b border-gray-100 whitespace-nowrap">
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
      </div>
    </div>
  );
}
