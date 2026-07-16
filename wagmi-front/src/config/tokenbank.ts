import { isAddress, type Address } from "viem";
import { tokenAddress } from "./shared";

// TokenBank 配置

const rawTokenBankAddress = process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS;

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
