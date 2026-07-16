"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatTokenAmount, safeParseTokenAmount } from "@/lib/viem";
import { tokenBankAbi } from "@/contracts/tokenBankAbi";
import { chain } from "@/config/shared";
import { tokenBankAddress } from "@/config/tokenbank";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
import type { RefreshFns } from "./types";

type Props = {
  balance: bigint | null;
  allowance: bigint | null;
  metadata: TokenMetadata | null;
  refresh: RefreshFns;
};

export function DepositCard({ balance, allowance, metadata, refresh }: Props) {
  const { account, walletClient, publicClient } = useWallet();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const parsedAmount = safeParseTokenAmount(amount, decimals);

  const exceedsBalance = balance !== null && parsedAmount > balance;
  const insufficientAllowance =
    allowance !== null && parsedAmount > 0n && parsedAmount > allowance;

  const handleDeposit = async () => {
    if (!account || !walletClient || !tokenBankAddress) return;
    if (parsedAmount <= 0n || exceedsBalance || insufficientAllowance) return;
    setPending(true);
    setTxError(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: tokenBankAddress,
        abi: tokenBankAbi,
        functionName: "deposit",
        args: [parsedAmount],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setAmount("");
      await Promise.all([refresh.balance(), refresh.deposit(), refresh.allowance()]);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const canSubmit =
    !!account &&
    !!walletClient &&
    !pending &&
    parsedAmount > 0n &&
    !exceedsBalance &&
    !insufficientAllowance;

  const handleMax = () => {
    if (balance === null) return;
    const max = allowance !== null && allowance < balance ? allowance : balance;
    setAmount(formatTokenAmount(max, decimals));
  };

  return (
    <Card title="存款">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-3">
          <AmountInput
            value={amount}
            onChange={setAmount}
            onMax={handleMax}
            suffix={symbol}
            disabled={pending}
          />
          {exceedsBalance && (
            <p className="text-sm text-red-600">存款金额超过钱包余额</p>
          )}
          {insufficientAllowance && !exceedsBalance && (
            <p className="text-sm text-amber-600">
              授权额度不足，请先授权至少 {formatTokenAmount(parsedAmount, decimals, 6)} {symbol}
            </p>
          )}
          <Button onClick={handleDeposit} disabled={!canSubmit} loading={pending} className="w-full">
            存款
          </Button>
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
