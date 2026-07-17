// 크로스 사이트 내비게이션 위젯 — 계산기 허브
// (C:\claude code webside\components\CrossSiteNav.tsx, design/cross-site-nav-widget-spec.md 기준)
// 실제 구현을 이 프로젝트로 이식.
// 데스크톱(2xl, 1536px~): 우측 뷰포트 고정 세로 레일(스펙 §4).
// 모바일(~1535px): 우하단 FAB → <details>로 펼치는 패널, JS 불필요(스펙 §5).
// 두 버전 모두 항상 함께 서버 렌더링하고 Tailwind 반응형 클래스로만 전환한다(스펙 §4-2).
//
// 이 프로젝트 전용으로 재계산/치환한 것(계산기 허브와 다른 부분, 그대로 베끼면 안 되는 값):
// - 브레이크포인트: xl(1280px) → 2xl(1536px)로 상향. 이 프로젝트에서 가장 넓은 페이지
//   컨테이너는 app/page.tsx의 max-w-[1200px](계산기 허브는 1024px). 공식(스펙 §4-1)
//   V_min = C + 2×(오프셋16 + 레일폭80 + 여백목표24) = 1200 + 240 = 1440px.
//   xl(1280px)은 거터 (1280-1200)/2=40px < 레일 점유 96px → -56px(콘텐츠와 겹침, 불가).
//   2xl(1536px)은 거터 (1536-1200)/2=168px, 여유 168-96=72px(목표 24px보다 넉넉, 안전).
// - 디자인 토큰: brand-primary→brand, brand-surface→white, brand-border→gray-200,
//   brand-text-secondary→gray-500, brand-text-disabled→gray-400, brand-bg→gray-100,
//   brand-text(기본 텍스트)→gray-900(이 프로젝트 h1/h2 등 기존 관례와 동일).
// - lib/focusRing.ts가 이 프로젝트엔 없어 Tier A(FOCUS_RING_CARD) 값을 아래 인라인
//   상수로 대체(새 파일을 만들지 않음).
import {
  CROSS_SITE_LINKS,
  type CrossSiteId,
  type CrossSiteLink,
} from "@/lib/cross-site-links";

// 포커스 링 Tier A — 계산기 허브 lib/focusRing.ts의 FOCUS_RING_CARD와 동일 값
// (brand-primary→brand 치환). 이 프로젝트엔 focusRing.ts가 없어 인라인 상수로 대체.
const FOCUS_RING_CARD =
  "focus-visible:outline-hidden focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15";

function SiteBadge({
  site,
  variant,
}: {
  site: CrossSiteLink;
  variant: "rail" | "panel";
}) {
  const base =
    variant === "rail"
      ? "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold";

  return (
    <span
      aria-hidden="true"
      className={`${base} ${site.badgeBg} ${site.badgeText}`}
    >
      {site.initial}
    </span>
  );
}

// 데스크톱 레일 아이템 — 배지(위) + 축약 라벨(아래) 세로 스택.
// 상태 3가지: 현재 사이트 / 준비 중 / 일반 링크(계산기 허브 스펙 §6·§7·§4-3와 동일 로직).
function RailItem({
  site,
  isCurrent,
}: {
  site: CrossSiteLink;
  isCurrent: boolean;
}) {
  if (isCurrent) {
    return (
      <div
        aria-current="page"
        className="flex w-16 flex-col items-center gap-1 rounded-xl bg-blue-50 px-1 py-2 text-center"
      >
        <SiteBadge site={site} variant="rail" />
        <span className="w-full break-keep text-[11px] font-semibold leading-tight text-brand">
          {site.shortLabel}
        </span>
        <span className="w-full text-[9px] text-gray-500">현재</span>
      </div>
    );
  }

  if (!site.url) {
    return (
      <div
        aria-disabled="true"
        className="flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center opacity-70"
      >
        <SiteBadge site={site} variant="rail" />
        <span className="w-full break-keep text-[11px] font-medium leading-tight text-gray-400">
          {site.shortLabel}
        </span>
        <span className="w-full text-[9px] text-gray-400">준비 중</span>
      </div>
    );
  }

  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      title={site.description}
      aria-label={`${site.name} — ${site.description} (새 탭에서 열림)`}
      className={`group flex w-16 flex-col items-center gap-1 rounded-xl border border-transparent px-1 py-2 text-center transition-colors hover:border-gray-200 hover:bg-gray-100 ${FOCUS_RING_CARD}`}
    >
      <SiteBadge site={site} variant="rail" />
      <span className="w-full break-keep text-[11px] font-medium leading-tight text-gray-500 group-hover:text-brand">
        {site.shortLabel}
      </span>
    </a>
  );
}

// 모바일 FAB 패널 행 — 배지 + 풀네임 + 설명 가로 배치(계산기 허브 스펙 §5-4).
// 이 행은 항상 rounded-xl이 적용돼 있어 Tier B-2(FOCUS_RING_INSET)의
// focus-visible:rounded-md를 그대로 붙이면 포커스 시 모서리 반경이 충돌하므로,
// 계산기 허브 원본과 동일하게 상수 대신 포커스 클래스를 직접 쓴다.
function PanelRow({
  site,
  isCurrent,
}: {
  site: CrossSiteLink;
  isCurrent: boolean;
}) {
  if (isCurrent) {
    return (
      <div
        aria-current="page"
        className="flex items-center gap-3 rounded-xl bg-blue-50 px-2 py-2.5"
      >
        <SiteBadge site={site} variant="panel" />
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-brand">{site.name}</span>
          <span className="text-xs text-gray-500">
            {site.description} · 현재 사이트
          </span>
        </span>
      </div>
    );
  }

  if (!site.url) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center gap-3 rounded-xl px-2 py-2.5 opacity-70"
      >
        <SiteBadge site={site} variant="panel" />
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-gray-400">
            {site.name}
          </span>
          <span className="text-xs text-gray-400">
            {site.description} · 준비 중
          </span>
        </span>
      </div>
    );
  }

  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-gray-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
    >
      <SiteBadge site={site} variant="panel" />
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-gray-900">
          {site.name}
        </span>
        <span className="text-xs text-gray-500">{site.description}</span>
      </span>
      <span className="sr-only">(새 탭에서 열림)</span>
    </a>
  );
}

export default function CrossSiteNav({
  currentSiteId,
}: {
  currentSiteId: CrossSiteId;
}) {
  return (
    <>
      {/* 데스크톱 레일 — 2xl(1536px)부터 노출. 재계산 근거는 파일 상단 주석 참고. */}
      <nav
        aria-label="관련 서비스 바로가기"
        className="fixed right-4 top-1/2 z-40 hidden max-h-[80vh] w-20 -translate-y-1/2 flex-col gap-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-md 2xl:flex"
      >
        <p
          aria-hidden="true"
          className="mb-1 px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500"
        >
          관련 서비스
        </p>
        <ul className="flex flex-col gap-1">
          {CROSS_SITE_LINKS.map((site) => (
            <li key={site.id}>
              <RailItem site={site} isCurrent={site.id === currentSiteId} />
            </li>
          ))}
        </ul>
      </nav>

      {/*
        모바일 FAB — 2xl 미만에서 노출. `.cross-site-fab` 클래스는 app/globals.css의
        :has() 규칙이 입력 포커스 시 이 요소를 통째로 페이드아웃시키는 타깃이다
        (계산기 허브 스펙 §5-3). nav로 감싸는 이유는 둘 다 랜드마크로 감쌀 것(스펙 §9)
        — 시각적으로는 항상 fixed라 요소 종류가 바뀌어도 레이아웃에 영향 없다.
      */}
      <nav
        aria-label="관련 서비스 바로가기"
        className="cross-site-fab fixed right-4 z-40 2xl:hidden"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <details className="group relative">
          <summary
            aria-label="관련 서비스 바로가기"
            className="flex h-14 w-14 list-none items-center justify-center rounded-full bg-brand shadow-md transition-transform marker:content-none [&::-webkit-details-marker]:hidden focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-brand/30 active:scale-95"
          >
            <span aria-hidden="true" className="grid grid-cols-2 gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          </summary>

          <div className="absolute bottom-[calc(100%+0.75rem)] right-0 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-md">
            <p className="mb-1 px-2 pt-1 text-xs font-semibold text-gray-500">
              관련 서비스
            </p>
            <ul className="flex flex-col">
              {CROSS_SITE_LINKS.map((site) => (
                <li key={site.id}>
                  <PanelRow site={site} isCurrent={site.id === currentSiteId} />
                </li>
              ))}
            </ul>
          </div>
        </details>
      </nav>
    </>
  );
}
