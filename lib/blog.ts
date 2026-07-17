// 블로그 데이터 모델
// 근거: docs/planning/content-strategy.md §2(카테고리 구조)·§5(MVP=guide 로드맵),
//       docs/design/blog.md(화면 구성안), 계산기 허브(C:\claude code webside\lib\blog.ts) 패턴 참고.
//
// 본문은 마크다운 문자열이 아니라 구조화된 섹션 배열(discriminated union)로 표현한다.
// 렌더가 순수 switch/map 매핑이 되어 마크다운 파서·dangerouslySetInnerHTML이 필요 없고 XSS 위험이 없다.
// (계산기 허브 lib/blog.ts와 동일한 설계 원칙)

/** 4개 카테고리 유니온. MVP는 guide만 실제 글을 보유하고 나머지는 향후 확장(2차 howto, 3차 insight, 4차 market). */
export type BlogCategory = "guide" | "insight" | "howto" | "market";

/** 카테고리 표시명 (브레드크럼·필터 탭 라벨). docs/design/blog.md §6 "guide 브레드크럼 표시명 = 용어·제도" 반영 */
export const BLOG_CATEGORY_LABEL: Record<BlogCategory, string> = {
  guide: "용어·제도",
  insight: "지역별 인사이트",
  howto: "활용법",
  market: "월간 시황",
};

/** 카테고리 배지 색상 (docs/design/blog.md §4 팔레트 그대로). 브랜드/상승/하락/재건축 경고 색과 겹치지 않는 4색. */
export const BLOG_CATEGORY_BADGE: Record<BlogCategory, { text: string; bg: string }> = {
  guide: { text: "#3f51b5", bg: "#e8eaf6" },
  insight: { text: "#00897b", bg: "#e0f2f1" },
  howto: { text: "#f57f17", bg: "#fff8e1" },
  market: { text: "#6a1b9a", bg: "#f3e5f5" },
};

/** 본문 한 블록. type으로 구분되는 discriminated union. */
export type BlogSection =
  | { type: "paragraph"; text: string } // 문단(플레인 텍스트)
  | { type: "heading"; text: string } // <h2> 소제목
  | { type: "list"; ordered?: boolean; items: string[] } // ul/ol
  | { type: "callout"; variant: "info" | "warning"; text: string } // 면책/안내 박스 (docs/design/blog.md §3)
  | { type: "sourceNote"; asOfDate: string }; // 데이터 출처·기준일 캡션 (docs/design/blog.md §5). guide 글은 보통 미사용.

export interface BlogPost {
  /** URL 마지막 세그먼트. 영문 소문자-하이픈 */
  slug: string;
  /** H1 + <title> 기반 문구 */
  title: string;
  /** 4개 카테고리 중 하나 */
  category: BlogCategory;
  /** 발행일. ISO 날짜 문자열 "YYYY-MM-DD" */
  publishedAt: string;
  /** 목록 카드 요약(2줄 이내) + meta description에 재사용 */
  summary: string;
  /** 본문. 위에서 아래로 렌더. 관례상 [0]=도입부 문단, [1]=면책 콜아웃(도입부 직후) */
  body: BlogSection[];
}

const DISCLAIMER =
  "이 글은 일반적인 정보 제공을 목적으로 하며, 투자 자문이나 법률 자문이 아닙니다. 매수·매도 등 의사결정과 관련된 사항은 관련 법령 원문, 국토교통부 실거래가 공개시스템 원자료, 전문가 확인을 함께 거치시기 바랍니다.";

export const blogPosts: BlogPost[] = [
  {
    slug: "real-price-report-deadline-guide",
    title: "실거래가 신고, 계약일로부터 며칠 안에 해야 할까 — 최근 달 데이터가 적어 보이는 이유",
    category: "guide",
    publishedAt: "2026-07-17",
    summary:
      "실거래가 신고 기한이 어떻게 되어 있는지, 그리고 이 대시보드에서 가장 최근 달 데이터가 유독 적어 보이는 이유를 정리했습니다.",
    body: [
      {
        type: "paragraph",
        text: "이 대시보드에서 최근 1~2개월 데이터를 조회하면 다른 달보다 거래 건수가 유독 적게 나오는 경우가 많습니다. 서비스 오류처럼 보일 수 있지만, 실제로는 부동산 실거래가 신고 제도의 구조 때문에 생기는 자연스러운 현상입니다. 신고 기한이 어떻게 정해져 있고, 그로 인해 데이터가 어떤 순서로 채워지는지 정리했습니다.",
      },
      {
        type: "callout",
        variant: "warning",
        text: DISCLAIMER,
      },
      {
        type: "heading",
        text: "실거래가 신고 기한은 계약체결일로부터 30일 이내",
      },
      {
        type: "paragraph",
        text: "부동산 거래신고 제도에 따르면 매수인과 매도인, 또는 거래를 중개한 공인중개사는 매매계약을 체결한 날로부터 30일 이내에 실거래가를 신고해야 합니다. 전월세(임대차) 거래도 마찬가지로 계약체결일로부터 30일 이내 신고가 원칙입니다. 이렇게 신고된 내용이 국토교통부 실거래가 공개시스템에 모여 공개되며, 이 대시보드가 보여주는 데이터의 원천이기도 합니다.",
      },
      {
        type: "heading",
        text: "그래서 최근 달 데이터가 적어 보인다",
      },
      {
        type: "paragraph",
        text: "예를 들어 이번 달 20일에 계약한 거래는 다음 달 중순까지 신고해도 법적으로 문제가 없습니다. 계약일과 신고일 사이에 최대 한 달 가까운 시차가 생길 수 있다는 뜻입니다. 그 결과 이번 달이나 지난달처럼 최근 기간의 거래는 아직 신고 절차가 진행 중인 건이 섞여 있어, 시간이 더 지난 달보다 통계에 반영된 건수가 적게 나타납니다. 실제 거래가 없었던 것이 아니라 아직 시스템에 반영되지 않은 것뿐입니다.",
      },
      {
        type: "heading",
        text: "신고 이후에도 정정·취소가 있을 수 있다",
      },
      {
        type: "paragraph",
        text: "신고를 마친 거래라도 이후 계약 내용이 바뀌거나 계약 자체가 해제되면 정정 또는 취소 신고가 이루어집니다. 이 경우 실거래가 공개시스템의 수치도 시차를 두고 함께 바뀔 수 있습니다. 최근 달 데이터일수록 이후에 소폭 조정될 가능성이 상대적으로 더 크다고 이해하면 됩니다.",
      },
      {
        type: "heading",
        text: "데이터를 볼 때 참고할 점",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "최근 1~2개월 데이터는 '거래가 적다'가 아니라 '아직 신고가 다 반영되지 않았다'로 해석하는 것이 정확합니다.",
          "신고 기한이 충분히 지난, 완결된 달의 데이터일수록 신뢰도가 높습니다.",
          "같은 지역이라도 시점마다 신고 진행률이 달라, 월별 건수를 단순 비교할 때 이 점을 함께 고려하는 것이 좋습니다.",
        ],
      },
    ],
  },
  {
    slug: "exclusive-vs-supply-area-guide",
    title: "전용면적과 공급면적, 아파트 시세 비교할 때 헷갈리지 않는 법",
    category: "guide",
    publishedAt: "2026-07-17",
    summary:
      "전용면적과 공급면적(계약면적)이 어떻게 다른지, 그리고 이 대시보드에서 면적을 볼 때 유의할 점을 정리했습니다.",
    body: [
      {
        type: "paragraph",
        text: "아파트 매물이나 실거래가를 보다 보면 '전용면적'과 '공급면적(계약면적)'이라는 용어가 함께 등장해 헷갈리기 쉽습니다. 흔히 '34평'이라 불리는 아파트도 전용면적 기준으로는 단지마다 조금씩 차이가 날 수 있어, 두 개념을 구분하지 못하면 시세를 비교할 때 착시가 생길 수 있습니다.",
      },
      {
        type: "callout",
        variant: "warning",
        text: "이 글에서 설명하는 면적 용어는 일반적인 정의이며, 개별 단지의 정확한 면적 정보는 공급계약서, 등기사항증명서, 관리사무소 확인 등을 통해 별도로 확인하시기 바랍니다. " +
          DISCLAIMER,
      },
      {
        type: "heading",
        text: "전용면적이란",
      },
      {
        type: "paragraph",
        text: "전용면적은 현관문을 열고 들어가는 순간부터 시작되는, 세대가 독립적으로 사용하는 공간의 면적입니다. 거실, 방, 주방, 화장실 등이 포함되며, 발코니(확장 전 기준)는 서비스 면적으로 별도 취급되어 전용면적에 들어가지 않는 것이 원칙입니다. 국토교통부 실거래가 공개시스템과 이 대시보드가 표시하는 면적(㎡)은 기본적으로 이 전용면적을 기준으로 합니다.",
      },
      {
        type: "heading",
        text: "공급면적·계약면적이란",
      },
      {
        type: "paragraph",
        text: "공급면적은 전용면적에 계단, 복도, 엘리베이터 등 다른 세대와 함께 쓰는 주거공용면적을 더한 값입니다. 여기에 지하주차장 등 기타공용면적까지 더하면 계약면적이 됩니다. 부동산 매물 광고에서 흔히 말하는 'OO평형'은 이 공급면적을 평 단위로 환산한 경우가 많아, 전용면적만 보는 실거래가 수치와는 기준이 다릅니다.",
      },
      {
        type: "heading",
        text: "왜 헷갈리면 안 되나",
      },
      {
        type: "paragraph",
        text: "같은 공급면적이라도 단지 구조에 따라 공용면적이 차지하는 비율(전용률)이 달라, 전용면적은 실제로 다를 수 있습니다. '34평형'끼리 비교해도 전용면적 기준 실거래가는 다르게 나타날 수 있다는 뜻입니다. 이 대시보드처럼 전용면적(㎡) 기준으로 실거래가를 비교할 때는, 광고에서 본 평형이 아니라 실제 전용면적 숫자를 함께 맞춰 보는 것이 정확한 비교에 도움이 됩니다.",
      },
      {
        type: "heading",
        text: "평(㎡) 환산, 참고 기준",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "1평 ≈ 3.3058㎡ (㎡를 평으로 바꾸려면 대략 0.3025를 곱합니다.)",
          "전용면적 84㎡는 흔히 '국민평형'이라 불리는 약 34평형대에 해당합니다.",
          "면적 표기가 ㎡인지 평인지, 전용인지 공급인지를 항상 함께 확인하는 습관이 시세 비교 착오를 줄여줍니다.",
        ],
      },
    ],
  },
  {
    slug: "molit-system-vs-dashboard-guide",
    title: "국토교통부 실거래가 공개시스템, 이 사이트와 어떻게 다른가",
    category: "guide",
    publishedAt: "2026-07-17",
    summary:
      "국토교통부 실거래가 공개시스템과 이 대시보드가 같은 원자료를 어떻게 다르게 보여주는지, 언제 어느 쪽을 보면 좋은지 비교했습니다.",
    body: [
      {
        type: "paragraph",
        text: "이 대시보드가 보여주는 실거래가는 전부 국토교통부 실거래가 공개시스템(공공데이터포털)이 제공하는 원자료를 그대로 가져온 것입니다. 그렇다면 원본 시스템을 직접 보면 될 텐데 왜 이런 대시보드가 따로 있는지 궁금할 수 있습니다. 데이터 출처는 같지만 보여주는 방식과 목적이 다릅니다.",
      },
      {
        type: "callout",
        variant: "warning",
        text: "이 글은 두 서비스가 데이터를 조회·표시하는 방식의 차이를 설명하기 위한 것으로, 시세 보증을 의미하지 않습니다. " + DISCLAIMER,
      },
      {
        type: "heading",
        text: "국토교통부 실거래가 공개시스템은 원자료 조회 중심",
      },
      {
        type: "paragraph",
        text: "국토교통부 실거래가 공개시스템은 지역, 기간, 건축물 유형 등 조건을 지정하면 개별 신고 건을 표 형태로 그대로 보여주는 공식 창구입니다. 법적 신고 데이터를 가장 원본에 가깝게 확인할 수 있다는 점이 가장 큰 특징이며, 이 대시보드를 포함한 모든 부동산 관련 서비스가 참고하는 1차 출처입니다.",
      },
      {
        type: "heading",
        text: "이 대시보드는 데이터를 가공해 한눈에 보여주는 것이 목적",
      },
      {
        type: "paragraph",
        text: "이 대시보드는 같은 원자료를 가져와 지역별 평균가, 전월 대비 변동, 최근 13개월 추이 같은 통계로 미리 계산해서 보여줍니다. 개별 신고 건을 하나씩 넘겨보지 않아도 지역 시세의 흐름을 빠르게 파악할 수 있도록 만든 것이 목적입니다. 또한 단지별 지하철역 거리, 인근 학교 정보처럼 실거래가 공개시스템에는 없는 부가 정보도 함께 보여줍니다.",
      },
      {
        type: "heading",
        text: "무엇을 확인할 때 어디를 보면 좋을까",
      },
      {
        type: "paragraph",
        text: "지역 전체의 시세 흐름을 빠르게 훑어보거나 여러 단지를 한눈에 비교하고 싶을 때는 이 대시보드처럼 가공된 통계가 편리합니다. 반대로 특정 거래 한 건의 정확한 신고 내용(동·층, 신고일 등)을 확인해야 하거나 원자료 자체가 필요한 경우라면 국토교통부 실거래가 공개시스템을 직접 확인하는 것이 정확합니다. 이 대시보드는 원자료를 대체하는 것이 아니라, 더 쉽게 읽을 수 있도록 가공해 보여주는 보조 도구로 이해하시면 됩니다.",
      },
      {
        type: "heading",
        text: "데이터가 다르게 보일 수 있는 경우",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "이 대시보드는 국토교통부 API가 갱신되는 주기에 맞춰 데이터를 가져오므로, 원본 시스템과 조회 시점이 다르면 일시적으로 반영 시차가 있을 수 있습니다.",
          "평균가·변동률 등은 이 대시보드가 원자료를 가공해 계산한 값으로, 국토교통부 시스템 자체에는 없는 이 사이트만의 통계입니다.",
          "개별 거래 내역(동, 층, 계약일 등)은 두 곳 모두 같은 신고 원자료를 따르므로 근본적으로 다르지 않습니다.",
        ],
      },
    ],
  },
];

/** 발행일 최신순 정렬된 전체 글 목록 */
export function getBlogPosts(): BlogPost[] {
  // 내림차순(최신순). 문자열 비교이므로 동률(같은 날짜)일 때 0을 반환해야 comparator 계약을 지킨다
  // (이전엔 항상 -1/1만 반환해 동률 시 대칭성이 깨지는 버그가 있었음).
  return [...blogPosts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** slug로 글 1개 조회. 없으면 undefined */
export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

/** 카테고리별 글 목록(발행일 최신순) */
export function getBlogPostsByCategory(category: BlogCategory): BlogPost[] {
  return getBlogPosts().filter((post) => post.category === category);
}

/** 실제로 글이 1편 이상 있는 카테고리만 반환 (docs/design/blog.md §1-2 "글이 있는 카테고리만 탭 렌더") */
export function getActiveBlogCategories(): BlogCategory[] {
  const order: BlogCategory[] = ["guide", "insight", "howto", "market"];
  return order.filter((category) => blogPosts.some((post) => post.category === category));
}

/** "YYYY-MM-DD" → "YYYY. M. D." (한국어 로케일 날짜 표기, docs/design/blog.md 예시와 동일).
 * Date 객체를 거치지 않아 빌드 서버 타임존에 따른 날짜 밀림이 없다. */
export function formatBlogDateKo(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}. ${m}. ${d}.`;
}

/** 본문 총 글자 수 기반 예상 읽기시간(분). 한국어 평균 독서 속도(분당 약 450자) 기준, 최소 1분. */
export function getReadingMinutes(post: BlogPost): number {
  const totalChars = post.body.reduce((sum, section) => {
    if (section.type === "paragraph" || section.type === "heading") return sum + section.text.length;
    if (section.type === "list") return sum + section.items.join("").length;
    if (section.type === "callout") return sum + section.text.length;
    return sum;
  }, 0);
  return Math.max(1, Math.round(totalChars / 450));
}
