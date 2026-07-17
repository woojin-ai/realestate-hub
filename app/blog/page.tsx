import type { Metadata } from "next";
import { getActiveBlogCategories, getBlogPosts } from "@/lib/blog";
import BlogHeader from "@/components/blog/BlogHeader";
import BlogList from "@/components/blog/BlogList";

// docs/design/blog.md §1 목록 페이지. 레이아웃/문구는 구성안 그대로.

export const metadata: Metadata = {
  title: "블로그",
  description:
    "실거래가를 더 잘 읽는 법을 정리합니다. 신고 제도, 면적 용어 등 참고 정보를 다루며 투자 자문을 목적으로 하지 않습니다.",
};

export default function BlogIndexPage() {
  const posts = getBlogPosts();
  const categories = getActiveBlogCategories();

  return (
    <>
      <BlogHeader />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-[2rem]">블로그</h1>
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
