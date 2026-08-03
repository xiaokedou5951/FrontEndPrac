"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { encodeFunctionData, type Address } from "viem";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatTokenAmount } from "@/lib/viem";
import { airdropMerkleNftMarketAbi } from "@/contracts/airdropMerkleNftMarketAbi";
import { erc20PermitAbi } from "@/contracts/erc20PermitAbi";
import { getAirdropMerkleAddress } from "@/config/airdropMerkle";
import { getMyTokenPermitAddress } from "@/config/shared";
import { fetchProof } from "@/lib/merkleApi";
import type { TokenMetadata } from "@/hooks/useTokenMetadataWagmi";
import type { ListingInfo, RefreshFn } from "./types";

type Props = {
  metadata: TokenMetadata | null;
  listings: ListingInfo[];
  refresh: RefreshFn;
  listingId: string;
  onListingIdChange: (v: string) => void;
};

function truncate(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

// 从 65 字节签名拆分 v, r, s
function splitSignature(sig: `0x${string}`): { v: number; r: `0x${string}`; s: `0x${string}` } | null {
  if (sig.length !== 132) return null;
  const r = `0x${sig.slice(2, 66)}` as `0x${string}`;
  const s = `0x${sig.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(sig.slice(130, 132), 16);
  return { v, r, s };
}

export function ClaimNFTCard({ metadata, listings, refresh, listingId, onListingIdChange }: Props) {
  const { chainId } = useAccount();
  const { account, walletClient, publicClient } = useWallet();
  const [proof, setProof] = useState<`0x${string}`[] | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "signing" | "sending">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const decimals = metadata?.decimals ?? 18;
  const symbol = metadata?.symbol ?? "TOKEN";
  const tokenAddress = chainId ? getMyTokenPermitAddress(chainId) : null;
  const marketAddress = chainId ? getAirdropMerkleAddress(chainId) : null;

  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());
  const selected =
    listingIdNum !== null ? listings.find((l) => l.listingId === listingIdNum) : undefined;

  // 读取 claimed(account)
  const { data: claimedData, refetch: refetchClaimed } = useReadContract({
    address: marketAddress ?? undefined,
    abi: airdropMerkleNftMarketAbi,
    functionName: "claimed",
    args: [account ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!marketAddress && !!account },
  });
  const claimed = !!claimedData;

  // 拉取当前用户的 merkle proof
  const refreshProof = useCallback(async () => {
    if (!account) {
      setProof(null);
      return;
    }
    setProofLoading(true);
    setProofError(null);
    try {
      const res = await fetchProof(account);
      setProof(res?.proof ?? null);
    } catch (e) {
      setProof(null);
      setProofError(e instanceof Error ? e.message : String(e));
    } finally {
      setProofLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refreshProof();
  }, [refreshProof]);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isConfirmed && txHash) {
      setResult("优惠购买成功！NFT 已转入，卖家已收到 50% 价格");
      onListingIdChange("");
      setStatus("idle");
      refresh();
      refetchClaimed();
      refreshProof();
    }
  }, [isConfirmed, txHash, refresh, refetchClaimed, refreshProof]);

  useEffect(() => {
    if (error) {
      setTxError(error.message);
      setStatus("idle");
    }
  }, [error]);

  const inWhitelist = proof !== null;
  const payAmount = selected ? selected.price / 2n : 0n;

  const handleClaim = async () => {
    if (!account || !marketAddress || !tokenAddress || !publicClient || !walletClient || !chainId) return;
    if (!selected || !proof || listingIdNum === null) return;
    setTxError(null);
    setResult(null);
    try {
      // 1. deadline
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // 2. 读取最新 nonce 与代币 name（EIP-2612 domain name 必须与合约一致）
      const [nonce, tokenName] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20PermitAbi,
          functionName: "nonces",
          args: [account],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20PermitAbi,
          functionName: "name",
        }) as Promise<string>,
      ]);

      // 3. EIP-2612 permit 签名
      setStatus("signing");
      const sig = await walletClient.signTypedData({
        account,
        domain: {
          name: tokenName,
          version: "1",
          chainId,
          verifyingContract: tokenAddress,
        },
        primaryType: "Permit",
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        message: {
          owner: account,
          spender: marketAddress,
          value: payAmount,
          nonce,
          deadline,
        },
      });

      // 4. 拆分 v, r, s
      const parsed = splitSignature(sig);
      if (!parsed) {
        throw new Error("签名格式异常（应为 65 字节）");
      }
      const { v, r, s } = parsed;

      // 5. 编码两个子调用
      const permitData = encodeFunctionData({
        abi: airdropMerkleNftMarketAbi,
        functionName: "permitPrePay",
        args: [payAmount, deadline, v, r, s],
      });
      const claimData = encodeFunctionData({
        abi: airdropMerkleNftMarketAbi,
        functionName: "claimNFT",
        args: [listingIdNum, proof],
      });

      // 6. multicall(delegatecall) 一次性提交
      const calls = [permitData, claimData] as `0x${string}`[];
      setStatus("sending");
      await writeContract({
        address: marketAddress,
        abi: airdropMerkleNftMarketAbi,
        functionName: "multicall",
        args: [calls],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const busy = isPending || isConfirming || status !== "idle";
  const canClaim =
    !!account &&
    !!marketAddress &&
    !!tokenAddress &&
    !!selected &&
    !!proof &&
    !claimed &&
    !busy &&
    !proofLoading;

  const buttonLabel = (() => {
    if (status === "signing") return "请在钱包签名...";
    if (isConfirming) return "确认中...";
    if (status === "sending" || isPending) return "提交中...";
    return "一键优惠购买（permit + multicall）";
  })();

  return (
    <Card title="白名单 50% 优惠购买（核心）">
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
                if (v === "" || /^\d+$/.test(v)) onListingIdChange(v);
              }}
              placeholder="0"
              disabled={busy}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {selected ? (
            <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              <div>
                原价：<span className="font-mono text-gray-400 line-through">{formatTokenAmount(selected.price, decimals, 6)} {symbol}</span>
              </div>
              <div>
                优惠价(50%)：<span className="font-mono text-emerald-600">{formatTokenAmount(payAmount, decimals, 6)} {symbol}</span>
              </div>
              <div className="truncate" title={selected.seller}>卖家：{truncate(selected.seller)}</div>
              <div className="truncate" title={selected.nftContract}>
                NFT：{truncate(selected.nftContract)} #{selected.tokenId.toString()}
              </div>
            </div>
          ) : listingIdNum !== null ? (
            <p className="text-sm text-amber-600">未找到该 listingId 的活跃上架</p>
          ) : null}

          {/* 状态提示 */}
          <div className="space-y-1 text-xs">
            {proofLoading && <p className="text-gray-400">正在向 proof 后端查询白名单...</p>}
            {proofError && <p className="text-red-500">proof 后端错误：{proofError}</p>}
            {!proofLoading && !inWhitelist && (
              <p className="text-red-500">当前地址不在白名单内，无法优惠购买。</p>
            )}
            {inWhitelist && claimed && (
              <p className="text-amber-600">已领取过，每个白名单地址仅可优惠购买一次。</p>
            )}
            {inWhitelist && !claimed && selected && (
              <p className="text-emerald-600">
                白名单验证通过，将用 permit 授权 + multicall 一次性支付 {formatTokenAmount(payAmount, decimals, 6)} {symbol} 并领取 NFT。
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400">
            流程：① 钱包对 EIP-2612 Permit 签名（授权市场扣款 payAmount） → ② 编码 permitPrePay + claimNFT → ③ 调用 multicall(delegatecall) 一笔交易完成。
          </p>

          <Button onClick={handleClaim} disabled={!canClaim} loading={busy} className="w-full">
            {buttonLabel}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
