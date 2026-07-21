// 대시보드 화면(SummaryCards·MonthlyChart·DealsTable·AptDetailModal)의 부분월·전세 모집단 공시 문구
// 단일 출처. 문구 변경은 승인 대기 중인 표시 기준 결정에 묶여 있다.
// 같은 주제(신고 지연·데이터 출처)의 공시 문단이 app/about/page.tsx, app/support/page.tsx,
// app/page.tsx 푸터에는 여전히 각 파일에 하드코딩돼 있어, 이 파일만 고치면 그 세 곳은 바뀌지 않는다.

/** 부분월 배지 텍스트(SummaryCards 요약 카드). */
export const REPORTING_IN_PROGRESS_BADGE = "신고 진행 중";

/**
 * 월별 추이 그래프 툴팁의 최신월 접미. 앞 공백·괄호를 포함한다.
 * 원본에서는 배지와 별개의 리터럴이었으나 여기서는 REPORTING_IN_PROGRESS_BADGE를 참조한다.
 * 배지 텍스트를 바꾸면 이 툴팁 접미도 함께 바뀐다.
 */
export const CHART_TOOLTIP_PARTIAL_SUFFIX = ` (${REPORTING_IN_PROGRESS_BADGE})`;

/**
 * 부분월 공시 본문(SummaryCards 하단 문단).
 * ymLabel은 SummaryCards가 summary.current_ym으로 만든 "YYYY.MM" 문자열.
 */
export const partialMonthNotice = (ymLabel: string): string =>
  `부동산 거래 신고는 계약일로부터 30일 이내에 하도록 되어 있습니다. 표시된 가장 최근 달(${ymLabel})은 이 신고 기한이 지나지 않은 기간이어서, 이후 다시 조회하면 이 달의 평균가가 달라질 수 있습니다. 위 변동률과 차액도 모두 이 달의 평균가를 기준으로 계산된 값입니다.`;

/**
 * 월별 추이 그래프 캡션(MonthlyChart 점선 범례 옆).
 * ymLabel은 MonthlyChart가 currentYm으로 만든 "YYYY.MM" 문자열.
 */
export const partialMonthChartCaption = (ymLabel: string): string =>
  `점선 구간은 신고 기한이 지나지 않은 달(${ymLabel})입니다.`;

/** 전세 집계 기준 공시 — SummaryCards(요약 카드·변동률·월별 추이 그래프를 덮는 문단). */
export const JEONSE_POPULATION_NOTICE_SUMMARY =
  "전세 평균가와 변동률·추이는 신규 계약 기준으로 집계되며, 갱신 계약은 평균에서 제외됩니다. 거래건수는 갱신을 포함한 전체 신고 건수여서 평균 계산에 쓰인 건수와 다를 수 있습니다. 이는 서비스 오류가 아니라 집계 기준의 차이입니다.";

/** 전세 집계 기준 공시 — DealsTable(아파트 목록 표 헤더 위). */
export const JEONSE_POPULATION_NOTICE_TABLE =
  "평균 전세가는 신규 계약만으로 집계되며, 거래건수는 갱신을 포함한 전체 신고 건수입니다. 두 값의 집계 대상이 달라 거래건수보다 적은 건이 평균에 쓰일 수 있습니다.";

/** 전세 집계 기준 공시 — AptDetailModal(평수별 표 아래). */
export const JEONSE_POPULATION_NOTICE_MODAL =
  "전세 평균가는 신규 계약 기준으로 집계되며, 갱신 계약은 평균에서 제외됩니다. 거래건수는 갱신을 포함한 전체 신고 건수입니다.";
