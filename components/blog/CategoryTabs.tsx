"use client";

import { BLOG_CATEGORY_LABEL, type BlogCategory } from "@/lib/blog";

// 카테고리 필터 탭. docs/design/blog.md §1-2 마크업 그대로.
// 대시보드 DealTypeTabs와 동일한 시각 언어(활성=브랜드 배경+흰 텍스트)를 재사용하되,
// 카테고리 수가 가변적이므로 flex-1 2등분 대신 overflow-x-auto 가로 스크롤 탭으로 변경.
// "글이 있는 카테고리만 렌더"(categories prop) — 정적 4개 배열이 아니라 호출부가 실제 데이터 유무로 필터링해 전달한다.

export type BlogCategoryFilter = BlogCategory | "all";

interface CategoryTabsProps {
  categories: BlogCategory[];
  value: BlogCategoryFilter;
  onChange: (value: BlogCategoryFilter) => void;
}

export default function CategoryTabs({ categories, value, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto bg-white rounded-xl shadow-sm p-1.5 mb-5">
      <button
        type="button"
        data-active={value === "all"}
        onClick={() => onChange("all")}
        className="whitespace-nowrap rounded-lg px-4 py-2.5 text-sm min-h-[44px] transition-colors
          data-[active=true]:bg-brand data-[active=true]:text-white data-[active=true]:font-semibold
          text-gray-600 hover:bg-[#f5f7ff]"
      >
        전체
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          data-active={value === category}
          onClick={() => onChange(category)}
          className="whitespace-nowrap rounded-lg px-4 py-2.5 text-sm min-h-[44px] transition-colors
            data-[active=true]:bg-brand data-[active=true]:text-white data-[active=true]:font-semibold
            text-gray-600 hover:bg-[#f5f7ff]"
        >
          {BLOG_CATEGORY_LABEL[category]}
        </button>
      ))}
    </div>
  );
}
