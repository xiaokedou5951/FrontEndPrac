import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WalletProvider } from "@/context/WalletContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "TokenBank Demo",
  description: "基于 Next.js + Viem v2 的链上合约交互演示",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
