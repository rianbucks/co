import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: "원산지증명서 (C/O) | 국립방언품질평가원",
  description: "사투리 권역 및 농도 감정 공공서식 모바일 웹 서비스 - 2026 바보톤",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "원산지증명서 (C/O)",
    title: "원산지증명서 (C/O) | 국립방언품질평가원",
    description: "사투리 권역 및 농도 감정 공공서식 모바일 웹 서비스 - 2026 바보톤",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "원산지증명서 사투리 음성 감정" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "원산지증명서 (C/O) | 국립방언품질평가원",
    description: "사투리 권역 및 농도 감정 공공서식 모바일 웹 서비스 - 2026 바보톤",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
