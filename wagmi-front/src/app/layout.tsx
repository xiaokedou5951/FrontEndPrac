import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { WalletProvider } from "@/context/WalletContext";
import { wagmiConfig } from "@/lib/wagmi";
import "./globals.css";

const queryClient = new QueryClient();

export const metadata: Metadata = {
  title: "TokenBank Demo",
  description: "基于 Next.js + Viem v2 的链上合约交互演示",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <WagmiProvider config={wagmiConfig}>
          <QueryClientProvider client={queryClient}>
            <WalletProvider>{children}</WalletProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
