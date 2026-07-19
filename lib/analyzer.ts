// 실거래가 통계 분석 모듈
// 원본: C:\bitcoin_vdcode\realestate\analyzer.py 포팅 (이번 라운드는 아파트 매매/전세만)
// 오피스텔/도시형 필터 키워드 리스트는 원본 그대로 이관(임의 축소 금지).

import type { MonthData, TradeRecord, RentRecord } from "./molit-api";
import { getKstYm } from "./kst";

type DealRecord = TradeRecord | RentRecord;

// ── 도시형 생활주택 / 오피스텔 / 소규모 필터 (전국 적용) ─────────────────
//
// [필터 전략 3단계]
// 1단계: 이름 키워드 (명시적 오피스텔/도시형 표현)
// 2단계: APT_FORCE_KEYWORDS → 이름 필터/면적 필터 모두 우회 (대형 브랜드 보호)
// 3단계: 면적 분포 자동 탐지 (buildAptStats에서 적용, FORCE 아닌 것만)
//   - 최대 면적 55㎡ 미만  → 소형 집합건물/오피스텔
//   - 평균 면적 38㎡ 미만  → 원룸/오피스텔 위주
//   - 55㎡ 미만 비율 85%↑ + 8건↑ → 도시형/오피스텔

export const NON_APT_KEYWORDS: string[] = [
  // 오피스텔 / 도시형 명시
  "오피스텔", "도시형", "생활주택", "원룸", "고시텔", "고시원",
  "레지던싱", "serviced", "서비스드",
  "스튜디오", "studio",
  // 비주거 / 상업 혼합
  "오피스", "비즈니스", "지식산업", "섹션", "상가",
  "모텔", "호텔", "펜션", "게스트하우스", "숙박",
  // 소형 명칭 패턴 (단독 끝 or 번호로 끝나는 소형 건물)
  // 주의: "빌1단지", "힐(1단지)" 같은 아파트 이름과 구별 필요
  "빌(",   // 빌(A동), 빌(연립) 등 - 괄호 직전 빌
  "빌)",   // 역방향 패턴
  "빌2",   // 빌2호, ○○빌2 (단, 빌2단지는 FORCE로 보호)
  "빌3",   // 빌3호, ○○빌3
  "힐(",   // 힐(연립), 힐(빌라) 등 - 단, 힐(1단지)는 FORCE에서 잡음
  "채(",   // 채(A), 채(B)
  "빌1호", "빌2호", "빌3호",  // 명시적 호수
  // 소규모 브랜드 (전국 공통 패턴)
  "솔하임", "위더스", "아르브", "헤센",
  "엘크루", "바비엥", "이지마루",
  "더시티", "아트테라스",
  "와이즈캐슬", "골드캐슬",
  "I-Class", "i-class",
  "팰리스A", "팰리스B", "팰리스C", "팰리스D",
  "블루카운티",
  "동광팰리스",       // 중구 소규모
  "인현상가",         // 상가 복합
  // 오피스텔 / 소규모 (직접 확인된 것)
  "시온캐슬",          // 오피스텔 (용산)
  "시티하우스",        // 빌딩/오피스텔 (용산)
  "이안용산프리미어",   // 오피스텔 (용산)
  "용산KCC웰츠타워",   // 오피스텔 (용산)
  "한남동리첸시아",    // 오피스텔 (용산)
  "리첸시아용산B",     // 오피스텔 (용산)
  "리첸시아용산",      // 오피스텔 계열 (용산)
  // 도시형 생활주택 / 소형 오피스텔 (중구 확인)
  "힐스테이트남산",    // 도시형 생활주택 (중구, max=47㎡)
  "세운푸르지오헤리시티", // 도시형 생활주택 (중구, avg=32㎡)
  "힐스테이트세운센트럴", // 도시형 생활주택 (중구, avg<50㎡)
  // 전국 캐시 검증으로 발견된 오피스텔/도시형
  "세이지움",          // 평균 20㎡ (개봉)
  "스마트시티",        // 평균 15~16㎡ (순천)
  "와이센트럴시티",    // 평균 20㎡ (서울)
  "페리스틸리움",      // 평균 24㎡ (강원)
  "센터스퀘어",        // 평균 21㎡ (서울)
  "금호윤성모닝타운",  // 평균 29㎡ (경남)
  "하트리움",          // 평균 19㎡ (서울) - 도시형
];

// 이름 패턴으로 소형 여부 판별하는 정규식 패턴
const SMALL_BRAND_RE =
  /^[A-Za-z가-힣]{1,4}\d{2,4}$|^[A-Za-z가-힣]+\s*\([A-Za-z]+\)$/;

// 반드시 아파트인 키워드 (NON_APT + 면적 필터 모두 우회)
export const APT_FORCE_KEYWORDS: string[] = [
  // 대형 브랜드
  "아이파크", "래미안", "자이", "푸르지오", "힐스테이트",
  "더샵", "롯데캐슬", "e편한세상", "sk뷰", "sk view", "포레나",
  "리슈빌", "리버파크", "리버힐", "리버뷰",
  "센트럴자이", "센트럴파크", "센트럴아이파크",
  "두산위브", "한화포레나", "호반베르디움", "디에이치",
  "오벨리스크", "트리마제", "아크로",
  // 중견 브랜드
  "한양아파트", "한양APT", "삼성래미안", "삼성사이버", "현대",
  "두산", "벽산", "우성", "한신",
  "LH", "SH", "임대", "공공",
  "주공", "시영", "시민", "국민",
  // 일반 단지 키워드
  "아파트", "단지", "타운",
  // 지역 대형 단지명
  "한가람", "강촌", "대림", "신동아", "동아",
  "남산타운", "브라운스톤",
  // 고급/대단지 (소형타입 거래 있어도 보호)
  "하이페리온", "타워팰리스", "목동트라팰리스", "파크원",
  // ── 1차 검증 ────────────────────────────────────────────────────────────
  "성원", "삼성", "부영", "대동", "삼익", "삼환", "극동", "동신", "청솔",
  "쌍용", "동부", "청구", "건영", "풍림", "동보", "한국", "럭키", "동남",
  "한성", "금호", "한일", "한양", "동원", "동성", "삼호", "시대", "롯데",
  "세종", "호반", "경남", "대원", "미성", "강변", "한진", "율곡", "우방",
  "태영", "SKVIEW", "장미", "산호", "광명", "신라", "우림", "세경", "우미",
  "홍익", "은아", "중앙", "상아", "신일",
  // ── 2차 검증 ────────────────────────────────────────────────────────────
  "대우", "태평", "삼일", "아주", "일신", "성일", "한빛", "무학", "엘지",
  "태산", "월드", "라인", "임광", "신한", "목련", "신성", "동광", "경동",
  "진로", "삼보", "효성", "신우", "미륭", "상록", "강남", "세원", "미주",
  "성호", "관악", "하나", "금광", "중흥", "신명", "선경", "화인", "일성",
  "초원", "금강", "서해",
  // ── 3차 검증 ────────────────────────────────────────────────────────────
  "보원", "서진", "텐즈힐", "주은", "우륵", "삼진", "한주", "진흥", "둥지",
  "녹원", "영남", "한울", "모아", "시범", "신안", "화승", "일동", "제일",
  "대명", "유승", "대주", "보람", "한솔", "목화", "서원", "우남", "두진",
  "성지", "삼부", "소라",
  // ── 4차 검증 (이름 2자이하 패턴 구제) ──────────────────────────────────────
  "향촌", "현광", "계룡", "아남", "수정", "누리", "덕현", "현진에버빌",
  "진우", "신화", "동진", "부강", "새한", "동양", "삼신", "보성", "한라",
  "가람", "갈마", "청호", "매화", "백합",
  // ── 5차 검증 (브랜드명 패턴 구제) ────────────────────────────────────────────
  "해맞이그린빌", "위례더힐", "대주파크빌", "뜨란채", "센트레빌",
  "호반리젠시빌", "그린빌", "칸타빌", "다운",
  // ── 6차 검증 ────────────────────────────────────────────────────────────
  "대영", "세림", "서광", "유원", "은마", "대진", "유천", "삼우", "청송",
  "금용", "성재",
  // ── 7차 검증 ────────────────────────────────────────────────────────────
  "테넌바움", "나래", "흥화", "염광", "이안", "동백", "거성", "요진", "우창",
  "동일", "대한", "한강", "이화", "동산", "영화", "양지", "한샘", "대화",
  "욱일", "윤성", "형석", "낙원", "서라", "사랑", "덕산", "문화", "에덴",
  "푸른", "석미", "본오", "우정", "공간", "신내", "덕성", "삼포",
  // ── 8차 검증 ────────────────────────────────────────────────────────────
  "SK", "원흥", "신선", "화목", "대경", "신원", "동문", "자유", "미도",
  "유성", "은하", "진주", "진도", "한효", "팬더", "봉우", "동서", "일송",
  "남양", "동방", "가야", "평화", "성도", "우신", "유호", "명지", "한숲",
  "명성", "영풍", "길훈", "행운", "대아", "정광", "성신",
  // ── 9차 검증 ────────────────────────────────────────────────────────────
  "화명리버빌",  // 40건 (화명리버빌2차 커버)
  "동양산우성스마트시티뷰",  // 36건 (공백없는 버전)
  "동양산 우성스마트시티 뷰",  // 36건 (공백있는 버전)
];

/**
 * 건물명으로 일반 아파트 단지 여부 판별 (전국 공통)
 * true  = 일반 아파트 단지 (포함)
 * false = 도시형 생활주택 / 오피스텔 등 (제외)
 */
export function isRealApartment(name: string): boolean {
  const nameS = name.trim();
  const nameLower = nameS.toLowerCase();

  // 1. NON_APT 길이 5+ 먼저 체크 (FORCE보다 구체적인 전체 이름 제외)
  //    예: "금호윤성모닝타운" → "금호" FORCE 매칭 전에 차단
  for (const kw of NON_APT_KEYWORDS) {
    if (kw.length >= 5 && nameLower.includes(kw.toLowerCase())) return false;
  }

  // 2. 강제 아파트 키워드 → 확인 (NON_APT 단문자 패턴보다 우선)
  //    예: "텐즈힐(1단지)" → "힐(" NON_APT보다 "텐즈힐" FORCE가 먼저 와야 함
  for (const kw of APT_FORCE_KEYWORDS) {
    if (nameLower.includes(kw.toLowerCase())) return true;
  }

  // 3. 나머지 NON_APT (단문자 패턴 등) → 제외
  for (const kw of NON_APT_KEYWORDS) {
    if (nameLower.includes(kw.toLowerCase())) return false;
  }

  // 4. 소형 브랜드 패턴 (DUO302, 위너빌(Winnervill) 등) → 제외
  if (SMALL_BRAND_RE.test(nameS)) return false;

  // 5. 이름에 "/" 포함 (상가/아파트 복합 패턴) → 제외
  if (nameS.includes("/")) return false;

  // 6. 이름이 2자 이하 → 제외 (FORCE에 없는 것만)
  if (nameS.length <= 2) return false;

  // 7. 순수 영문+숫자 8자 이하 → 제외
  if (/^[A-Za-z0-9\s\-.]+$/.test(nameS) && nameS.length <= 8) return false;

  return true;
}

function isForceApt(name: string): boolean {
  const nameLower = name.toLowerCase();
  return APT_FORCE_KEYWORDS.some((kw) => nameLower.includes(kw.toLowerCase()));
}

/**
 * 원본 analyzer.py get_month_key: offset개월 전 YYYYMM.
 *
 * 월 경계 계산은 getYmList(molit-api.ts)와 **같은 기준**(lib/kst.ts getKstYm, KST)을
 * 쓴다 — 이 함수가 만든 키로 buildSummary가 monthly(= getYmList가 수집한 달들)를
 * 조회하므로, 두 함수의 "이번 달"이 어긋나면 변동률이 엉뚱한 달을 가리킨다.
 *
 * getKstYm으로 옮기면서 기존 `setMonth(getMonth() - offset)` 방식의 말일 롤오버
 * 버그도 함께 해소됐다(2026-07-31에 offset=1 → 6월 31일이 7월 1일로 넘어가 `202607`
 * 반환 → "전월 대비"가 당월과 자기 자신을 비교해 0%로 표시되던 문제. 매월 29~31일 발생).
 */
export function getMonthKey(offset = 0): string {
  return getKstYm(offset);
}

export function avgTradePrice(records: TradeRecord[]): number | null {
  const prices = records.map((r) => r.price).filter((p) => p > 0);
  if (prices.length === 0) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

/**
 * only_new=true (기본): 신규 계약만 평균 (갱신 제외)
 * - contract_type == '갱신'인 건 제외
 * - contract_type이 비어있는 구형 데이터(또는 2021.6 이전)는 신규로 간주
 */
export function avgJeonseDeposit(
  records: RentRecord[],
  onlyNew = true
): number | null {
  const filtered = records.filter((r) => {
    if (!(r.deposit > 0)) return false;
    if (onlyNew && r.contract_type === "갱신") return false;
    return true;
  });
  if (filtered.length === 0) return null;
  return Math.round(
    filtered.reduce((a, r) => a + r.deposit, 0) / filtered.length
  );
}

export function pctChange(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

export type AllData = Record<string, MonthData>;

export interface MonthlyStat {
  avg: number | null;
  count: number;
}

export function buildMonthlyStats(
  allData: AllData,
  dealType: "매매" | "전세"
): Record<string, MonthlyStat> {
  const stats: Record<string, MonthlyStat> = {};
  for (const [ym, monthData] of Object.entries(allData)) {
    const records = monthData[dealType] as DealRecord[];
    const avg =
      dealType === "매매"
        ? avgTradePrice(records as TradeRecord[])
        : avgJeonseDeposit(records as RentRecord[]);
    stats[ym] = { avg, count: records.length };
  }
  return stats;
}

export interface DealTypeSummary {
  current_ym: string | null;
  current_avg: number | null;
  monthly: Record<string, MonthlyStat>;
  changes: { 전월: number | null; "3개월": number | null; "6개월": number | null; "1년": number | null };
  diffs: { 전월: number | null; "3개월": number | null; "6개월": number | null; "1년": number | null };
}

export type Summary = Record<"매매" | "전세", DealTypeSummary>;

export function buildSummary(allData: AllData): Summary {
  const result = {} as Summary;

  for (const dealType of ["매매", "전세"] as const) {
    const monthly = buildMonthlyStats(allData, dealType);
    const sortedYms = Object.keys(monthly).sort().reverse();

    const currentYm =
      sortedYms.find((ym) => monthly[ym].avg !== null) ?? null;
    const currentAvg = currentYm ? monthly[currentYm].avg : null;

    const getAvgAt = (offset: number): number | null => {
      const target = getMonthKey(offset);
      if (monthly[target] && monthly[target].avg !== null) {
        return monthly[target].avg;
      }
      const older = Object.keys(monthly)
        .sort()
        .filter((ym) => ym <= target && monthly[ym].avg !== null);
      return older.length > 0 ? monthly[older[older.length - 1]].avg : null;
    };

    const changes = {
      전월: pctChange(currentAvg, getAvgAt(1)),
      "3개월": pctChange(currentAvg, getAvgAt(3)),
      "6개월": pctChange(currentAvg, getAvgAt(6)),
      "1년": pctChange(currentAvg, getAvgAt(12)),
    };

    const priceDiff = (offset: number): number | null => {
      const past = getAvgAt(offset);
      return currentAvg !== null && past !== null ? currentAvg - past : null;
    };

    const diffs = {
      전월: priceDiff(1),
      "3개월": priceDiff(3),
      "6개월": priceDiff(6),
      "1년": priceDiff(12),
    };

    result[dealType] = {
      current_ym: currentYm,
      current_avg: currentAvg,
      monthly,
      changes,
      diffs,
    };
  }

  return result;
}

export interface AreaStat {
  range: string;
  repr_py: number;
  avg: number | null;
  count: number;
}

export interface AptStat {
  name: string;
  dong: string;
  build_year: string;
  avg_price: number | null;
  count: number;
  trade_count: number;
  latest_ym: string;
  mom_pct: number | null;
  mom_diff: number | null;
  area_stats: AreaStat[];
}

/** 건물별 평균가 집계 (연식, 평수별 상세 포함). 원본 analyzer.py build_apt_stats 포팅. */
export function buildAptStats(
  allData: AllData,
  dealType: "매매" | "전세",
  topN = 30
): AptStat[] {
  const nameRecords = new Map<string, (DealRecord & { ym: string })[]>();

  // ⚠️ 빌라/단독도 원본 analyzer.py build_apt_stats와 동일하게 아파트 이름필터
  //   (isRealApartment) + 면적필터(max<55㎡ 등)가 그대로 적용된다. 따라서 빌라/단독의
  //   건물별 표(DealsTable)는 상당수가 필터링되어 비어 보일 수 있다. 반면 요약카드/월별
  //   차트(buildSummary)는 이 필터를 적용하지 않으므로 정상 노출된다. 이는 원본과 동일한
  //   의도된 동작이며, 유형별 필터 분리는 추후 라운드에서 검토한다(이번 라운드 범위 밖).
  for (const [ym, monthData] of Object.entries(allData)) {
    const records = monthData[dealType] as DealRecord[];
    for (const record of records) {
      const key = record.name.trim();
      if (!key) continue;
      if (!isRealApartment(key)) continue;
      if (!nameRecords.has(key)) nameRecords.set(key, []);
      nameRecords.get(key)!.push({ ...record, ym });
    }
  }

  const result: AptStat[] = [];

  for (const [bname, records] of nameRecords.entries()) {
    const recentYms = Array.from(new Set(records.map((r) => r.ym)))
      .sort()
      .reverse()
      .slice(0, 3);
    const recent = records.filter((r) => recentYms.includes(r.ym));

    const avg =
      dealType === "매매"
        ? avgTradePrice(recent as TradeRecord[])
        : avgJeonseDeposit(recent as RentRecord[]);
    const dong = records[0]?.dong ?? "";

    const buildYears = records.map((r) => r.build_year).filter((v) => v);
    const buildYear = buildYears.length
      ? mostCommon(buildYears)
      : "";

    const prev1 = recentYms.length > 0 ? records.filter((r) => r.ym === recentYms[0]) : [];
    const prev2 = recentYms.length > 1 ? records.filter((r) => r.ym === recentYms[1]) : [];

    const avg1 =
      dealType === "매매"
        ? avgTradePrice(prev1 as TradeRecord[])
        : avgJeonseDeposit(prev1 as RentRecord[]);
    const avg2 =
      dealType === "매매"
        ? avgTradePrice(prev2 as TradeRecord[])
        : avgJeonseDeposit(prev2 as RentRecord[]);

    const momPct = pctChange(avg1, avg2);
    const momDiff = avg1 !== null && avg2 !== null ? avg1 - avg2 : null;

    // 평수별 집계
    const areaBuckets = new Map<number, DealRecord[]>();
    for (const r of records) {
      const area = r.area || 0;
      if (!area) continue;
      const pyeong = area / 3.3058;
      const bucket = Math.floor(pyeong / 10) * 10;
      if (!areaBuckets.has(bucket)) areaBuckets.set(bucket, []);
      areaBuckets.get(bucket)!.push(r);
    }

    const areaStats: AreaStat[] = Array.from(areaBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucket, bucketRecords]) => {
        const bAvg =
          dealType === "매매"
            ? avgTradePrice(bucketRecords as TradeRecord[])
            : avgJeonseDeposit(bucketRecords as RentRecord[]);
        const areasPy = bucketRecords
          .map((r) => (r.area ? r.area / 3.3058 : null))
          .filter((v): v is number => v !== null);
        const reprPy = areasPy.length
          ? Math.round((areasPy.reduce((a, b) => a + b, 0) / areasPy.length) * 10) / 10
          : bucket;
        const gongupBucket = Math.round((bucket * 1.28) / 5) * 5;
        const gongupBucketEnd = Math.round(((bucket + 10) * 1.28) / 5) * 5;
        return {
          range: `${gongupBucket}~${gongupBucketEnd}평`,
          repr_py: reprPy,
          avg: bAvg,
          count: bucketRecords.length,
        };
      });

    // ── 거래건수 기반 소규모 필터 ──────────────────────────────
    if (records.length <= 2) continue;
    const uniqueAreas = new Set(
      records
        .map((r) => (r.area > 0 ? Math.round(r.area / 3.3058) : null))
        .filter((v): v is number => v !== null)
    ).size;
    if (uniqueAreas <= 1 && records.length <= 5) continue;

    // ── 면적 분포 기반 오피스텔/도시형 자동 탐지 ───────
    // APT_FORCE_KEYWORDS 포함 단지는 면적 필터 우회
    if (!isForceApt(bname)) {
      const allAreas = records.map((r) => r.area || 0).filter((a) => a > 0);
      if (allAreas.length > 0) {
        const maxArea = Math.max(...allAreas);
        const meanArea = allAreas.reduce((a, b) => a + b, 0) / allAreas.length;
        if (maxArea < 55) continue;
        if (meanArea < 38) continue;
        const smallRatio =
          allAreas.filter((a) => a < 55).length / allAreas.length;
        if (smallRatio >= 0.85 && records.length >= 8) continue;
      }
    }

    result.push({
      name: bname,
      dong,
      build_year: buildYear,
      avg_price: avg,
      count: records.length,
      trade_count: records.length,
      latest_ym: recentYms[0] ?? "",
      mom_pct: momPct,
      mom_diff: momDiff,
      area_stats: areaStats,
    });
  }

  result.sort((a, b) => b.count - a.count);
  return result.slice(0, topN);
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts.entries()) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function formatPrice(wonMan: number | null): string {
  if (wonMan === null) return "-";
  const v = Math.trunc(wonMan);
  const eok = Math.floor(v / 10000);
  const man = v % 10000;
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억`;
  return `${man.toLocaleString()}만원`;
}

export function formatChange(
  pct: number | null,
  diff: number | null
): string {
  if (pct === null) return "데이터 없음";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "━";
  const sign = pct >= 0 ? "+" : "";
  let diffStr = "";
  if (diff !== null) {
    const diffSign = diff >= 0 ? "+" : "";
    diffStr = ` (${diffSign}${formatPrice(Math.abs(diff))})`;
  }
  return `${arrow} ${sign}${pct}%${diffStr}`;
}
