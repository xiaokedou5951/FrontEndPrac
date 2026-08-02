"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { airdropMerkleNftMarketAbi } from "@/contracts/airdropMerkleNftMarketAbi";
import { getAirdropMerkleAddress } from "@/config/airdropMerkle";
import { fetchProof } from "@/lib/merkleApi";

function truncate(s: string): string {
  return `${s.slice(0, 10)}...${s.slice(-8)}`;
}

export function WhitelistInfoCard() {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const marketAddress = chainId ? getAirdropMerkleAddress(chainId) : null;

  const { data: onChainRoot, refetch: refetchRoot } = useReadContract({
    address: marketAddress ?? undefined,
    abi: airdropMerkleNftMarketAbi,
    functionName: "merkleRoot",
    query: { enabled: !!marketAddress },
  });

  const { data: claimedData, refetch: refetchClaimed } = useReadContract({
    address: marketAddress ?? undefined,
    abi: airdropMerkleNftMarketAbi,
    functionName: "claimed",
    args: [account ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!marketAddress && !!account },
  });

  const [proof, setProof] = useState<`0x${string}`[] | null>(null);
  const [backendRoot, setBackendRoot] = useState<`0x${string}` | null>(null);
  const [loading, setLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const refreshProof = useCallback(async () => {
    if (!account) {
      setProof(null);
      setBackendRoot(null);
      return;
    }
    setLoading(true);
    setProofError(null);
    try {
      const res = await fetchProof(account);
      setProof(res?.proof ?? null);
      setBackendRoot(res?.root ?? null);
    } catch (e) {
      setProof(null);
      setBackendRoot(null);
      setProofError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refreshProof();
  }, [refreshProof]);

  const onChainRootHex = onChainRoot ? (onChainRoot as `0x${string}`) : null;
  const claimed = !!claimedData;
  const inWhitelist = proof !== null && proof.length >= 0 && backendRoot !== null;
  const rootMatch =
    onChainRootHex && backendRoot
      ? onChainRootHex.toLowerCase() === backendRoot.toLowerCase()
      : null;

  return (
    <Card title="白名单状态">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">当前用户</span>
            <span className="font-mono text-gray-700" title={account}>{truncate(account)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-500">白名单</span>
            {loading ? (
              <span className="text-gray-400">查询中...</span>
            ) : inWhitelist ? (
              <span className="font-medium text-emerald-600">在白名单内 ✓</span>
            ) : (
              <span className="font-medium text-red-500">不在白名单 ✗</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-500">已领取</span>
            <span className={claimed ? "font-medium text-amber-600" : "font-medium text-gray-700"}>
              {claimed ? "是（不可再领）" : "否"}
            </span>
          </div>

          <div className="border-t border-gray-100 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">链上 merkleRoot</span>
              <span className="font-mono text-gray-700" title={onChainRootHex ?? ""}>
                {onChainRootHex ? truncate(onChainRootHex) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-gray-500">后端 merkleRoot</span>
              <span className="font-mono text-gray-700" title={backendRoot ?? ""}>
                {backendRoot ? truncate(backendRoot) : "—"}
              </span>
            </div>
            {rootMatch !== null && (
              <p className={`mt-1 ${rootMatch ? "text-emerald-600" : "text-red-500"}`}>
                {rootMatch
                  ? "root 一致，proof 可通过合约验证"
                  : "root 不一致！请确认合约部署时使用了后端的 root"}
              </p>
            )}
          </div>

          {proof && proof.length > 0 && (
            <div className="border-t border-gray-100 pt-2">
              <span className="text-gray-500">proof（{proof.length} 个兄弟节点）</span>
              <div className="mt-1 max-h-20 overflow-y-auto break-all font-mono text-[10px] text-gray-500">
                {proof.map((p, i) => (
                  <div key={i} title={p}>{i}: {truncate(p)}</div>
                ))}
              </div>
            </div>
          )}

          {proofError && <p className="text-red-500">后端错误：{proofError}</p>}

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => {
              refreshProof();
              refetchRoot();
              refetchClaimed();
            }}
          >
            刷新状态
          </Button>
        </div>
      )}
    </Card>
  );
}
