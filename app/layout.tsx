import type { Metadata } from "next";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convexClient } from "@/lib/convex-client";
import { GameProvider } from "@/context/GameContext";
import Toaster from "@/components/ui/Toaster";
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
      <body className="min-h-full bg-night text-paper antialiased">
        <ConvexAuthProvider client={convexClient}>
          <GameProvider>
            {children}
            <Toaster />
          </GameProvider>
        </ConvexAuthProvider>
      </body>
    </html>
  );
}
