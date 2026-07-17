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
      <h2 className="text-base md:text-lg font-bold text-brand-dark line-clamp-2 mt-2">
        {post.title}
      </h2>
      <p className="text-sm text-gray-500 line-clamp-2 mt-1.5">{post.summary}</p>
      <div className="flex items-center gap-2 text-xs text-gray-400 mt-2">
        <time dateTime={post.publishedAt}>{formatBlogDateKo(post.publishedAt)}</time>
        <span aria-hidden="true">·</span>
        <span>읽는 시간 {getReadingMinutes(post)}분</span>
      </div>
    </Link>
  );
}
