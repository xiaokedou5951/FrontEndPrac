"use client";

import { useWallet } from "@/context/WalletContext";
import { useTransfers } from "@/hooks/erc20-index-tx/useTransfers";
import { TransfersTable } from "@/components/erc20-index-tx/TransfersTable";
import { WalletBar } from "@/components/shared/WalletBar";

export default function ERC20IndexTxPage() {
  const { account } = useWallet();
  const { transfers, loading, error, total } = useTransfers();

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <WalletBar />

        <div className="mt-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ERC20 转账记录
          </h1>
          <p className="text-gray-600 mb-6">
            查看您的代币转账历史记录
          </p>

          {!account ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              请先连接钱包查看转账记录
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  共 <span className="font-semibold">{total}</span> 条记录
                </div>
              </div>

              <TransfersTable transfers={transfers} loading={loading} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}