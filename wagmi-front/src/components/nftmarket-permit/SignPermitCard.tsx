"use client";

import { useState, useEffect, useCallback } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { useWallet } from "@/context/WalletContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { nftMarketPermitAbi } from "@/contracts/nftMarketPermitAbi";
import { getNftMarketPermitAddress } from "@/config/nftMarketPermit";
import { AddressInput } from "@/components/ui/AddressInput";

export function SignPermitCard() {
  const { chainId } = useAccount();
  const { account, walletClient } = useWallet();
  const [buyer, setBuyer] = useState("");
  const [listingId, setListingId] = useState("");
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nftMarketPermitAddress = chainId ? getNftMarketPermitAddress(chainId) : null;

  // 从合约读取 signer 地址
  const { data: signerAddress } = useReadContract({
    address: nftMarketPermitAddress ?? undefined,
    abi: nftMarketPermitAbi,
    functionName: "signer",
    query: { enabled: !!nftMarketPermitAddress },
  });

  const isSigner = account && signerAddress && account.toLowerCase() === (signerAddress as string).toLowerCase();
  const buyerValid = isAddress(buyer);
  const listingIdNum = listingId.trim() === "" ? null : BigInt(listingId.trim());

  const canSign =
    !!account &&
    !!walletClient &&
    !!nftMarketPermitAddress &&
    !!chainId &&
    buyerValid &&
    listingIdNum !== null &&
    !!isSigner;

  const handleSign = async () => {
    if (!walletClient || !nftMarketPermitAddress || !chainId || !buyerValid || listingIdNum === null || !account) return;
    setSignError(null);
    setSignature(null);
    try {
      const sig = await walletClient.signTypedData({
        account,
        domain: {
          name: "NFTMarketPermit",
          chainId,
          verifyingContract: nftMarketPermitAddress,
        },
        primaryType: "PermitBuy",
        types: {
          PermitBuy: [
            { name: "buyer", type: "address" },
            { name: "listingId", type: "uint256" },
          ],
        },
        message: {
          buyer: buyer as Address,
          listingId: listingIdNum,
        },
      });
      setSignature(sig);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
    }
  };

  // 拆分签名为 v, r, s
  const signatureParts = useCallback(() => {
    if (!signature || signature.length !== 132) return null; // 0x + 64 chars (r) + 64 chars (s) + 2 chars (v)
    const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
    const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
    const v = parseInt(signature.slice(130, 132), 16);
    return { v, r, s };
  }, [signature]);

  const handleCopy = async () => {
    if (!signature) return;
    await navigator.clipboard.writeText(signature);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 重置签名当输入变化
  useEffect(() => {
    setSignature(null);
    setSignError(null);
  }, [buyer, listingId]);

  const parts = signatureParts();

  return (
    <Card title="项目方签名（白名单授权）">
      {!account ? (
        <p className="text-sm text-gray-400">请先连接钱包</p>
      ) : !isSigner ? (
        <p className="text-sm text-amber-600">
          当前钱包不是项目方签名地址。只有合约 signer 才能生成白名单签名。
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-500">买家地址（白名单用户）</label>
            <AddressInput
              value={buyer}
              onChange={setBuyer}
              disabled={false}
              invalid={buyer !== "" && !buyerValid}
            />
          </div>
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
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-mono text-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-gray-400">
            使用 EIP-712 对 PermitBuy(buyer, listingId) 签名，生成白名单购买凭证。
          </p>
          <Button onClick={handleSign} disabled={!canSign} className="w-full">
            生成签名
          </Button>
          {signature && (
            <div className="space-y-2 rounded-lg bg-green-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-green-700">签名已生成</span>
                <Button variant="secondary" size="sm" onClick={handleCopy} className="px-2 py-1 text-xs">
                  {copied ? "已复制" : "复制签名"}
                </Button>
              </div>
              <div className="break-all font-mono text-xs text-gray-700">{signature}</div>
              {parts && (
                <div className="mt-2 space-y-1 border-t border-green-200 pt-2 text-xs text-gray-600">
                  <p>拆分结果：</p>
                  <p>v = {parts.v}</p>
                  <p className="truncate" title={parts.r}>r = {parts.r}</p>
                  <p className="truncate" title={parts.s}>s = {parts.s}</p>
                </div>
              )}
            </div>
          )}
          {signError && <p className="text-sm text-red-600">{signError}</p>}
        </div>
      )}
    </Card>
  );
}
