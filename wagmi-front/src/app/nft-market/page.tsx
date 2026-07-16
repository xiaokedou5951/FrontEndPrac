"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { getNftMarketAddress, getConfigOk, getConfigError } from "@/config/nftmarket";
import { useTokenMetadataWagmi } from "@/hooks/useTokenMetadataWagmi";
import { useListingsWagmi } from "@/hooks/nftmarket/useListingsWagmi";
import { useNFTMarketEventsWagmi } from "@/hooks/nftmarket/useNFTMarketEventsWagmi";
import { Card } from "@/components/ui/Card";
import { WalletBar } from "@/components/shared/WalletBar";
import { ListCard } from "@/components/nftmarket/ListCard";
import { ApproveNFTCard } from "@/components/nftmarket/ApproveNFTCard";
import { BuyCard } from "@/components/nftmarket/BuyCard";
import { CancelCard } from "@/components/nftmarket/CancelCard";
import { ListingsTable } from "@/components/nftmarket/ListingsTable";
import { EventLogCard } from "@/components/nftmarket/EventLogCard";

export default function NFTMarketPage() {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const connected = !!account;

  const configOk = chainId ? getConfigOk(chainId) : false;
  const configError = chainId ? getConfigError(chainId) : null;
  const nftMarketAddress = chainId ? getNftMarketAddress(chainId) : null;

  const metadata = useTokenMetadataWagmi(!!chainId);
  const listings = useListingsWagmi(configOk);
  const events = useNFTMarketEventsWagmi(configOk);

  const refreshListings = useMemo(() => listings.refetch, [listings.refetch]);

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
            合约：{nftMarketAddress ?? "未连接钱包"}
          </p>
        </div>
        <WalletBar />
      </header>

      {chainId && !configOk && (
        <Card title="配置缺失" className="mb-4">
          <p className="text-sm text-red-600">{configError}</p>
          <p className="mt-3 text-sm text-gray-500">
            请在{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              wagmi-front/.env.local
            </code>{" "}
            中配置当前链的合约地址后重启开发服务器。
          </p>
        </Card>
      )}

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