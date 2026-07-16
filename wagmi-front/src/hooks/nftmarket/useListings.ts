"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { nftMarketAddress } from "@/config/nftmarket";
import { useWallet } from "@/context/WalletContext";
import type { ListingInfo } from "@/components/nftmarket/types";

type Return = {
  data: ListingInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

type ListingTuple = {
  seller: Address;
  nftContract: Address;
  tokenId: bigint;
  price: bigint;
  isActive: boolean;
};

export function useListings(enabled = true): Return {
  const { publicClient } = useWallet();
  const [data, setData] = useState<ListingInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!nftMarketAddress) return;
    const marketAddress = nftMarketAddress;
    setIsLoading(true);
    setError(null);
    try {
      const nextId = (await publicClient.readContract({
        address: marketAddress,
        abi: nftMarketAbi,
        functionName: "nextListingId",
      })) as bigint;

      const count = Number(nextId);
      if (count === 0) {
        setData([]);
        return;
      }

      const ids = Array.from({ length: count }, (_, i) => BigInt(i));
      const results = (await Promise.all(
        ids.map((id) =>
          publicClient.readContract({
            address: marketAddress,
            abi: nftMarketAbi,
            functionName: "listings",
            args: [id],
          }),
        ),
      )) as ListingTuple[];

      const listings: ListingInfo[] = results
        .map((r, i) => ({
          listingId: BigInt(i),
          seller: r.seller,
          nftContract: r.nftContract,
          tokenId: r.tokenId,
          price: r.price,
          isActive: r.isActive,
        }))
        .filter((l) => l.isActive);

      setData(listings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    if (!enabled || !nftMarketAddress) {
      setData([]);
      return;
    }
    let active = true;
    refetch().finally(() => {
      if (active) setIsLoading(false);
    });
    const interval = setInterval(refetch, 6000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [enabled, refetch]);

  return { data, isLoading, error, refetch };
}
