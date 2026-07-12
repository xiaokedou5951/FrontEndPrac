"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatTokenAmount, safeParseTokenAmount } from "@/lib/viem";
import { erc20Abi } from "@/contracts/abis";
import { tokenAddress, tokenBankAddress, chain } from "@/config/contracts";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
import type { RefreshFns } from "./types";

type Props = {
  allowance: bigint | null;
  metadata: TokenMetadata | null;
  refresh: RefreshFns;
};

export function AllowanceCard({ allowance, metadata, refresh }: Props) {
  const { account, walletClient, publicClient } = useWallet();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const parsedAmount = safeParseTokenAmount(amount, decimals);

  const handleApprove = async () => {
    if (!account || !walletClient || !tokenAddress || !tokenBankAddress) return;
    if (parsedAmount <= 0n) return;
    setPending(true);
    setTxError(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [tokenBankAddress, parsedAmount],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setAmount("");
      await Promise.all([refresh.allowance(), refresh.balance()]);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const canSubmit = !!account && !!walletClient && !pending && parsedAmount > 0n;

  return (
    <Card title="授权额度">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-500">当前授权额度</span>
            <span className="font-mono text-sm text-gray-900">
              {allowance !== null ? formatTokenAmount(allowance, decimals, 6) : "—"} {symbol}
            </span>
          </div>
          <AmountInput
            value={amount}
            onChange={setAmount}
            suffix={symbol}
            disabled={pending}
          />
          <Button onClick={handleApprove} disabled={!canSubmit} loading={pending} className="w-full">
            授权
          </Button>
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
