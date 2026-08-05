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
      {/* 막대 4개 = 실제 카드의 가격·역세권·신축·평지(RecommendCard.tsx:113-125).
          2026-07-15 평지 막대 추가 때 여기가 3개로 남아 있어 로딩→표시 전환에서 한 줄만큼
          레이아웃이 튀었다. 카드 막대 개수를 바꾸면 여기도 같이 바꿔야 한다. */}
      <div className="flex flex-col gap-2">
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}
