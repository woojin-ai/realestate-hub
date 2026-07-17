import type { BlogSection } from "@/lib/blog";
import Callout from "./Callout";

// 본문 섹션 배열을 순서대로 렌더한다. 배열 순서 자체가 화면 순서(관례: [0]=도입부, [1]=면책 콜아웃).
// docs/design/blog.md §2-1(레이아웃)·§5(데이터 출처 캡션 스타일).

interface BlogBodyProps {
  sections: BlogSection[];
}

export default function BlogBody({ sections }: BlogBodyProps) {
  return (
    <div>
      {sections.map((section, index) => {
        switch (section.type) {
          case "paragraph":
            return (
              <p
                key={index}
                className="text-sm sm:text-base text-gray-600 leading-relaxed mt-4 first:mt-0"
              >
                {section.text}
              </p>
            );
          case "heading":
            return (
              <h2
                key={index}
                className="text-lg md:text-xl font-bold text-gray-900 mt-8 mb-2"
              >
                {section.text}
              </h2>
            );
          case "list": {
            const items = section.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ));
            return section.ordered ? (
              <ol
                key={index}
                className="list-inside list-decimal space-y-1 text-sm sm:text-base text-gray-600 mt-3"
              >
                {items}
              </ol>
            ) : (
              <ul
                key={index}
                className="list-inside list-disc space-y-1 text-sm sm:text-base text-gray-600 mt-3"
              >
                {items}
              </ul>
            );
          }
          case "callout":
            return (
              <Callout key={index} variant={section.variant}>
                {section.text}
              </Callout>
            );
          case "sourceNote":
            return (
              <p key={index} className="text-xs text-gray-400 mt-1">
                국토교통부 실거래가 공개시스템 공공데이터 기반, 조회 기준일 {section.asOfDate}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
