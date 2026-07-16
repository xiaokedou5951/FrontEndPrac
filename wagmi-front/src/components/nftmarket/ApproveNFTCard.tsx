"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AddressInput } from "@/components/ui/AddressInput";
import { erc721Abi } from "@/contracts/nftMarketAbi";
import { chain } from "@/config/shared";
import { nftMarketAddress } from "@/config/nftmarket";

export function ApproveNFTCard() {
  const { account, walletClient, publicClient } = useWallet();
  const [nftContract, setNftContract] = useState("");
  const [pending, setPending] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const addressValid = isAddress(nftContract);
  const canSubmit =
    !!account && !!walletClient && !pending && addressValid && !!nftMarketAddress;

  const handleApprove = async () => {
    if (!account || !walletClient || !nftMarketAddress) return;
    if (!addressValid) return;
    setPending(true);
    setTxError(null);
    setResult(null);
    try {
      const hash = await walletClient.writeContract({
        account,
        address: nftContract as `0x${string}`,
        abi: erc721Abi,
        functionName: "setApprovalForAll",
        args: [nftMarketAddress, true],
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new Error("交易执行失败（合约 revert）");
      }
      setResult("已为市场授权该 NFT 合约的全部 Token");
      setNftContract("");
    } catch (e) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

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
              disabled={pending}
              invalid={nftContract !== "" && !addressValid}
            />
          </div>
          <p className="text-xs text-gray-400">
            调用 NFT 合约的 setApprovalForAll，授权市场地址代为转移你名下的 NFT。
          </p>
          <Button onClick={handleApprove} disabled={!canSubmit} loading={pending} className="w-full">
            授权
          </Button>
          {result && <p className="text-sm text-green-600">{result}</p>}
          {txError && <p className="text-sm text-red-600">{txError}</p>}
        </div>
      )}
    </Card>
  );
}
