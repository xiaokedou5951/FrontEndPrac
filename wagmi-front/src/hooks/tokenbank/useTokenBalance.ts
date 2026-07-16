import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { erc20Abi } from "@/contracts/erc20Abi";
import { tokenAddress } from "@/config/shared";
import { useWallet } from "@/context/WalletContext";

type Return = {
  data: bigint | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useTokenBalance(account: Address | null, enabled = true): Return {
  const { publicClient } = useWallet();
  const [data, setData] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!account || !tokenAddress) {
      setData(null);
      setError(null);
      return;
    }
    try {
      const balance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
      setData(balance);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [account, publicClient]);

  useEffect(() => {
    if (!enabled || !account || !tokenAddress) {
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
    const interval = setInterval(refetch, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, account, refetch]);

  return { data, isLoading, error, refetch };
}
