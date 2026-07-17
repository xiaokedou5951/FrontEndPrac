"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { getNftMarketAddress } from "@/config/nftmarket";
import type { RefreshFn } from "./types";

type Props = {
  refresh: RefreshFn;
};

export function CancelCard({ refresh }: Props) {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const [listingId, setListingId] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const nftMarketAddress = chainId ? getNftMarketAddress(chainId) : null;
  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const canSubmit =
    !!account && !isPending && listingIdNum !== null && !!nftMarketAddress;

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleCancel = async () => {
    if (!account || !nftMarketAddress || listingIdNum === null) return;
    setTxError(null);
    setResult(null);
    try {
      await writeContract({
        address: nftMarketAddress,
        abi: nftMarketAbi,
        functionName: "cancelListing",
        args: [listingIdNum],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  // 使用 useEffect 处理交易确认和错误状态
  useEffect(() => {
    if (isConfirmed && txHash) {
      setResult("已取消上架");
      setListingId("");
      refresh();
    }
  }, [isConfirmed, txHash, refresh]);

  useEffect(() => {
    if (error) {
      setTxError(error.message);
    }
  }, [error]);

  return (
    <Card title="取消上架">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Listing ID</label>
            <input
              type="text"
              inputMode="numeric"
              value={listingId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) setListingId(v);
              }}
              placeholder="0"
              disabled={isPending || isConfirming}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button variant="danger" onClick={handleCancel} disabled={!canSubmit} loading={isPending || isConfirming} className="w-full">
            {isConfirming ? "确认中..." : isPending ? "取消中..." : "取消上架"}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}