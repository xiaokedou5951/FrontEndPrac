"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { chain } from "@/config/shared";
import { nftMarketAddress } from "@/config/nftmarket";
import type { RefreshFn } from "./types";

type Props = {
  refresh: RefreshFn;
};

export function CancelCard({ refresh }: Props) {
  const { account, walletClient, publicClient } = useWallet();
  const [listingId, setListingId] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const canSubmit =
    !!account && !!walletClient && !pending && listingIdNum !== null;

  const handleCancel = async () => {
    if (!account || !walletClient || !nftMarketAddress || listingIdNum === null) return;
    setPending(true);
    setTxError(null);
    setResult(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: nftMarketAddress,
        abi: nftMarketAbi,
        functionName: "cancelListing",
        args: [listingIdNum],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setResult("已取消上架");
      setListingId("");
      await refresh();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

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
              disabled={pending}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Button variant="danger" onClick={handleCancel} disabled={!canSubmit} loading={pending} className="w-full">
            取消上架
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
