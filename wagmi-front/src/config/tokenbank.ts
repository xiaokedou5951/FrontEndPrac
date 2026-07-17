import { foundry, sepolia, polygon, optimism } from "viem/chains";
import { isAddress, type Address } from "viem";
import { getTokenAddress } from "./shared";

function getEnvTokenBankAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_POLYGON;
    case optimism.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_OPTIMISM;
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
    case optimism.id:
      return "Optimism (10)";
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
    case optimism.id:
      return "OPTIMISM";
    default:
      return null;
  }
}

export function getTokenBankAddress(chainId: number): Address | null {
  const raw = getEnvTokenBankAddress(chainId);
  return raw && isAddress(raw) ? (raw as Address) : null;
}

export function getConfigOk(chainId: number): boolean {
  return getTokenAddress(chainId) !== null && getTokenBankAddress(chainId) !== null;
}

export function getConfigError(chainId: number): string | null {
  const suffix = getChainEnvSuffix(chainId);
  if (!suffix) {
    return `当前链 ${getChainName(chainId)} 不受支持。请切换到 Local (31337)、Sepolia (11155111)、Polygon (137) 或 Optimism (10)。`;
  }

  const tokenAddr = getTokenAddress(chainId);
  const bankAddr = getTokenBankAddress(chainId);

  if (tokenAddr && bankAddr) return null;

  const issues: string[] = [];
  const tokenRaw = chainId === foundry.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL
    : chainId === sepolia.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA
    : chainId === polygon.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_POLYGON
    : chainId === optimism.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_OPTIMISM
    : undefined;

  const bankRaw = getEnvTokenBankAddress(chainId);

  if (!tokenRaw) {
    issues.push(`NEXT_PUBLIC_TOKEN_ADDRESS_${suffix} 为空`);
  } else if (!isAddress(tokenRaw)) {
    issues.push(`NEXT_PUBLIC_TOKEN_ADDRESS_${suffix} 的值 "${tokenRaw}" 不是有效地址`);
  }

  if (!bankRaw) {
    issues.push(`NEXT_PUBLIC_TOKENBANK_ADDRESS_${suffix} 为空`);
  } else if (!isAddress(bankRaw)) {
    issues.push(`NEXT_PUBLIC_TOKENBANK_ADDRESS_${suffix} 的值 "${bankRaw}" 不是有效地址`);
  }

  return `当前链 ${getChainName(chainId)} 配置问题: ${issues.join("；")}。请在 wagmi-front/.env.local 中配置后重启开发服务器。`;
}