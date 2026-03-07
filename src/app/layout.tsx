import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "35000円レンタカー | 月額定額レンタカー",
  description: "月額35,000円の定額レンタカーサービス。配車サービスあり。ネット予約24時間対応。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Noto+Sans+JP:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
