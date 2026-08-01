import type { Metadata } from "next";
import { getActiveBlogCategories, getBlogPosts } from "@/lib/blog";
import BlogList from "@/components/blog/BlogList";
import { SITE_URL } from "@/lib/site";

// docs/design/blog.md §1 목록 페이지. 레이아웃/문구는 구성안 그대로.
// 헤더: 자체 BlogHeader 대신 전역 SiteHeader(app/layout.tsx)를 사용한다(2026-07-18,
// 블로그/소개/문의하기 헤더 내비 승격 작업 — components/SiteHeader.tsx 참고).

const TITLE = "부동산 정보";
const DESCRIPTION =
  "실거래가를 더 잘 읽는 법을 정리합니다. 신고 제도, 면적 용어 등 참고 정보를 다루며 투자 자문을 목적으로 하지 않습니다.";
const PAGE_URL = `${SITE_URL}/blog`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  // canonical과 og:url은 쌍으로 지정한다(상세 페이지 app/blog/[slug]/page.tsx와 동일 취지).
  // og를 생략하면 layout.tsx 기본값(og:url=루트, og:title=사이트명)을 상속해 canonical과
  // 모순되고, 공유 시 홈 카드가 뜬다. openGraph는 부모와 깊은 병합되지 않고 대체되므로
  // siteName·locale·type까지 app/ranking/page.tsx와 같은 구성으로 모두 적는다.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: "부동산 실거래가 대시보드",
    locale: "ko_KR",
    type: "website",
  },
};

export default function BlogIndexPage() {
  const posts = getBlogPosts();
  const categories = getActiveBlogCategories();

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-[2rem]">부동산 정보</h1>
        <p className="mt-2 text-sm text-gray-500">
          실거래가를 더 잘 읽는 법을 정리합니다. 투자 조언이 아닌 참고 정보입니다.
        </p>

        <div className="mt-6">
          <BlogList posts={posts} categories={categories} />
        </div>
      </div>
    </>
  );
}
