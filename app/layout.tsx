import type { Metadata, Viewport } from "next";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convexClient } from "@/lib/convex-client";
import { GameProvider } from "@/context/GameContext";
import Toaster from "@/components/ui/Toaster";
import BgmStarter from "@/components/ui/BgmStarter";
import "./globals.css";

export const metadata: Metadata = {
  title: "证据链狼人杀 - Evidence Chain",
  description: "AI时代信息辨别能力培养：找出篡改真相的人",
};

// 移动端：viewport-fit=cover 配合安全区内边距（底部输入条 pb-[env(safe-area-inset-bottom)]）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171430",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body className="min-h-full bg-night text-paper antialiased">
        <ConvexAuthProvider client={convexClient}>
          <GameProvider>
            {children}
            <Toaster />
            <BgmStarter />
          </GameProvider>
        </ConvexAuthProvider>
      </body>
    </html>
  );
}
