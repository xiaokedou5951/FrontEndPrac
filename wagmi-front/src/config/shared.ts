import { foundry, sepolia, polygon } from "viem/chains";
import { isAddress, type Address, type Chain } from "viem";

export const chains = [foundry, sepolia, polygon] as const;

export type SupportedChainId = (typeof chains)[number]["id"];

export function getChain(chainId: number): Chain | undefined {
  return chains.find((c) => c.id === chainId);
}

export const defaultChain = foundry;

function getEnvTokenAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_POLYGON;
    default:
      return undefined;
  }
}

export function getTokenAddress(chainId: number): Address | null {
  const raw = getEnvTokenAddress(chainId);
  return raw && isAddress(raw) ? (raw as Address) : null;
}