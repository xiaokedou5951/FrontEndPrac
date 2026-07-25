"use client";

import { formatTokenAmount } from "@/lib/viem";
import type { ListingInfo } from "./types";
import type { TokenMetadata } from "@/hooks/useTokenMetadataWagmi";

type Props = {
  listings: ListingInfo[];
  metadata: TokenMetadata | null;
  onSelectListing?: (listingId: bigint) => void;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function ListingsTable({ listings, metadata, onSelectListing }: Props) {
  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";

  if (listings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">活跃上架列表</h3>
        <p className="text-sm text-gray-400">暂无活跃上架</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">活跃上架列表</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-2 py-1">ID</th>
              <th className="px-2 py-1">卖家</th>
              <th className="px-2 py-1">NFT 合约</th>
              <th className="px-2 py-1">Token ID</th>
              <th className="px-2 py-1 text-right">价格</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr
                key={l.listingId.toString()}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                onClick={() => onSelectListing?.(l.listingId)}
              >
                <td className="px-2 py-1 font-mono text-indigo-600">{l.listingId.toString()}</td>
                <td className="px-2 py-1 font-mono" title={l.seller}>{truncate(l.seller)}</td>
                <td className="px-2 py-1 font-mono" title={l.nftContract}>{truncate(l.nftContract)}</td>
                <td className="px-2 py-1 font-mono">{l.tokenId.toString()}</td>
                <td className="px-2 py-1 text-right font-mono">
                  {formatTokenAmount(l.price, decimals, 4)} {symbol}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onSelectListing && (
        <p className="mt-2 text-xs text-gray-400">点击行可自动填入购买 listingId</p>
      )}
    </div>
  );
}
