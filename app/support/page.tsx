import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/ContactForm";

// 내부 기록용 메모(사이트 비노출):
// CS팀 FAQ 초안(docs/cs/2026-07-15-faq-draft.md)과 이용약관/개인정보처리방침 톤을 기준으로
// 실제 구현 코드(app/page.tsx, app/api/recommend/route.ts, lib/recommender.ts) 확인 후 작성.
// 2026-07-17: 문의 채널을 mailto 링크에서 실제 접수 폼(/api/contact, Resend 발송)으로 전환.
// 계산기 허브와 Resend 계정/키를 공유하되 제목 접두어로 사이트를 구분한다.

export const metadata: Metadata = {
  title: "문의하기",
  description:
    "부동산 실거래가 대시보드 이용 중 자주 묻는 질문(FAQ)과 오류 제보·문의 방법을 안내합니다.",
};

type FaqItem = {
  q: string;
  a: React.ReactNode;
};

const faqs: FaqItem[] = [
  {
    q: "실거래가 데이터가 실제와 다른 것 같아요.",
    a: (
      <>
        본 서비스의 실거래가는 국토교통부 실거래가 공개시스템(공공데이터포털)에
        신고된 계약일 기준 데이터입니다. 부동산 거래 신고는 계약일로부터
        일정 기간 내에 이루어지므로, 가장 최근 달의 거래는 아직 신고가 다
        반영되지 않아 건수가 적거나 비어 있을 수 있습니다. 신고 이후
        정정·취소되는 거래가 있어 원자료와 차이가 발생하기도 합니다. 이는
        서비스 오류가 아니라 원자료(신고 데이터) 자체의 특성이지만, 그래도
        명백히 이상하다고 느껴지신다면 아래 문의처로 알려주세요.
      </>
    ),
  },
  {
    q: "빌라/단독주택은 왜 조회가 안 되나요?",
    a: (
      <>
        현재는 아파트 매매·전세만 조회할 수 있으며, 빌라·단독주택은 국토부
        실거래가 추가 서비스 승인 대기로 인해 준비 중입니다. 지역 조회 시
        건물유형 버튼에도 &quot;(준비중)&quot;으로 표시되어 있으며 아직 선택할
        수 없습니다. 오픈 시점이 확정되면 별도로 안내드리겠습니다.
      </>
    ),
  },
  {
    q: "이 사이트에 나온 가격을 보고 매수/매도해도 되나요?",
    a: (
      <>
        아니요. 본 서비스는 투자 자문·중개·시세 보증 서비스가 아니며, 제공되는
        모든 정보는 참고용입니다. AI 맞춤 추천 역시 입력하신 선호도(가격·
        역세권·신축·평지)에 따라 후보 단지를 점수화해 정렬한 결과일 뿐, 수익성이나
        향후 가격 상승을 예측·보장하지 않습니다. 매수·매도 등 중요한
        의사결정을 내리기 전에는 반드시 국토교통부 실거래가 공개시스템 원자료
        및 관련 전문가의 확인을 함께 거치시기 바랍니다. 자세한 내용은{" "}
        <Link href="/terms" className="text-brand underline underline-offset-2">
          이용약관
        </Link>
        을 참고해 주세요.
      </>
    ),
  },
  {
    q: "AI 맞춤 추천의 경사도(평지) 점수는 어떻게 계산되나요?",
    a: (
      <>
        단지 좌표를 기준으로 주변 지점들의 표고(고도) 데이터를 조회해 고도
        차이가 작을수록 높은 점수를 주는 방식으로 계산합니다. 가격·역세권·
        신축과 함께 4가지 선호도 중 하나로 반영되며, 좌표나 고도 정보를
        일시적으로 가져오지 못한 단지는 해당 점수를 계산하지 않고 다른
        기준으로 정렬합니다.
      </>
    ),
  },
  {
    q: "개인정보를 저장하나요?",
    a: (
      <>
        회원가입·로그인 없이 이용할 수 있으며, 조회 조건(지역, 거래 유형, AI
        추천 선호도 입력값 등)을 이용자를 식별할 수 있는 정보와 결합해 저장하지
        않습니다. 자세한 수집 항목과 쿠키·광고 관련 안내는{" "}
        <Link href="/privacy" className="text-brand underline underline-offset-2">
          개인정보처리방침
        </Link>
        에서 확인하실 수 있습니다.
      </>
    ),
  },
  {
    q: "데이터는 얼마나 자주 갱신되나요?",
    a: (
      <>
        조회 편의를 위해 지역별 실거래 데이터를 미리 모아두는 캐시 구조를
        사용하고 있으며, 매일 자동으로 최신 달 데이터를 다시 확인해 갱신합니다.
        화면 상단의 &quot;마지막 업데이트&quot; 시각으로 실제 조회 시점을 확인할
        수 있습니다.
      </>
    ),
  },
  {
    q: "조회했는데 데이터가 비어 있어요. 고장인가요?",
    a: (
      <>
        반드시 고장은 아닙니다. 해당 지역·유형에 신고된 실거래가 없거나, 최신
        달의 신고가 아직 반영되지 않은 경우 결과가 비어 보일 수 있습니다.
        화면에도 안내 문구가 함께 표시됩니다. 같은 지역에서 계속 비정상으로
        보인다면 아래 문의처로 알려주세요.
      </>
    ),
  },
  {
    q: "지원하지 않는 지역이 있나요?",
    a: (
      <>
        현재 서울특별시, 경기도, 인천광역시, 부산광역시, 대구광역시,
        대전광역시, 광주광역시, 울산광역시, 세종특별자치시를 지원합니다. 그 외
        지역 확대 여부는 검토 중이며, 지원 지역이 아닌 경우 시/도 선택
        목록에서 확인하실 수 있습니다.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-[2rem]">
        문의하기
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        자주 묻는 질문을 먼저 확인해 보시고, 해결되지 않으면 아래 문의하기
        버튼으로 알려주세요.
      </p>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          자주 묻는 질문
        </h2>
        <div className="flex flex-col divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {faqs.map((item, i) => (
            <details key={i} className="group px-4 py-3 sm:px-5 sm:py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-gray-800 marker:content-none sm:text-base">
                <span className="flex items-start justify-between gap-3">
                  <span>Q. {item.q}</span>
                  <span className="shrink-0 text-gray-400 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <div className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          문의 / 오류 제보
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:text-base">
          아래 양식을 작성해 보내주시면 담당자가 확인 후 입력하신 이메일로
          답변드립니다. 데이터 오류를 제보해 주실 때는 (1) 조회한 지역, (2)
          건물 유형·거래 유형, (3) 어떤 화면에서 발생했는지를 함께 적어주시면
          확인이 훨씬 빨라집니다.
        </p>
        <div className="mt-4">
          <ContactForm />
        </div>
      </section>

      <div className="mt-10">
        <Link href="/" className="text-sm text-brand hover:underline">
          ← 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
