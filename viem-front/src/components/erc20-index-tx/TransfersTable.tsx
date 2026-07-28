"use client";

import type { TransferRecord } from "@/lib/database";
import { formatTokenAmount } from "@/lib/viem";

function shortAddress(addr: string): string {
  if (!addr) return "0x0000...0000";
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function shortTxHash(hash: string): string {
  if (!hash) return "0x0000...0000";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

type TransfersTableProps = {
  transfers: TransferRecord[];
  loading: boolean;
};

export function TransfersTable({ transfers, loading }: TransfersTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        加载中...
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        暂无转账记录
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                交易哈希
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                区块
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                发送方
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                接收方
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                金额
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                时间
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transfers.map((transfer) => (
              <tr key={transfer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                  <span title={transfer.txHash}>{shortTxHash(transfer.txHash)}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {transfer.blockNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span title={transfer.fromAddress}>
                    {shortAddress(transfer.fromAddress)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span title={transfer.toAddress}>
                    {shortAddress(transfer.toAddress)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatTokenAmount(BigInt(transfer.value), 18, 6)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {transfer.timestamp
                    ? new Date(transfer.timestamp * 1000).toLocaleString("zh-CN")
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}