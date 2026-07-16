"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/viem";
import { erc20Abi } from "@/contracts/erc20Abi";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { tokenAddress, chain } from "@/config/shared";
import { nftMarketAddress } from "@/config/nftmarket";
import type { TokenMetadata } from "@/hooks/useTokenMetadata";
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
  const { account, walletClient, publicClient } = useWallet();
  const [listingId, setListingId] = useState("");
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [pending, setPending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";

  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const selected =
    listingIdNum !== null ? listings.find((l) => l.listingId === listingIdNum) : undefined;

  const fetchAllowance = useCallback(async () => {
    if (!account || !tokenAddress || !nftMarketAddress) {
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
  }, [account, publicClient]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance]);

  const insufficientAllowance =
    !!selected && allowance !== null && allowance < selected.price;

  const handleApprove = async () => {
    if (!account || !walletClient || !tokenAddress || !nftMarketAddress || !selected) return;
    setApproving(true);
    setTxError(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [nftMarketAddress, selected.price],
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await fetchAllowance();
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const handleBuy = async () => {
    if (!account || !walletClient || !nftMarketAddress || listingIdNum === null) return;
    setPending(true);
    setTxError(null);
    setResult(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: nftMarketAddress,
        abi: nftMarketAbi,
        functionName: "buyNFT",
        args: [listingIdNum],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setResult("购买成功");
      setListingId("");
      await Promise.all([refresh(), fetchAllowance()]);
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const canBuy =
    !!account &&
    !!walletClient &&
    !pending &&
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
              disabled={pending}
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
                disabled={approving}
                loading={approving}
                className="w-full"
              >
                授权支付代币
              </Button>
            </div>
          )}
          <Button onClick={handleBuy} disabled={!canBuy} loading={pending} className="w-full">
            购买
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
