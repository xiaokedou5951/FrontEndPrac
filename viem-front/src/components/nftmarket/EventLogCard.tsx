"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/viem";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
import type { MarketLog } from "./types";

type Props = {
  logs: MarketLog[];
  isWatching: boolean;
  error: string | null;
  metadata: TokenMetadata | null;
  onClear: () => void;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function eventBadgeClass(eventName: MarketLog["eventName"]): string {
  switch (eventName) {
    case "NFTListed":
      return "bg-green-50 text-green-700";
    case "NFTSold":
      return "bg-indigo-50 text-indigo-700";
    case "NFTListingCancelled":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function eventLabel(eventName: MarketLog["eventName"]): string {
  switch (eventName) {
    case "NFTListed":
      return "上架";
    case "NFTSold":
      return "售出";
    case "NFTListingCancelled":
      return "取消";
    default:
      return eventName;
  }
}

export function EventLogCard({ logs, isWatching, error, metadata, onClear }: Props) {
  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";

  return (
    <Card title="链上事件日志（后台监听）">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={[
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
            isWatching ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              isWatching ? "animate-pulse bg-green-500" : "bg-gray-400",
            ].join(" ")}
          />
          {isWatching ? "监听中" : "未启动"}
        </span>
        <Button variant="secondary" onClick={onClear} className="px-2 py-1 text-xs">
          清空
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-600">监听失败：{error}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400">
          暂无事件。链上发生上架、买卖或取消时，日志会实时显示在这里，并同时打印到浏览器控制台（F12）。
        </p>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${eventBadgeClass(log.eventName)}`}
                >
                  {eventLabel(log.eventName)}
                </span>
                <span className="font-mono text-gray-400">
                  block {log.blockNumber?.toString() ?? "?"}
                </span>
              </div>
              <div className="space-y-0.5 font-mono text-gray-600">
                <div>listingId: {log.listingId?.toString() ?? "?"}</div>
                {log.seller && <div title={log.seller}>seller: {truncate(log.seller)}</div>}
                {log.buyer && <div title={log.buyer}>buyer: {truncate(log.buyer)}</div>}
                {log.nftContract && (
                  <div title={log.nftContract}>nft: {truncate(log.nftContract)}</div>
                )}
                {log.tokenId !== undefined && <div>tokenId: {log.tokenId.toString()}</div>}
                {log.price !== undefined && (
                  <div>
                    price: {formatTokenAmount(log.price, decimals, 6)} {symbol}
                  </div>
                )}
                <div className="truncate text-gray-400" title={log.txHash}>
                  tx: {log.txHash}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
