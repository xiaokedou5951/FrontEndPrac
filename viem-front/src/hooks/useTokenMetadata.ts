import { useCallback, useEffect, useState } from "react";
import { erc20Abi } from "@/contracts/abis";
import { tokenAddress } from "@/config/contracts";
import { useWallet } from "@/context/WalletContext";

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

export function useTokenMetadata(enabled = true): Return {
  const { publicClient } = useWallet();
  const [data, setData] = useState<TokenMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!tokenAddress) {
      setData(null);
      setError(null);
      return;
    }
    try {
      const [name, symbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "name",
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
      setData({ name, symbol, decimals });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [publicClient]);

  useEffect(() => {
    if (!enabled || !tokenAddress) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    refetch().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [enabled, refetch]);

  return { data, isLoading, error, refetch };
}
