"use client";

import { useState, useEffect } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { AddressInput } from "@/components/ui/AddressInput";
import { safeParseTokenAmount } from "@/lib/viem";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { getNftMarketAddress } from "@/config/nftmarket";
import type { TokenMetadata } from "@/hooks/useTokenMetadataWagmi";
import type { RefreshFn } from "./types";

type Props = {
  metadata: TokenMetadata | null;
  refresh: RefreshFn;
};

export function ListCard({ metadata, refresh }: Props) {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const parsedPrice = safeParseTokenAmount(price, decimals);
  const addressValid = isAddress(nftContract);
  const tokenIdNum = tokenId.trim() === "" ? null : BigInt(tokenId.trim());
  const nftMarketAddress = chainId ? getNftMarketAddress(chainId) : null;

  const canSubmit =
    !!account &&
    !isPending &&
    !!nftMarketAddress &&
    addressValid &&
    tokenIdNum !== null &&
    parsedPrice > 0n;

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleList = async () => {
    if (!account || !nftMarketAddress) return;
    if (!addressValid || tokenIdNum === null || parsedPrice <= 0n) return;
    setTxError(null);
    setResult(null);
    try {
      await writeContract({
        address: nftMarketAddress,
        abi: nftMarketAbi,
        functionName: "list",
        args: [nftContract as Address, tokenIdNum, parsedPrice],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  // 使用 useEffect 处理交易确认和错误状态
  useEffect(() => {
    if (isConfirmed && txHash) {
      setResult("上架成功，listingId 请见下方事件日志");
      setNftContract("");
      setTokenId("");
      setPrice("");
      refresh();
    }
  }, [isConfirmed, txHash, refresh]);

  useEffect(() => {
    if (error) {
      setTxError(error.message);
    }
  }, [error]);

  return (
    <Card title="上架 NFT">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">NFT 合约地址</label>
            <AddressInput
              value={nftContract}
              onChange={setNftContract}
              disabled={isPending || isConfirming}
              invalid={nftContract !== "" && !addressValid}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Token ID</label>
            <input
              type="text"
              inputMode="numeric"
              value={tokenId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) setTokenId(v);
              }}
              placeholder="0"
              disabled={isPending || isConfirming}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">价格</label>
            <AmountInput
              value={price}
              onChange={setPrice}
              suffix={symbol}
              disabled={isPending || isConfirming}
            />
          </div>
          <p className="text-xs text-gray-400">
            上架前请先用「授权 NFT」卡片为市场地址授权，否则购买时 NFT 转账会失败。
          </p>
          <Button onClick={handleList} disabled={!canSubmit} loading={isPending || isConfirming} className="w-full">
            {isConfirming ? "确认中..." : isPending ? "上架中..." : "上架"}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}