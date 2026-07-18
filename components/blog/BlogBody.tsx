import { formatBlogDateKo, type BlogSection } from "@/lib/blog";
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
          case "sourceLinks":
            // "참고 기사" 출처 목록. docs/design/blog.md §7-2(레이아웃)·§7-3(접근성) 스펙 그대로.
            // body 배열의 마지막 요소로 넣는 관례(§7-1)라 여기서는 위치를 별도로 계산하지 않는다.
            return (
              <div key={index} className="mt-10 pt-6 border-t border-gray-100">
                <h2 className="text-xs font-semibold text-gray-500 mb-3">참고 기사</h2>
                <ul className="list-none space-y-2.5">
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="text-sm leading-relaxed text-gray-500">
                      <span className="text-gray-400">{item.outlet}</span>
                      <span aria-hidden="true"> · </span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 underline underline-offset-2 hover:text-brand"
                      >
                        {item.title}
                      </a>
                      <span className="sr-only">(새 탭에서 열림)</span>
                      {item.publishedAt && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="text-gray-400">{formatBlogDateKo(item.publishedAt)}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
