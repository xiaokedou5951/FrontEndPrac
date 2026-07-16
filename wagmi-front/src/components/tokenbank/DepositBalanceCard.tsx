import type { Address } from "viem";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
import { formatTokenAmount } from "@/lib/viem";
import { Card } from "@/components/ui/Card";

type Props = {
  account: Address | null;
  depositBalance: bigint | null;
  isLoading: boolean;
  error: Error | null;
  metadata: TokenMetadata | null;
};

export function DepositBalanceCard({
  account,
  depositBalance,
  isLoading,
  error,
  metadata,
}: Props) {
  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";

  return (
    <Card title="银行存款余额">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : isLoading && depositBalance === null ? (
        <p className="text-sm text-gray-400">加载中...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : (
        <p className="font-mono text-2xl font-semibold text-gray-900">
          {depositBalance !== null ? formatTokenAmount(depositBalance, decimals, 6) : "0"}
          <span className="ml-1.5 text-base font-normal text-gray-500">{symbol}</span>
        </p>
      )}
    </Card>
  );
}
