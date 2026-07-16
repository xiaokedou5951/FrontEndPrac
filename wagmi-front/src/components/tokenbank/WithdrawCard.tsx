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
  depositBalance: bigint | null;
  metadata: TokenMetadata | null;
  refresh: RefreshFns;
};

export function WithdrawCard({ depositBalance, metadata, refresh }: Props) {
  const { account, walletClient, publicClient } = useWallet();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const parsedAmount = safeParseTokenAmount(amount, decimals);

  const exceedsDeposit = depositBalance !== null && parsedAmount > depositBalance;

  const handleWithdraw = async () => {
    if (!account || !walletClient || !tokenBankAddress) return;
    if (parsedAmount <= 0n || exceedsDeposit) return;
    setPending(true);
    setTxError(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: tokenBankAddress,
        abi: tokenBankAbi,
        functionName: "withdraw",
        args: [parsedAmount],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setAmount("");
      await Promise.all([refresh.deposit(), refresh.balance()]);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const canSubmit =
    !!account && !!walletClient && !pending && parsedAmount > 0n && !exceedsDeposit;

  const handleMax = () => {
    if (depositBalance === null) return;
    setAmount(formatTokenAmount(depositBalance, decimals));
  };

  return (
    <Card title="取款">
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
          {exceedsDeposit && (
            <p className="text-sm text-red-600">取款金额超过存款余额</p>
          )}
          <Button
            variant="danger"
            onClick={handleWithdraw}
            disabled={!canSubmit}
            loading={pending}
            className="w-full"
          >
            取款
          </Button>
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
