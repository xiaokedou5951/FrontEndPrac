import { formatUnits, parseUnits } from "viem";

export function formatTokenAmount(
  value: bigint,
  decimals: number,
  maxFracDigits?: number,
): string {
  const full = formatUnits(value, decimals);
  if (maxFracDigits === undefined) return full;
  const [intPart, fracPart = ""] = full.split(".");
  const limited = fracPart.slice(0, maxFracDigits);
  const trimmed = limited.replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (trimmed === "") return 0n;
  return parseUnits(trimmed, decimals);
}

export function safeParseTokenAmount(value: string, decimals: number): bigint {
  try {
    return parseTokenAmount(value, decimals);
  } catch {
    return 0n;
  }
}