import { BLOG_CATEGORY_BADGE, BLOG_CATEGORY_LABEL, type BlogCategory } from "@/lib/blog";

// 카테고리 배지. docs/design/blog.md §4 4색 팔레트 그대로. 현재는 guide만 실사용.

interface CategoryBadgeProps {
  category: BlogCategory;
}

export default function CategoryBadge({ category }: CategoryBadgeProps) {
  const { text, bg } = BLOG_CATEGORY_BADGE[category];

  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: text, background: bg }}
    >
      {BLOG_CATEGORY_LABEL[category]}
    </span>
  );
}
