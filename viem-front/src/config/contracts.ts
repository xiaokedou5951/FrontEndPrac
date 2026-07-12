import { foundry } from "viem/chains";
import { defineChain, isAddress, type Address, type Chain } from "viem";

export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";

const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_CHAIN_ID) : 31337;

export const chain: Chain =
  envChainId === 31337
    ? foundry
    : defineChain({
        id: envChainId,
        name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Custom Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
        testnet: true,
      });

const rawTokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const rawTokenBankAddress = process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS;

export const tokenAddress: Address | null =
  rawTokenAddress && isAddress(rawTokenAddress) ? (rawTokenAddress as Address) : null;

export const tokenBankAddress: Address | null =
  rawTokenBankAddress && isAddress(rawTokenBankAddress) ? (rawTokenBankAddress as Address) : null;

export const configOk = tokenAddress !== null && tokenBankAddress !== null;

export const configError: string | null = (() => {
  const missing: string[] = [];
  if (!tokenAddress) missing.push("NEXT_PUBLIC_TOKEN_ADDRESS");
  if (!tokenBankAddress) missing.push("NEXT_PUBLIC_TOKENBANK_ADDRESS");
  if (missing.length === 0) return null;
  return `缺少环境变量: ${missing.join(", ")}。请在 viem-front/.env.local 中配置后重启开发服务器。`;
})();
