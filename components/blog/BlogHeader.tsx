import Link from "next/link";

// 블로그 전용 상단 헤더. docs/design/blog.md §1-1/§2-1 "[Header] ← 대시보드 헤더 재사용(브랜드 그라디언트)".
// 홈 헤더(app/page.tsx)의 브랜드 그라디언트·이모지+타이틀 시각 언어를 그대로 재사용하되,
// 대시보드 전용 히어로 이미지·태그라인은 제외한 블로그 전용 축약형(SEO로 바로 유입되는 방문자를 위한 브랜드 인지/홈 복귀 동선).

export default function BlogHeader() {
  return (
    <header className="bg-gradient-to-br from-brand-dark to-[#283593] text-white px-4 py-3 md:px-8 md:py-5 flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <span className="text-2xl md:text-3xl">🏘️</span>
        <span className="text-base md:text-xl font-bold">부동산 실거래가 대시보드</span>
      </Link>
    </header>
  );
}
