"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import {
  getNftMarketPermitAddress,
  getConfigOk,
  getConfigError,
} from "@/config/nftMarketPermit";
import { useTokenMetadataWagmi } from "@/hooks/useTokenMetadataWagmi";
import { useListingsWagmi } from "@/hooks/nftmarket-permit/useListingsWagmi";
import { useNFTMarketPermitEventsWagmi } from "@/hooks/nftmarket-permit/useNFTMarketPermitEventsWagmi";
import { Card } from "@/components/ui/Card";
import { WalletBar } from "@/components/shared/WalletBar";
import { ApproveNFTCard } from "@/components/nftmarket-permit/ApproveNFTCard";
import { ListCard } from "@/components/nftmarket-permit/ListCard";
import { CancelCard } from "@/components/nftmarket-permit/CancelCard";
import { SignPermitCard } from "@/components/nftmarket-permit/SignPermitCard";
import { PermitBuyCard } from "@/components/nftmarket-permit/PermitBuyCard";
import { ListingsTable } from "@/components/nftmarket-permit/ListingsTable";
import { EventLogCard } from "@/components/nftmarket-permit/EventLogCard";
import { SignerInfoCard } from "@/components/nftmarket-permit/SignerInfoCard";

export default function NFTMarketWhitePage() {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const connected = !!account;

  const configOk = chainId ? getConfigOk(chainId) : false;
  const configError = chainId ? getConfigError(chainId) : null;
  const nftMarketPermitAddress = chainId ? getNftMarketPermitAddress(chainId) : null;

  const metadata = useTokenMetadataWagmi(!!chainId);
  const listings = useListingsWagmi(configOk);
  const events = useNFTMarketPermitEventsWagmi(configOk);

  const refreshListings = useMemo(() => listings.refetch, [listings.refetch]);

  // 点击 listings 行时填入 PermitBuyCard 的 listingId
  const [selectedListingId, setSelectedListingId] = useState<bigint | null>(null);
  const handleSelectListing = useCallback((listingId: bigint) => {
    setSelectedListingId(listingId);
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            ← 首页
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            NFT Market <span className="text-indigo-600">(白名单购买)</span>
          </h1>
          <p className="text-sm text-gray-500">
            项目方签名授权白名单用户购买 NFT（EIP-712 签名验证）
          </p>
          <p className="mt-1 font-mono text-xs text-gray-400">
            合约：{nftMarketPermitAddress ?? "未连接钱包"}
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
        {/* 卖家操作 */}
        <ApproveNFTCard />
        <ListCard metadata={metadata.data} refresh={refreshListings} />
        <CancelCard refresh={refreshListings} />

        {/* 核心功能：项目方签名 + 白名单购买 */}
        <SignPermitCard />
        <PermitBuyCard
          metadata={metadata.data}
          listings={listings.data}
          refresh={refreshListings}
        />

        {/* 上架列表 */}
        <div className="md:col-span-2 lg:col-span-3">
          <ListingsTable
            listings={listings.data}
            metadata={metadata.data}
            onSelectListing={handleSelectListing}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <EventLogCard
          logs={events.logs}
          isWatching={events.isWatching}
          error={events.error}
          onClear={events.clear}
        />
        <SignerInfoCard />
      </div>

      {!connected && (
        <p className="mt-6 text-center text-sm text-gray-400">
          连接钱包后即可上架、签名授权或白名单购买。
        </p>
      )}
    </main>
  );
}
