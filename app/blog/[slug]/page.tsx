import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BLOG_CATEGORY_LABEL,
  blogPosts,
  formatBlogDateKo,
  getBlogPostBySlug,
  getReadingMinutes,
} from "@/lib/blog";
import BlogHeader from "@/components/blog/BlogHeader";
import BlogBody from "@/components/blog/BlogBody";
import CategoryBadge from "@/components/blog/CategoryBadge";

// docs/design/blog.md §2 상세 페이지. 레이아웃/문구는 구성안 그대로(브레드크럼→제목/메타→콜아웃→본문→CTA+면책 반복→목록 복귀).

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.summary,
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <BlogHeader />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <nav className="text-xs text-gray-400" aria-label="브레드크럼">
          <Link href="/" className="hover:text-brand">
            홈
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/blog" className="hover:text-brand">
            블로그
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/blog" className="hover:text-brand">
            {BLOG_CATEGORY_LABEL[post.category]}
          </Link>
        </nav>

        <h1 className="text-xl md:text-2xl font-bold text-brand-dark mt-2">{post.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-500">
          <time dateTime={post.publishedAt}>{formatBlogDateKo(post.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <CategoryBadge category={post.category} />
          <span aria-hidden="true">·</span>
          <span>읽는 시간 {getReadingMinutes(post)}분</span>
        </div>

        <BlogBody sections={post.body} />

        <div className="bg-white rounded-xl shadow-sm p-5 mt-8 text-center">
          <p className="text-sm text-gray-600 mb-3">직접 원하는 지역의 실거래가를 조회해보세요.</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[44px] rounded-lg
              bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#303f9f] transition-colors"
          >
            대시보드에서 조회하기 →
          </Link>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            이 글에 포함된 실거래가 통계는 참고용 정보이며, 투자 자문이나 시세 보증을 목적으로 하지 않습니다.
            매수·매도 등 의사결정 전 국토교통부 실거래가 공개시스템 원자료와 전문가 확인을 함께 거치시기 바랍니다.
          </p>
        </div>

        <div className="mt-6">
          <Link href="/blog" className="text-sm text-gray-500 hover:text-brand">
            ← 블로그 목록으로
          </Link>
        </div>
      </div>
    </>
  );
}
