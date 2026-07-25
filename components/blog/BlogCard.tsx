import Link from "next/link";
import { formatBlogDateKo, getReadingMinutes, type BlogPost } from "@/lib/blog";
import CategoryBadge from "./CategoryBadge";

// 블로그 목록 카드. docs/design/blog.md §1-3 마크업 그대로.
// 계산기 허브의 그리드→단일 컬럼 되돌림 교훈(§0)에 따라 항상 1열 리스트에서만 쓰인다.

interface BlogCardProps {
  post: BlogPost;
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="block bg-white rounded-xl shadow-sm p-4 md:p-5 mb-4 hover:shadow-md transition-shadow border border-transparent hover:border-[#c5cae9]"
    >
      <CategoryBadge category={post.category} />
      {/*
        2026-07-25 라운드47 결정#11: 모바일(<768px, md: 미만)에서 line-clamp-2가
        실제 발행 글 11편 중 제목 7편·요약 11편을 잘랐다(요약 62~116자, 375px 카드
        내부 폭 ≈311px 기준 text-sm 1줄 ≈22자). md: 이상(이 카드가 이미 패딩·폰트
        크기를 나누는 기존 기준선)은 카드 폭이 넓어 공간 여유가 있어 기존 2줄을
        유지한다(마스터 승인 재량). line-clamp-3 / line-clamp-6 값은 실제 11편
        제목(최장 55자)·요약(최장 116자)을 dev 서버 375px 뷰포트에서 육안+텍스트
        추출로 검증해 확정한 값(docs/design/blog.md §1-4 참고).
      */}
      <h2 className="text-base md:text-lg font-bold text-brand-dark line-clamp-3 md:line-clamp-2 mt-2">
        {post.title}
      </h2>
      <p className="text-sm text-gray-500 line-clamp-6 md:line-clamp-2 mt-1.5">{post.summary}</p>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
        <time dateTime={post.publishedAt}>{formatBlogDateKo(post.publishedAt)}</time>
        <span aria-hidden="true">·</span>
        <span>읽는 시간 {getReadingMinutes(post)}분</span>
      </div>
    </Link>
  );
}
