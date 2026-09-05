import type { Metadata } from "next";
import { GameProvider } from "@/context/GameContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "证据链狼人杀 - Evidence Chain",
  description: "AI时代信息辨别能力培养：找出篡改真相的人",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body className="min-h-full bg-slate-950 text-slate-100 antialiased">
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
