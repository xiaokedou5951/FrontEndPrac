"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { MarketLog } from "./types";

type Props = {
  logs: MarketLog[];
  isWatching: boolean;
  error: string | null;
  onClear: () => void;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function truncateTx(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function EventLogCard({ logs, isWatching, error, onClear }: Props) {
  return (
    <Card title="链上事件日志">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isWatching ? "bg-green-500" : "bg-gray-300"}`} />
        <span className="text-xs text-gray-500">{isWatching ? "监听中" : "未监听"}</span>
        {error && <span className="text-xs text-red-500">{error}</span>}
        <Button variant="secondary" size="sm" onClick={onClear} className="ml-auto px-2 py-1 text-xs">
          清空
        </Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">暂无事件</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-1 py-1">事件</th>
                <th className="px-1 py-1">Listing</th>
                <th className="px-1 py-1">详情</th>
                <th className="px-1 py-1">区块</th>
                <th className="px-1 py-1">Tx</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50">
                  <td className="px-1 py-1 font-medium">{log.eventName}</td>
                  <td className="px-1 py-1 font-mono">{log.listingId?.toString() ?? "-"}</td>
                  <td className="px-1 py-1 font-mono text-gray-600">
                    {log.eventName === "NFTSold" && log.buyer && `买家: ${truncate(log.buyer)}`}
                    {log.eventName === "NFTListed" && log.seller && `卖家: ${truncate(log.seller)}`}
                    {log.eventName === "NFTListingCancelled" && "已取消"}
                  </td>
                  <td className="px-1 py-1 font-mono">{log.blockNumber?.toString() ?? "?"}</td>
                  <td className="px-1 py-1 font-mono" title={log.txHash}>{truncateTx(log.txHash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
