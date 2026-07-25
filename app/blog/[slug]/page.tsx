import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BLOG_CATEGORY_LABEL,
  blogPosts,
  formatBlogDateKo,
  getBlogPostBySlug,
  getReadingMinutes,
  type BlogPost,
} from "@/lib/blog";
import BlogBody from "@/components/blog/BlogBody";
import CategoryBadge from "@/components/blog/CategoryBadge";
import { SITE_URL } from "@/lib/site";

// docs/design/blog.md §2 상세 페이지. 레이아웃/문구는 구성안 그대로(브레드크럼→제목/메타→콜아웃→본문→CTA+면책 반복→목록 복귀).
// 헤더: 자체 BlogHeader 대신 전역 SiteHeader(app/layout.tsx)를 사용한다(2026-07-18,
// 블로그/소개/문의하기 헤더 내비 승격 작업 — components/SiteHeader.tsx 참고).

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

  // 절대 URL 베이스는 lib/site.ts의 SITE_URL 하나만 사용한다(app/layout.tsx metadataBase,
  // app/sitemap.ts, app/robots.ts와 동일 출처). 도메인이 바뀌어도 SITE_URL만 고치면 된다.
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.summary,
    // 사이트 전체 canonical 부재 → 블로그 상세부터 글별 자기참조 canonical 지정.
    alternates: { canonical: url },
    // og를 글별로 지정하지 않으면 layout.tsx의 사이트 기본값(og:title=사이트명, og:url=루트,
    // og:type=website)을 그대로 상속해 어떤 글을 공유해도 같은 카드가 뜬다.
    openGraph: {
      title: post.title,
      description: post.summary,
      url,
      siteName: "부동산 실거래가 대시보드",
      locale: "ko_KR",
      type: "article",
      publishedTime: post.publishedAt,
    },
    // twitter를 비워두면 Next가 openGraph에서 title/description을 자동 승계하지만,
    // 공유 카드 종류(이미지 없는 summary)를 명시해 의도를 고정한다.
    twitter: {
      card: "summary",
      title: post.title,
      description: post.summary,
    },
  };
}

/**
 * 블로그 상세 구조화 데이터(BlogPosting). 이 저장소에는 기존 JSON-LD 삽입 패턴이 없어
 * Next.js 공식 가이드(node_modules/next/dist/docs/01-app/02-guides/json-ld.md)의 표준 방식을 따른다:
 * page 컴포넌트에서 application/ld+json 스크립트를 렌더하고, JSON.stringify 결과의
 * 여는 꺾쇠(less-than)를 유니코드 이스케이프(<)로 치환해 XSS를 차단한다.
 * 조작 금지 원칙: 개인 저자명·로고·평점 등 없는 정보는 넣지 않고, author/publisher는
 * 사이트 운영 주체(Organization)로만 표기한다.
 */
function buildBlogPostingJsonLd(post: BlogPost): object {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const organization = {
    "@type": "Organization",
    name: "부동산 실거래가 대시보드",
    url: SITE_URL,
  };

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.publishedAt,
    author: organization,
    publisher: organization,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "ko",
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

  const jsonLd = buildBlogPostingJsonLd(post);

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 구조화 데이터(비가시). 화면에 렌더되는 텍스트·레이아웃에는 영향 없음. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <nav className="text-xs text-gray-400" aria-label="브레드크럼">
          <Link href="/" className="hover:text-brand">
            홈
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href="/blog" className="hover:text-brand">
            부동산 정보
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
            ← 부동산 정보 목록으로
          </Link>
        </div>
      </div>
    </>
  );
}
