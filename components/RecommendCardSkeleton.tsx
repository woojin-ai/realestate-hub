// 추천 카드 스켈레톤 (design §3-A). 실제 카드와 동일 골격으로 레이아웃 점프 방지.
export default function RecommendCardSkeleton() {
  return (
    <div
      className="bg-white rounded-xl border border-[#e8eaf6] p-4 shadow-sm animate-pulse"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-full bg-gray-100" />
        <div className="h-3 w-20 rounded bg-gray-100" />
      </div>
      <div className="h-4 w-3/4 rounded bg-gray-100 mb-2" />
      <div className="h-3 w-1/2 rounded bg-gray-100 mb-3" />
      <div className="h-6 w-16 rounded bg-gray-100 mb-3" />
      <div className="flex flex-col gap-2">
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}
