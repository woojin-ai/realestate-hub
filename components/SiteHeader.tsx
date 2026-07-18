"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 사용자 피드백 대응(2026-07-18): "블로그·소개·문의하기가 footer 맨 아래에 작은 글씨로만
// 있어서 있는 줄도 몰랐다" — 이 3개 링크를 헤더 내비게이션으로 승격한다.
// 개인정보처리방침·이용약관은 법적 고지 성격이라 지금처럼 footer에만 유지(헤더로 올리지 않음).
//
// 대시보드 홈(app/page.tsx)은 기존 히어로 배너(그라디언트+일러스트+타이틀)를 유지해야 하므로,
// 이 컴포넌트가 홈에서도 렌더링되면 완전히 다른 스타일의 헤더 두 개가 겹친다. 그래서:
// - HeaderNavLinks(내비 링크 3개 + 활성 표시)는 여기서 export해 app/page.tsx가 자체 히어로
//   배너 안에 직접 재사용한다.
// - SiteHeader(로고+타이틀+HeaderNavLinks 전체)는 app/layout.tsx에 전역 마운트하되,
//   pathname이 "/"이면 자기 자신을 렌더링하지 않는다(홈은 자체 헤더가 대신 담당).

export const HEADER_NAV_ITEMS = [
  { href: "/blog", label: "블로그" },
  { href: "/about", label: "소개" },
  { href: "/support", label: "문의하기" },
] as const;

// 블로그 상세(/blog/[slug])도 "블로그" 메뉴 활성화 대상에 포함.
function isNavItemActive(pathname: string, href: string) {
  if (href === "/blog") return pathname === "/blog" || pathname.startsWith("/blog/");
  return pathname === href;
}

export function HeaderNavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 페이지" className={`flex items-center gap-1.5 md:gap-2 ${className}`}>
      {HEADER_NAV_ITEMS.map((item) => {
        const isActive = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs md:text-sm font-medium transition-colors
              focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70
              ${
                isActive
                  ? "bg-white text-brand-dark font-semibold"
                  : "text-white/85 hover:bg-white/15 hover:text-white"
              }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();

  // 홈은 app/page.tsx의 히어로 배너가 HeaderNavLinks를 직접 통합하므로 중복 렌더 방지.
  if (pathname === "/") return null;

  return (
    <header className="bg-gradient-to-br from-brand-dark to-[#283593] text-white px-4 py-3 md:px-8 md:py-4">
      <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl md:text-3xl">🏘️</span>
          <span className="text-base md:text-xl font-bold">부동산 실거래가 대시보드</span>
        </Link>
        <HeaderNavLinks />
      </div>
    </header>
  );
}
