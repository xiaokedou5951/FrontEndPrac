"use client";

import { useAppKit } from "@reown/appkit/react";
import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/Button";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getChainDisplayName(chainId: number): string {
  switch (chainId) {
    case 31337:
      return "Local";
    case 11155111:
      return "Sepolia";
    case 137:
      return "Polygon";
    default:
      return `Chain ${chainId}`;
  }
}

export function WalletBar() {
  const { open } = useAppKit();
  const { account, chainId, isConnecting, disconnect } = useWallet();

  if (!account) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => open()} loading={isConnecting}>
          连接钱包
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-sm text-gray-700">
        {truncateAddress(account)}
      </span>
      <Button variant="secondary" size="sm" onClick={() => open({ view: "Networks" })}>
        {chainId ? getChainDisplayName(chainId) : "选择网络"}
      </Button>
      <Button variant="secondary" onClick={disconnect}>
        断开
      </Button>
    </div>
  );
}
