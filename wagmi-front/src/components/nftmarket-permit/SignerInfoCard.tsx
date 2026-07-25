"use client";

import { useAccount, useReadContract } from "wagmi";
import { Card } from "@/components/ui/Card";
import { nftMarketPermitAbi } from "@/contracts/nftMarketPermitAbi";
import { getNftMarketPermitAddress } from "@/config/nftMarketPermit";

export function SignerInfoCard() {
  const { chainId } = useAccount();
  const nftMarketPermitAddress = chainId ? getNftMarketPermitAddress(chainId) : null;

  const { data: signerAddress, isLoading } = useReadContract({
    address: nftMarketPermitAddress ?? undefined,
    abi: nftMarketPermitAbi,
    functionName: "signer",
    query: { enabled: !!nftMarketPermitAddress },
  });

  return (
    <Card title="项目方签名地址">
      {isLoading ? (
        <p className="text-sm text-gray-400">加载中...</p>
      ) : signerAddress ? (
        <p className="break-all font-mono text-sm text-gray-700">{signerAddress as string}</p>
      ) : (
        <p className="text-sm text-gray-400">未读取到 signer 地址</p>
      )}
      <p className="mt-1 text-xs text-gray-400">只有此地址生成的 EIP-712 签名才能用于白名单购买。</p>
    </Card>
  );
}
