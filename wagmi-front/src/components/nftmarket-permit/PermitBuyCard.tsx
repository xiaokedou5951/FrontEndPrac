"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/viem";
import { erc20Abi } from "@/contracts/erc20Abi";
import { nftMarketPermitAbi } from "@/contracts/nftMarketPermitAbi";
import { getTokenAddress } from "@/config/shared";
import { getNftMarketPermitAddress } from "@/config/nftMarketPermit";
import type { TokenMetadata } from "@/hooks/useTokenMetadataWagmi";
import type { ListingInfo, RefreshFn } from "./types";

type SignMode = "full" | "manual";

type Props = {
  metadata: TokenMetadata | null;
  listings: ListingInfo[];
  refresh: RefreshFn;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// 从 65 字节完整签名拆分 v, r, s
function splitSignature(sig: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } | null {
  if (sig.length !== 132) return null;
  const r = `0x${sig.slice(2, 66)}` as `0x${string}`;
  const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);
  return { v, r, s };
}

export function PermitBuyCard({ metadata, listings, refresh }: Props) {
  const { chainId } = useAccount();
  const { account, publicClient } = useWallet();
  const [listingId, setListingId] = useState("");
  const [signMode, setSignMode] = useState<SignMode>("full");
  // 完整签名模式
  const [fullSignature, setFullSignature] = useState("");
  // 手动模式
  const [vInput, setVInput] = useState("");
  const [rInput, setRInput] = useState("");
  const [sInput, setSInput] = useState("");

  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [action, setAction] = useState<"buy" | "approve" | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const tokenAddress = chainId ? getTokenAddress(chainId) : null;
  const nftMarketPermitAddress = chainId ? getNftMarketPermitAddress(chainId) : null;

  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const selected =
    listingIdNum !== null ? listings.find((l) => l.listingId === listingIdNum) : undefined;

  // 获取授权额度
  const fetchAllowance = useCallback(async () => {
    if (!account || !tokenAddress || !nftMarketPermitAddress || !publicClient) {
      setAllowance(null);
      return;
    }
    try {
      const a = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, nftMarketPermitAddress],
      });
      setAllowance(a as bigint);
    } catch {
      setAllowance(null);
    }
  }, [account, tokenAddress, nftMarketPermitAddress, publicClient]);

  useEffect(() => {
    fetchAllowance();
  }, [fetchAllowance]);

  const insufficientAllowance =
    !!selected && allowance !== null && allowance < selected.price;

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // 解析签名
  const parsedSignature = (() => {
    if (signMode === "full") {
      const sig = fullSignature.trim() as `0x${string}`;
      if (!sig.startsWith("0x") || sig.length !== 132) return null;
      return splitSignature(sig);
    } else {
      const v = parseInt(vInput.trim(), 10);
      const r = rInput.trim() as `0x${string}`;
      const s = sInput.trim() as `0x${string}`;
      if (isNaN(v) || !r.startsWith("0x") || r.length !== 66 || !s.startsWith("0x") || s.length !== 66) return null;
      return { v, r, s };
    }
  })();

  const handleApprove = async () => {
    if (!account || !tokenAddress || !nftMarketPermitAddress || !selected) return;
    setTxError(null);
    setAction("approve");
    try {
      await writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [nftMarketPermitAddress, selected.price],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePermitBuy = async () => {
    if (!account || !nftMarketPermitAddress || listingIdNum === null || !parsedSignature) return;
    setTxError(null);
    setResult(null);
    setAction("buy");
    try {
      await writeContract({
        address: nftMarketPermitAddress,
        abi: nftMarketPermitAbi,
        functionName: "permitBuy",
        args: [listingIdNum, parsedSignature.v, parsedSignature.r, parsedSignature.s],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (isConfirmed && txHash) {
      if (action === "approve") {
        fetchAllowance();
      } else {
        setResult("购买成功");
        setListingId("");
        setFullSignature("");
        setVInput("");
        setRInput("");
        setSInput("");
        refresh();
        fetchAllowance();
      }
      setAction(null);
    }
  }, [isConfirmed, txHash, action, refresh, fetchAllowance]);

  useEffect(() => {
    if (error) {
      setTxError(error.message);
      setAction(null);
    }
  }, [error]);

  const canBuy =
    !!account &&
    !isPending &&
    !!nftMarketPermitAddress &&
    listingIdNum !== null &&
    !insufficientAllowance &&
    !!parsedSignature;

  return (
    <Card title="白名单许可购买 NFT">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-3">
          {/* Listing ID */}
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

          {/* 选中 listing 信息 */}
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

          {/* 签名模式切换 */}
          <div className="flex gap-2">
            <button
              onClick={() => setSignMode("full")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                signMode === "full"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              完整签名
            </button>
            <button
              onClick={() => setSignMode("manual")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                signMode === "manual"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              手动 v, r, s
            </button>
          </div>

          {/* 签名输入 */}
          {signMode === "full" ? (
            <div className="space-y-1">
              <label className="text-xs text-gray-500">签名 (65 bytes hex)</label>
              <textarea
                value={fullSignature}
                onChange={(e) => setFullSignature(e.target.value)}
                placeholder="0x..."
                disabled={isPending || isConfirming}
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {fullSignature.trim() && !fullSignature.trim().startsWith("0x") && (
                <p className="text-xs text-red-500">签名必须以 0x 开头</p>
              )}
              {fullSignature.trim().startsWith("0x") && fullSignature.trim().length !== 132 && (
                <p className="text-xs text-amber-500">签名应为 130 个 hex 字符（0x + 64 字节）</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">v</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={vInput}
                  onChange={(e) => setVInput(e.target.value)}
                  placeholder="27 或 28"
                  disabled={isPending || isConfirming}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">r (bytes32)</label>
                <input
                  type="text"
                  value={rInput}
                  onChange={(e) => setRInput(e.target.value)}
                  placeholder="0x..."
                  disabled={isPending || isConfirming}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">s (bytes32)</label>
                <input
                  type="text"
                  value={sInput}
                  onChange={(e) => setSInput(e.target.value)}
                  placeholder="0x..."
                  disabled={isPending || isConfirming}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* 授权检查 */}
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

          <Button onClick={handlePermitBuy} disabled={!canBuy} loading={isPending || isConfirming} className="w-full">
            {isConfirming ? "确认中..." : isPending ? "购买中..." : "白名单购买"}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
