"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { nftMarketAddress, configOk, configError } from "@/config/nftmarket";
import { tokenAddress } from "@/config/shared";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { useListings } from "@/hooks/nftmarket/useListings";
import { useNFTMarketEvents } from "@/hooks/nftmarket/useNFTMarketEvents";
import { Card } from "@/components/ui/Card";
import { WalletBar } from "@/components/shared/WalletBar";
import { ListCard } from "@/components/nftmarket/ListCard";
import { ApproveNFTCard } from "@/components/nftmarket/ApproveNFTCard";
import { BuyCard } from "@/components/nftmarket/BuyCard";
import { CancelCard } from "@/components/nftmarket/CancelCard";
import { ListingsTable } from "@/components/nftmarket/ListingsTable";
import { EventLogCard } from "@/components/nftmarket/EventLogCard";

export default function NFTMarketPage() {
  const { account } = useWallet();
  const connected = !!account;

  // paymentToken 与 MyERC20 一致，复用代币元数据用于价格展示
  const metadata = useTokenMetadata(!!tokenAddress);
  const listings = useListings(configOk);
  const events = useNFTMarketEvents(configOk);

  const refreshListings = useMemo(() => listings.refetch, [listings.refetch]);

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
            中配置 NEXT_PUBLIC_NFT_MARKET_ADDRESS 后重启开发服务器。
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            ← 首页
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">NFT Market</h1>
          <p className="text-sm text-gray-500">上架 / 购买 / 取消，并实时监听链上事件</p>
          <p className="mt-1 font-mono text-xs text-gray-400">
            合约：{nftMarketAddress}
          </p>
        </div>
        <WalletBar />
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ApproveNFTCard />
        <ListCard metadata={metadata.data} refresh={refreshListings} />
        <CancelCard refresh={refreshListings} />
        <BuyCard
          metadata={metadata.data}
          listings={listings.data}
          refresh={refreshListings}
        />
        <div className="md:col-span-2 lg:col-span-2">
          <ListingsTable
            listings={listings.data}
            isLoading={listings.isLoading}
            error={listings.error}
            metadata={metadata.data}
          />
        </div>
      </div>

      <div className="mt-4">
        <EventLogCard
          logs={events.logs}
          isWatching={events.isWatching}
          error={events.error}
          metadata={metadata.data}
          onClear={events.clear}
        />
      </div>

      {!connected && (
        <p className="mt-6 text-center text-sm text-gray-400">
          连接钱包后即可上架、购买或取消上架。
        </p>
      )}
    </main>
  );
}
