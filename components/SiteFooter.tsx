"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 라운드45(2026-07-25) 버그 수정: 블로그 12개 URL(목록+상세 11편)에 개인정보처리방침·
// 이용약관 도달 경로가 없던 문제 대응 — docs/team-log/2026-07-25.md 라운드44 #10,
// 스펙 근거는 docs/design/blog.md:32,125의 목록/상세 페이지 최하단 [Footer].
// 지금까지 <footer>는 app/page.tsx(홈) 안에만 있었는데, components/SiteHeader.tsx
// 주석("법적 고지는 footer에만 유지")의 전제가 실제로는 성립하지 않았다 — 그 footer가
// 홈에만 있었기 때문이다. 이 컴포넌트가 그 footer를 모든 비-홈 페이지로 전역화한다.
//
// components/SiteHeader.tsx와 정확히 같은 패턴: pathname이 "/"이면 자기 자신을
// 렌더링하지 않는다 — 홈은 app/page.tsx의 기존 자체 <footer>를 그대로 쓰므로 중복
// 방지. 소개/문의하기/부동산 정보 링크는 이미 SiteHeader(HEADER_NAV_ITEMS)에 있으므로
// 여기서 다시 넣지 않는다(중복 배치 판단은 이 파일 작성자 재량 — 작업 지시 참고).
// 이 컴포넌트는 법적 고지(개인정보처리방침·이용약관) + 데이터 출처 표기만 담당한다.
//
// mt-auto: app/layout.tsx의 <body>가 min-h-full flex flex-col이므로, 이 footer가
// (CrossSiteNav를 제외하면) body의 마지막 in-flow flex 아이템이 되어 mt-auto가 남는
// 세로 여백을 전부 흡수한다 — 콘텐츠가 짧은 페이지(예: /privacy)에서도 footer가
// 뷰포트 최하단에 붙는다(각 페이지 래퍼에 flex-1을 추가할 필요 없음).

export default function SiteFooter() {
  const pathname = usePathname();

  // 홈은 app/page.tsx가 기존 자체 footer를 담당하므로 중복 렌더 방지.
  if (pathname === "/") return null;

  return (
    <footer className="mt-auto text-center text-xs text-gray-400 py-6">
      <p>데이터 출처: 국토교통부 실거래가 공개시스템(공공데이터포털)</p>
      <nav className="mt-2 flex items-center justify-center gap-3" aria-label="법적 고지">
        <Link href="/privacy" className="hover:text-gray-600 hover:underline">
          개인정보처리방침
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-gray-600 hover:underline">
          이용약관
        </Link>
      </nav>
    </footer>
  );
}
