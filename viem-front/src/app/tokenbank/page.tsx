"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { configOk, configError, tokenBankAddress } from "@/config/tokenbank";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { useTokenBalance } from "@/hooks/tokenbank/useTokenBalance";
import { useAllowance } from "@/hooks/tokenbank/useAllowance";
import { useDepositBalance } from "@/hooks/tokenbank/useDepositBalance";
import { Card } from "@/components/ui/Card";
import { WalletBar } from "@/components/shared/WalletBar";
import { TokenBalanceCard } from "@/components/tokenbank/TokenBalanceCard";
import { AllowanceCard } from "@/components/tokenbank/AllowanceCard";
import { DepositCard } from "@/components/tokenbank/DepositCard";
import { DepositBalanceCard } from "@/components/tokenbank/DepositBalanceCard";
import { WithdrawCard } from "@/components/tokenbank/WithdrawCard";
import type { RefreshFns } from "@/components/tokenbank/types";

export default function TokenBankPage() {
  const { account } = useWallet();
  const connected = !!account;

  const metadata = useTokenMetadata(configOk);
  const balance = useTokenBalance(account, connected && configOk);
  const allowance = useAllowance(account, tokenBankAddress, connected && configOk);
  const deposit = useDepositBalance(account, connected && configOk);

  const refresh = useMemo<RefreshFns>(
    () => ({
      balance: balance.refetch,
      allowance: allowance.refetch,
      deposit: deposit.refetch,
    }),
    [balance.refetch, allowance.refetch, deposit.refetch],
  );

  if (!configOk) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card title="配置缺失">
          <p className="text-sm text-red-600">{configError}</p>
          <p className="mt-3 text-sm text-gray-500">
            请在{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              viem-front/.env.local
            </code>{" "}
            中配置合约地址后重启开发服务器。
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
          >
            ← 返回首页
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← 首页
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">TokenBank</h1>
          <p className="text-sm text-gray-500">存款 / 取款 / 授权额度</p>
        </div>
        <WalletBar />
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <TokenBalanceCard
          account={account}
          balance={balance.data}
          isLoading={balance.isLoading}
          error={balance.error}
          metadata={metadata.data}
        />
        <DepositBalanceCard
          account={account}
          depositBalance={deposit.data}
          isLoading={deposit.isLoading}
          error={deposit.error}
          metadata={metadata.data}
        />
        <AllowanceCard
          allowance={allowance.data}
          metadata={metadata.data}
          refresh={refresh}
        />
        <DepositCard
          balance={balance.data}
          allowance={allowance.data}
          metadata={metadata.data}
          refresh={refresh}
        />
        <WithdrawCard
          depositBalance={deposit.data}
          metadata={metadata.data}
          refresh={refresh}
        />
      </div>
    </main>
  );
}
