import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import CrossSiteNav from "@/components/CrossSiteNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleSiteVerification =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined;
const naverSiteVerification =
  process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "부동산 실거래가 대시보드",
    template: "%s | 부동산 실거래가 대시보드",
  },
  description:
    "국토교통부 실거래가 공개시스템 공공데이터를 기반으로 지역별 아파트 매매·전세 실거래가와 월별 추이를 조회하고, AI 맞춤 추천까지 받아보세요.",
  openGraph: {
    title: "부동산 실거래가 대시보드",
    description:
      "국토교통부 실거래가 공개시스템 공공데이터를 기반으로 지역별 아파트 매매·전세 실거래가와 월별 추이를 조회하고, AI 맞춤 추천까지 받아보세요.",
    url: SITE_URL,
    siteName: "부동산 실거래가 대시보드",
    locale: "ko_KR",
    type: "website",
  },
  // 구글 서치콘솔·네이버 서치어드바이저 소유확인 코드를 받으면 아래 환경변수에
  // 값만 넣으면 자동으로 적용된다(값이 없으면 필드가 비워져 렌더링에 영향 없음).
  // NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION / NEXT_PUBLIC_NAVER_SITE_VERIFICATION
  verification: {
    google: googleSiteVerification,
    other: naverSiteVerification
      ? { "naver-site-verification": naverSiteVerification }
      : undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        {children}
        {/*
          탭 순서상 본문 다음에 마운트(계산기 허브 design/cross-site-nav-widget-spec.md §9).
          이 프로젝트는 SiteFooter 공용 컴포넌트가 없어 {children} 바로 다음에 둔다.
          position: fixed라 시각적 위치는 DOM 순서와 무관하지만, 키보드 사용자가 매
          페이지에서 실제 콘텐츠보다 이 위젯을 먼저 지나치지 않도록 마지막에 둔다.
        */}
        <CrossSiteNav currentSiteId="realestate-hub" />
      </body>
    </html>
  );
}
