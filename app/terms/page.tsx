import type { Metadata } from "next";
import Link from "next/link";

// 내부 기록용 메모(사이트 비노출):
// 본 이용약관은 변호사 등 법률 전문가의 검토를 거치지 않은 표준 템플릿 기반 초안이다.
// 일반적인 무료 웹서비스 수준의 관행적 조항으로 구성되었으며, 실제 분쟁 발생 시 법적 효력 및
// 정확성을 보증하지 않는다. 사업 규모 확대, 유료화, 이용자 간 분쟁 발생 가능성 증가 시
// 정식 법률 검토를 받는 것을 권장한다. (기획팀, 2026-07-17)

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "부동산 실거래가 대시보드 서비스 이용조건, 데이터 정확성에 대한 면책, 이용자의 권리·의무를 안내하는 이용약관입니다.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-[2rem]">
        이용약관
      </h1>
      <p className="mt-2 text-xs text-gray-400">시행일자: 2026년 7월 17일</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-gray-600 sm:text-base">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제1조 (목적)
          </h2>
          <p>
            본 약관은 부동산 실거래가 대시보드(이하 &quot;사이트&quot;)가
            제공하는 국토교통부 공공데이터 기반 실거래가 조회 및 AI 맞춤
            추천 서비스(이하 &quot;서비스&quot;)의 이용조건 및 절차, 사이트와
            이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을
            목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제2조 (서비스의 내용)
          </h2>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              사이트는 별도의 회원가입 절차 없이 누구나 무료로 이용할 수
              있는 아파트 매매·전세 실거래가 조회, 지역별 통계, 단지 상세
              정보, AI 맞춤 추천 기능을 제공합니다.
            </li>
            <li>
              서비스의 세부 내용(지원 지역, 건물유형, 제공 기능 등)은 사이트
              사정에 따라 예고 없이 추가, 변경될 수 있습니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제3조 (데이터의 출처 및 특성)
          </h2>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              사이트가 제공하는 실거래가 정보는 국토교통부 실거래가
              공개시스템(공공데이터포털)이 제공하는 원자료를 가공하여
              보여주는 것입니다.
            </li>
            <li>
              부동산 실거래 신고는 계약일로부터 일정 기간 내에 이루어지므로,
              최근 달의 거래 데이터는 신고가 아직 반영되지 않아 건수가
              적거나 비어 있을 수 있습니다. 또한 신고 이후 정정·취소되는
              거래가 있을 수 있어 원자료와 실제 거래 내용에 차이가 발생할 수
              있습니다.
            </li>
            <li>
              사이트는 원자료의 오류, 지연, 정정·취소 등으로 인해 발생하는
              정보의 부정확성에 대해 보증하지 않습니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제4조 (서비스 이용 및 정보 제공의 성격 — 투자 조언 아님)
          </h2>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              사이트가 제공하는 실거래가, 통계, AI 맞춤 추천 등 모든 정보는
              참고용 정보이며, 투자 자문·중개·시세 보증 서비스가 아닙니다.
            </li>
            <li>
              AI 맞춤 추천은 이용자가 입력한 선호도(가격, 역세권, 신축, 평지)에
              따라 후보 단지를 점수화하여 정렬한 결과일 뿐이며, 수익성,
              투자가치, 향후 가격 상승 등을 예측하거나 보장하지 않습니다.
            </li>
            <li>
              이용자는 사이트가 제공하는 정보를 근거로 한 매수·매도 등 모든
              의사결정과 그 결과에 대해 스스로 책임을 지며, 중요한 결정을
              내리기 전 반드시 국토교통부 실거래가 공개시스템 원자료 및 관련
              전문가의 확인을 병행하시기 바랍니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제5조 (이용자의 의무)
          </h2>
          <p>이용자는 서비스 이용 시 다음 각 호의 행위를 하여서는 안 됩니다.</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>
              사이트가 제공하는 콘텐츠(데이터 가공 결과, 텍스트, 디자인 등)를
              사이트의 사전 동의 없이 복제, 배포, 전송하는 행위
            </li>
            <li>
              자동화된 수단(크롤러, 봇 등)을 이용하여 비정상적으로 서비스에
              접근하거나 서버에 과도한 부하를 유발하는 행위
            </li>
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>관련 법령 및 공서양속에 위반되는 행위</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제6조 (서비스 제공의 중단 및 변경)
          </h2>
          <p>
            사이트는 시스템 점검, 서비스 개선, 국토교통부 공공데이터 제공 중단
            또는 정책 변경, 천재지변 등 불가항력적 사유가 있는 경우 서비스
            제공을 일시적으로 중단하거나 서비스의 전부 또는 일부를 변경·종료할
            수 있으며, 이 경우 가능한 사전에 공지합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제7조 (광고 게재)
          </h2>
          <p>
            사이트는 무료 서비스 운영을 위해 향후 Google AdSense 등 제3자 광고
            네트워크를 통해 광고를 게재할 수 있습니다. 광고에 게재된 상품이나
            서비스의 내용, 품질 등에 대한 책임은 원칙적으로 해당 광고주 및
            광고 네트워크에 있으며, 사이트는 이용자와 광고주 간의 거래에
            관여하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제8조 (책임의 한계)
          </h2>
          <ol className="list-inside list-decimal space-y-1">
            <li>
              사이트는 천재지변, 불가항력, 이용자의 귀책사유로 인해 발생한
              서비스 장애에 대해 책임을 지지 않습니다.
            </li>
            <li>
              사이트는 서비스에 게재된 정보의 신뢰도, 정확성 등을 보증하지
              않으며(제3조·제4조 참조), 이용자가 서비스를 이용하여 기대하는
              효과를 얻지 못한 것에 대해 책임을 지지 않습니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제9조 (약관의 변경)
          </h2>
          <p>
            사이트는 관련 법령을 위반하지 않는 범위에서 필요 시 본 약관을
            개정할 수 있으며, 개정 시 적용일자 및 개정 사유를 명시하여 시행일
            이전에 사이트를 통해 공지합니다. 개정약관 공지 후에도 서비스를
            계속 이용하는 경우 약관 변경에 동의한 것으로 간주합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            제10조 (준거법 및 관할)
          </h2>
          <p>
            본 약관과 관련하여 사이트와 이용자 간 분쟁이 발생할 경우 대한민국
            법령을 준거법으로 하며, 관련 소송은 민사소송법상의 관할법원에
            제기합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">부칙</h2>
          <p>본 약관은 2026년 7월 17일부터 시행합니다.</p>
        </section>
      </div>

      <div className="mt-10">
        <Link href="/" className="text-sm text-brand hover:underline">
          ← 홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
