import { foundry } from "viem/chains";
import { defineChain, isAddress, type Address, type Chain } from "viem";

// 共享配置：RPC、链定义、底层 ERC20 代币地址（TokenBank 与 NFTMarket 共用）

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
export const tokenAddress: Address | null =
  rawTokenAddress && isAddress(rawTokenAddress) ? (rawTokenAddress as Address) : null;
