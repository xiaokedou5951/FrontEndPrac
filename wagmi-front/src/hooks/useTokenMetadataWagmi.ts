import { useAccount } from "wagmi";
import { useReadContracts } from "wagmi";
import { erc20Abi } from "@/contracts/erc20Abi";
import { getTokenAddress } from "@/config/shared";

export type TokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
};

type Return = {
  data: TokenMetadata | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useTokenMetadataWagmi(enabled = true): Return {
  const { chainId } = useAccount();
  const tokenAddress = chainId ? getTokenAddress(chainId) : null;

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: tokenAddress ?? undefined,
        abi: erc20Abi,
        functionName: "name",
      },
      {
        address: tokenAddress ?? undefined,
        abi: erc20Abi,
        functionName: "symbol",
      },
      {
        address: tokenAddress ?? undefined,
        abi: erc20Abi,
        functionName: "decimals",
      },
    ],
    query: {
      enabled: enabled && !!tokenAddress,
    },
  });

  if (!data || data.some((r) => r.status === "failure")) {
    const firstError = data?.find((r) => r.status === "failure")?.error;
    return {
      data: null,
      isLoading,
      error: firstError instanceof Error ? firstError : firstError ? new Error(String(firstError)) : null,
      refetch: async () => {
        await refetch();
      },
    };
  }

  const [nameResult, symbolResult, decimalsResult] = data;
  const metadata: TokenMetadata = {
    name: nameResult.result as string,
    symbol: symbolResult.result as string,
    decimals: decimalsResult.result as number,
  };

  return {
    data: metadata,
    isLoading,
    error: error ?? null,
    refetch: async () => {
      await refetch();
    },
  };
}