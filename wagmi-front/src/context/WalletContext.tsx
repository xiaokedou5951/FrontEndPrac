"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAccount, useDisconnect, useWalletClient } from "wagmi";
import type { Address, PublicClient, WalletClient } from "viem";
import { getPublicClient } from "@/lib/viem";

type WalletState = {
  account: Address | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const publicClient = useMemo(() => getPublicClient(), []);
  const { address, chainId, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  // 连接动作由 AppKit 的 useAppKit 在 WalletBar 中触发，这里保留 API 兼容性
  const connect = async () => {};

  const value = useMemo<WalletState>(
    () => ({
      account: address ?? null,
      chainId: chainId ?? null,
      isConnecting,
      error: null,
      walletClient: walletClient ?? null,
      publicClient,
      connect,
      disconnect: () => disconnect(),
    }),
    [address, chainId, isConnecting, walletClient, publicClient, disconnect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (ctx === undefined) {
    throw new Error("useWallet 必须在 <WalletProvider> 内使用。");
  }
  return ctx;
}
