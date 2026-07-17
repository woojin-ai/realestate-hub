"use client";

import { useState } from "react";
import type { BlogCategory, BlogPost } from "@/lib/blog";
import BlogCard from "./BlogCard";
import CategoryTabs, { type BlogCategoryFilter } from "./CategoryTabs";

// 목록 본문(필터 탭 + 카드 리스트). docs/design/blog.md §1-2~1-5.
// 카테고리 상태는 이 사이트의 DealTypeTabs와 동일하게 클라이언트 로컬 상태로 관리한다
// (기획안 §6은 라우팅 방식을 "개발팀 판단"으로 명시적으로 위임).

interface BlogListProps {
  posts: BlogPost[]; // 발행일 최신순 정렬되어 전달됨
  categories: BlogCategory[]; // 글이 있는 카테고리만
}

export default function BlogList({ posts, categories }: BlogListProps) {
  const [filter, setFilter] = useState<BlogCategoryFilter>("all");

  const visiblePosts = filter === "all" ? posts : posts.filter((post) => post.category === filter);

  return (
    <>
      <CategoryTabs categories={categories} value={filter} onChange={setFilter} />

      {visiblePosts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-sm text-gray-400 border border-dashed border-gray-200">
          아직 등록된 글이 없습니다.
        </div>
      ) : (
        <div>
          {visiblePosts.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </>
  );
}
