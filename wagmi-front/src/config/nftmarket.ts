import { foundry, sepolia, polygon } from "viem/chains";
import { isAddress, type Address } from "viem";

function getEnvNftMarketAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_POLYGON;
    default:
      return undefined;
  }
}

function getEnvSimpleNftAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_POLYGON;
    default:
      return undefined;
  }
}

function getChainName(chainId: number): string {
  switch (chainId) {
    case foundry.id:
      return "Local (31337)";
    case sepolia.id:
      return "Sepolia (11155111)";
    case polygon.id:
      return "Polygon (137)";
    default:
      return `未知链 (${chainId})`;
  }
}

function getChainEnvSuffix(chainId: number): string | null {
  switch (chainId) {
    case foundry.id:
      return "LOCAL";
    case sepolia.id:
      return "SEPOLIA";
    case polygon.id:
      return "POLYGON";
    default:
      return null;
  }
}

export function getNftMarketAddress(chainId: number): Address | null {
  const raw = getEnvNftMarketAddress(chainId);
  return raw && isAddress(raw) ? (raw as Address) : null;
}

export function getSimpleNftAddress(chainId: number): Address | null {
  const raw = getEnvSimpleNftAddress(chainId);
  return raw && isAddress(raw) ? (raw as Address) : null;
}

export function getConfigOk(chainId: number): boolean {
  return getNftMarketAddress(chainId) !== null;
}

export function getConfigError(chainId: number): string | null {
  const suffix = getChainEnvSuffix(chainId);
  if (!suffix) {
    return `当前链 ${getChainName(chainId)} 不受支持。请切换到 Local (31337)、Sepolia (11155111) 或 Polygon (137)。`;
  }

  const raw = getEnvNftMarketAddress(chainId);
  if (!raw) {
    return `环境变量 NEXT_PUBLIC_NFT_MARKET_ADDRESS_${suffix} 为空。请在 wagmi-front/.env.local 中配置当前链 (${getChainName(chainId)}) 的合约地址后重启开发服务器。`;
  }

  if (!isAddress(raw)) {
    return `环境变量 NEXT_PUBLIC_NFT_MARKET_ADDRESS_${suffix} 的值 "${raw}" 不是有效的以太坊地址格式。请检查配置。`;
  }

  return null;
}