"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/viem";
import { erc20Abi } from "@/contracts/erc20Abi";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { getTokenAddress } from "@/config/shared";
import { getNftMarketAddress } from "@/config/nftmarket";
import type { TokenMetadata } from "@/hooks/useTokenMetadataWagmi";
import type { ListingInfo, RefreshFn } from "./types";

type Props = {
  metadata: TokenMetadata | null;
  listings: ListingInfo[];
  refresh: RefreshFn;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function BuyCard({ metadata, listings, refresh }: Props) {
  const { chainId } = useAccount();
  const { account, publicClient } = useWallet();
  const [listingId, setListingId] = useState("");
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [action, setAction] = useState<"buy" | "approve" | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const tokenAddress = chainId ? getTokenAddress(chainId) : null;
  const nftMarketAddress = chainId ? getNftMarketAddress(chainId) : null;

  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const selected =
    listingIdNum !== null ? listings.find((l) => l.listingId === listingIdNum) : undefined;

  const fetchAllowance = useCallback(async () => {
    if (!account || !tokenAddress || !nftMarketAddress || !publicClient) {
      setAllowance(null);
      return;
    }
    try {
      const a = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, nftMarketAddress],
      });
      setAllowance(a as bigint);
    } catch {
      setAllowance(null);
    }
  }, [account, tokenAddress, nftMarketAddress, publicClient]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance]);

  const insufficientAllowance =
    !!selected && allowance !== null && allowance < selected.price;

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleApprove = async () => {
    if (!account || !tokenAddress || !nftMarketAddress || !selected) return;
    setTxError(null);
    setAction("approve");
    try {
      await writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [nftMarketAddress, selected.price],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleBuy = async () => {
    if (!account || !nftMarketAddress || listingIdNum === null) return;
    setTxError(null);
    setResult(null);
    setAction("buy");
    try {
      await writeContract({
        address: nftMarketAddress,
        abi: nftMarketAbi,
        functionName: "buyNFT",
        args: [listingIdNum],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  if (isConfirmed && txHash) {
    if (action === "approve") {
      fetchAllowance();
    } else {
      setResult("购买成功");
      setListingId("");
      refresh();
      fetchAllowance();
    }
    setAction(null);
  }

  if (error) {
    setTxError(error.message);
    setAction(null);
  }

  const canBuy =
    !!account &&
    !isPending &&
    !!nftMarketAddress &&
    listingIdNum !== null &&
    !insufficientAllowance;

  return (
    <Card title="购买 NFT">
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
          {selected ? (
            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <div>
                价格：<span className="font-mono text-gray-900">{formatTokenAmount(selected.price, decimals, 6)} {symbol}</span>
              </div>
              <div className="truncate" title={selected.seller}>卖家：{truncate(selected.seller)}</div>
              <div className="truncate" title={selected.nftContract}>
                NFT：{truncate(selected.nftContract)} #{selected.tokenId.toString()}
              </div>
            </div>
          ) : listingIdNum !== null ? (
            <p className="text-sm text-amber-600">未找到该 listingId 的活跃上架</p>
          ) : null}
          {insufficientAllowance && (
            <div className="space-y-2">
              <p className="text-sm text-amber-600">
                支付代币授权额度不足，需授权至少{" "}
                {formatTokenAmount(selected!.price, decimals, 6)} {symbol}
              </p>
              <Button
                variant="secondary"
                onClick={handleApprove}
                disabled={isPending || isConfirming}
                loading={isPending || isConfirming}
                className="w-full"
              >
                {isConfirming ? "确认中..." : isPending ? "授权中..." : "授权支付代币"}
              </Button>
            </div>
          )}
          <Button onClick={handleBuy} disabled={!canBuy} loading={isPending || isConfirming} className="w-full">
            {isConfirming ? "确认中..." : isPending ? "购买中..." : "购买"}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}