import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  ),
  title: "원산지증명서 | 사투리 감정",
  description: "네 가지 질문에 답하고 내 말투와 가까운 지역과 사투리 농도를 확인해 보세요.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "원산지증명서",
    title: "원산지증명서 | 사투리 감정",
    description: "네 가지 질문에 답하고 내 말투와 가까운 지역과 사투리 농도를 확인해 보세요.",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "원산지증명서 사투리 음성 감정" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "원산지증명서 | 사투리 감정",
    description: "네 가지 질문에 답하고 내 말투와 가까운 지역과 사투리 농도를 확인해 보세요.",
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
