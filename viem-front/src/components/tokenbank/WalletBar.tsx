"use client";

import { useWallet } from "@/context/WalletContext";
import { Button } from "@/components/ui/Button";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletBar() {
  const { account, chainId, isConnecting, error, connect, disconnect } = useWallet();

  if (!account) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => connect()} loading={isConnecting}>
          连接钱包
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-sm text-gray-700">
        {truncateAddress(account)}
      </span>
      {chainId !== null && (
        <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
          Chain {chainId}
        </span>
      )}
      <Button variant="secondary" onClick={disconnect}>
        断开
      </Button>
    </div>
  );
}
