import type { Metadata } from "next";
import Link from "next/link";

// 내부 기록용 메모(사이트 비노출):
// 본 개인정보처리방침은 변호사 등 법률 전문가의 검토를 거치지 않은 표준 템플릿 기반 초안이다.
// 일반적인 개인/소규모 프로젝트 수준의 관행적 문구로 작성되었으며, 실제 법적 리스크(개인정보보호법 등)에
// 대한 정확성을 보증하지 않는다. 회원가입 기능 도입, 유료화, 대량 트래픽 발생 등 상황 변화 시
// 정식 법률 검토를 다시 받는 것을 권장한다. (기획팀, 2026-07-17)

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description:
    "부동산 실거래가 대시보드의 개인정보 수집·이용 및 쿠키, 광고 게재와 관련된 개인정보처리방침을 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-[2rem]">
        개인정보처리방침
      </h1>
      <p className="mt-2 text-xs text-gray-400">시행일자: 2026년 7월 17일</p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-gray-600 sm:text-base">
        <p>
          부동산 실거래가 대시보드(이하 &quot;사이트&quot;)는 국토교통부
          실거래가 공개시스템(공공데이터포털)의 공공데이터를 조회하여 보여주는
          정보 제공 서비스입니다. 사이트는 별도의 회원가입·로그인 절차가
          없으며, 아래와 같이 개인정보처리방침을 안내합니다.
        </p>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            1. 수집하는 개인정보 항목
          </h2>
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-semibold text-gray-800">
                가. 사이트가 별도로 수집·저장하는 개인정보는 없습니다.
              </p>
              <p className="mt-1">
                지역 선택, 조회 조건(매매/전세, 건물유형), AI 맞춤 추천의
                선호도 입력값 등은 조회 결과를 만들기 위해 브라우저에서
                서버로 전달되지만, 이용자를 식별할 수 있는 개인정보가 아니며
                별도의 회원 데이터베이스에 저장되지 않습니다.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                나. 사이트 이용 과정에서 자동으로 수집되는 정보
              </p>
              <p className="mt-1">
                접속 IP 주소, 방문 일시, 브라우저 및 기기 정보, 방문 페이지
                기록 등이 서버 로그 또는 방문 통계 분석 도구를 통해 자동으로
                수집될 수 있습니다.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                다. 광고 게재 관련 정보
              </p>
              <p className="mt-1">
                이 사이트는 향후 Google AdSense 등 광고 서비스를 게재할 수
                있으며, Google을 포함한 제3자 공급업체는 쿠키를 사용해
                사용자의 이전 방문 기록을 기반으로 광고를 게재합니다. 사용자는{" "}
                <a
                  href="https://adssettings.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  Google 광고 설정(adssettings.google.com)
                </a>
                에서 맞춤 광고를 해제할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            2. 개인정보의 수집 목적
          </h2>
          <ul className="list-inside list-disc space-y-1">
            <li>실거래가 조회, AI 맞춤 추천 등 사이트 서비스 제공 및 운영</li>
            <li>방문 통계 분석을 통한 서비스 품질 개선</li>
            <li>(향후 승인 시) Google AdSense를 통한 광고 게재</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            3. 개인정보의 보유 및 이용 기간
          </h2>
          <p>
            사이트는 조회 조건 등 입력값을 이용자 식별 정보와 결합하여 저장하지
            않으므로 별도의 보유기간이 존재하지 않습니다. 방문 로그 및
            쿠키는 각 서비스(방문 통계 분석 도구, Google AdSense)의 자체
            보유기간 정책을 따릅니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            4. 개인정보의 제3자 제공 및 쿠키 안내
          </h2>
          <div className="flex flex-col gap-3">
            <p>
              사이트는 이용자의 개인정보를 원칙적으로 외부에 제공하지
              않습니다. 다만 아래와 같이 제3자 서비스를 이용하고 있으며, 이
              과정에서 쿠키를 통한 정보 수집이 발생할 수 있습니다.
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong className="font-semibold text-gray-800">
                  Google AdSense
                </strong>
                : (향후 승인 시) 광고 게재를 위해 쿠키 및 광고 식별자를
                사용하여 이용자의 관심사에 기반한 맞춤형 광고를 제공할 수
                있습니다.
              </li>
              <li>
                <strong className="font-semibold text-gray-800">
                  방문 통계 분석 도구(예: Google Analytics 등)
                </strong>
                : 방문자 수, 유입 경로, 이용 패턴 분석을 위해 쿠키를 사용할
                수 있습니다.
              </li>
            </ul>
            <p>
              Google을 비롯한 제3자 공급업체는 쿠키를 사용해 이용자가 본
              사이트 및 다른 사이트를 방문한 기록을 바탕으로 광고를 게재할 수
              있습니다. Google의 개인정보처리방침은{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-2"
              >
                https://policies.google.com/privacy
              </a>
              에서 확인하실 수 있습니다. 이용자는 아래 경로를 통해 맞춤형
              광고 수신을 원하지 않을 경우 설정을 변경할 수 있습니다.
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                Google 광고 설정:{" "}
                <a
                  href="https://adssettings.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  https://adssettings.google.com
                </a>
              </li>
              <li>
                온라인 맞춤형 광고 선택 관리:{" "}
                <a
                  href="https://www.aboutads.info/choices"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  https://www.aboutads.info/choices
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            5. 쿠키(Cookie)의 운영 및 거부
          </h2>
          <p>
            쿠키란 웹사이트 운영에 이용되는 서버가 이용자의 브라우저에
            전송하는 소량의 정보입니다. 사이트는 방문 통계 분석 및(향후)
            광고 게재를 위해 쿠키를 사용할 수 있습니다. 이용자는 웹브라우저
            설정을 통해 쿠키 저장을 거부하거나 이미 저장된 쿠키를 삭제할 수
            있습니다. 다만 쿠키 저장을 거부할 경우 일부 서비스(맞춤형 광고
            등) 이용에 제한이 있을 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            6. 이용자의 권리
          </h2>
          <p>
            사이트는 회원가입 없이 이용 가능하며 이용자를 식별하는 개인정보를
            보유하지 않으므로, 원칙적으로 개인정보에 대한 열람·정정·삭제
            요청 대상이 존재하지 않습니다. 다만 문의 등을 통해 개인정보와
            관련된 사항을 전달주신 경우, 아래 문의처로 연락 주시면 지체 없이
            확인하고 조치하겠습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            7. 개인정보의 안전성 확보조치
          </h2>
          <p>
            사이트는 별도의 회원 데이터베이스를 운영하지 않으며, 조회를 위해
            일시적으로 처리되는 정보 외에 개인을 식별할 수 있는 정보를 보관하지
            않습니다. 개인정보가 분실, 도난, 유출, 변조되지 않도록 합리적인
            수준의 주의를 기울입니다.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            8. 문의처
          </h2>
          <p>
            개인정보 관련 문의사항은 사이트 운영자에게 문의해 주시기
            바랍니다. (문의 채널은 추후 확정 시 본 페이지에 안내합니다.)
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            9. 고지의 의무
          </h2>
          <p>
            이 개인정보처리방침은 관련 법령, 정책 또는 사이트 운영 방침
            변경에 따라 수정될 수 있으며, 내용이 변경되는 경우 본 페이지를
            통해 고지합니다.
          </p>
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
