import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "커플들이 집착하는 AI 심판이 되었다",
  description: "대국 문법으로 대화를 시작하게 돕는 AI 메신저",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
