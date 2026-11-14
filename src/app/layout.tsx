import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "원산지증명서 (C/O) | 국립방언품질평가원",
  description: "사투리 권역 및 농도 감정 공공서식 모바일 웹 서비스 - 2026 바보톤",
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
