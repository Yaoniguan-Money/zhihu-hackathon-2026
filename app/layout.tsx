import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "证据链狼人杀",
  description: "工具链骨架（PF0）——产品页面由开发人员 B 实现",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
