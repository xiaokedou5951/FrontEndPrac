"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import {
  getAirdropMerkleAddress,
  getConfigOk,
  getConfigError,
} from "@/config/airdropMerkle";
import { useTokenMetadataWagmi } from "@/hooks/useTokenMetadataWagmi";
import { getMyTokenPermitAddress } from "@/config/shared";
import { useListingsWagmi } from "@/hooks/airdrop-merkle/useListingsWagmi";
import { useAirdropMerkleEventsWagmi } from "@/hooks/airdrop-merkle/useAirdropMerkleEventsWagmi";
import { Card } from "@/components/ui/Card";
import { WalletBar } from "@/components/shared/WalletBar";
import { ApproveNFTCard } from "@/components/airdrop-merkle/ApproveNFTCard";
import { ListCard } from "@/components/airdrop-merkle/ListCard";
import { CancelCard } from "@/components/airdrop-merkle/CancelCard";
import { WhitelistInfoCard } from "@/components/airdrop-merkle/WhitelistInfoCard";
import { ClaimNFTCard } from "@/components/airdrop-merkle/ClaimNFTCard";
import { ListingsTable } from "@/components/airdrop-merkle/ListingsTable";
import { EventLogCard } from "@/components/airdrop-merkle/EventLogCard";

export default function AirdropMerklePage() {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const connected = !!account;

  const configOk = chainId ? getConfigOk(chainId) : false;
  const configError = chainId ? getConfigError(chainId) : null;
  const marketAddress = chainId ? getAirdropMerkleAddress(chainId) : null;

  const metadata = useTokenMetadataWagmi(!!chainId, chainId ? getMyTokenPermitAddress(chainId) : null);
  const listings = useListingsWagmi(configOk);
  const events = useAirdropMerkleEventsWagmi(configOk);

  const refreshListings = useMemo(() => listings.refetch, [listings.refetch]);

  // 点击 listings 行时填入 ClaimNFTCard 的 listingId
  const [listingId, setListingId] = useState("");
  const handleSelectListing = useCallback((id: bigint) => {
    setListingId(id.toString());
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            ← 首页
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            NFT Airdrop <span className="text-indigo-600">(Merkle 白名单 50% 优惠)</span>
          </h1>
          <p className="text-sm text-gray-500">
            Merkle 白名单 + EIP-2612 permit + multicall(delegatecall) 一笔交易完成优惠购买
          </p>
          <p className="mt-1 font-mono text-xs text-gray-400">
            合约：{marketAddress ?? "未连接钱包"}
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

        {/* 核心功能：白名单状态 + 优惠购买 */}
        <WhitelistInfoCard />
        <div className="md:col-span-2">
          <ClaimNFTCard
            metadata={metadata.data}
            listings={listings.data}
            refresh={refreshListings}
            listingId={listingId}
            onListingIdChange={setListingId}
          />
        </div>

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
          metadata={metadata.data}
        />
        <Card title="使用说明">
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              <span className="font-medium text-gray-800">前置条件：</span>
              部署 AirdropMerkleNFTMarket 合约时，merkleRoot 必须等于 proof 后端{" "}
              <code className="rounded bg-gray-100 px-1 font-mono">GET /root</code> 返回值；
              支付代币须为支持 permit 的 MyTokenPermit。
            </p>
            <p>
              <span className="font-medium text-gray-800">卖家：</span>先用「授权 NFT」为市场授权 ERC721，再「上架 NFT」。
            </p>
            <p>
              <span className="font-medium text-gray-800">买家：</span>连接在白名单内的钱包，选择 listing，点击「一键优惠购买」。
              钱包会先弹出 EIP-2612 Permit 签名（授权市场扣 price/2），随后发送一笔 multicall 交易完成扣款与领 NFT。
            </p>
            <p>
              <span className="font-medium text-gray-800">proof 后端：</span>
              <code className="rounded bg-gray-100 px-1 font-mono">wagmi-front/test/airdrop-merkle</code>
              下 <code className="rounded bg-gray-100 px-1 font-mono">npm start</code> 启动（默认 4001）。
            </p>
          </div>
        </Card>
      </div>

      {!connected && (
        <p className="mt-6 text-center text-sm text-gray-400">
          连接钱包后即可上架或白名单优惠购买。
        </p>
      )}
    </main>
  );
}
