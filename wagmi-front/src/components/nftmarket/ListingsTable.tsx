"use client";

import { Card } from "@/components/ui/Card";
import { formatTokenAmount } from "@/lib/viem";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
import type { ListingInfo } from "./types";

type Props = {
  listings: ListingInfo[];
  isLoading: boolean;
  error: string | null;
  metadata: TokenMetadata | null;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function ListingsTable({ listings, isLoading, error, metadata }: Props) {
  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";

  return (
    <Card title={`活跃上架 (${listings.length})`}>
      {isLoading && listings.length === 0 ? (
        <p className="text-sm text-gray-400">加载中...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : listings.length === 0 ? (
        <p className="text-sm text-gray-400">暂无活跃上架</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="pb-2 pr-3 font-medium">ID</th>
                <th className="pb-2 pr-3 font-medium">卖家</th>
                <th className="pb-2 pr-3 font-medium">NFT 合约</th>
                <th className="pb-2 pr-3 font-medium">Token ID</th>
                <th className="pb-2 pr-3 font-medium">价格</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.listingId.toString()} className="border-t border-gray-100">
                  <td className="py-2 pr-3 font-mono text-gray-900">{l.listingId.toString()}</td>
                  <td className="py-2 pr-3 font-mono text-gray-600" title={l.seller}>
                    {truncate(l.seller)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-600" title={l.nftContract}>
                    {truncate(l.nftContract)}
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-600">{l.tokenId.toString()}</td>
                  <td className="py-2 pr-3 font-mono text-gray-900">
                    {formatTokenAmount(l.price, decimals, 6)} {symbol}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
