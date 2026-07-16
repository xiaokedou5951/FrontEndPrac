"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AddressInput } from "@/components/ui/AddressInput";
import { erc721Abi } from "@/contracts/nftMarketAbi";
import { getNftMarketAddress } from "@/config/nftmarket";

export function ApproveNFTCard() {
  const { chainId } = useAccount();
  const { account } = useWallet();
  const [nftContract, setNftContract] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const { writeContract, isPending, data: txHash, error } = useWriteContract();

  const addressValid = isAddress(nftContract);
  const nftMarketAddress = chainId ? getNftMarketAddress(chainId) : null;
  const canSubmit =
    !!account && !isPending && addressValid && !!nftMarketAddress;

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleApprove = async () => {
    if (!account || !nftMarketAddress) return;
    if (!addressValid) return;
    setTxError(null);
    setResult(null);
    try {
      await writeContract({
        address: nftContract as `0x${string}`,
        abi: erc721Abi,
        functionName: "setApprovalForAll",
        args: [nftMarketAddress, true],
      });
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    }
  };

  if (isConfirmed && txHash) {
    setResult("已为市场授权该 NFT 合约的全部 Token");
    setNftContract("");
  }

  if (error) {
    setTxError(error.message);
  }

  return (
    <Card title="授权 NFT 给市场（卖家）">
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
          <p className="text-xs text-gray-400">
            调用 NFT 合约的 setApprovalForAll，授权市场地址代为转移你名下的 NFT。
          </p>
          <Button onClick={handleApprove} disabled={!canSubmit} loading={isPending || isConfirming} className="w-full">
            {isConfirming ? "确认中..." : isPending ? "授权中..." : "授权"}
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}