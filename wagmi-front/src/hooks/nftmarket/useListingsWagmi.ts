import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { nftMarketAddress } from "@/config/nftmarket";
import type { ListingInfo } from "@/components/nftmarket/types";

type Return = {
  data: ListingInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useListingsWagmi(enabled = true): Return {
  const {
    data: nextIdData,
    isLoading: nextIdLoading,
    error: nextIdError,
    refetch: refetchNextId,
  } = useReadContract({
    address: nftMarketAddress ?? undefined,
    abi: nftMarketAbi,
    functionName: "nextListingId",
    query: {
      enabled: enabled && !!nftMarketAddress,
    },
  });

  const nextId = nextIdData ? BigInt(nextIdData) : 0n;
  const count = nextId > 0n ? Number(nextId) : 0;

  const contracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: nftMarketAddress ?? undefined,
        abi: nftMarketAbi,
        functionName: "listings" as const,
        args: [BigInt(i)] as const,
      })),
    [count],
  );

  const {
    data: listingsData,
    isLoading: listingsLoading,
    error: listingsError,
    refetch: refetchListings,
  } = useReadContracts({
    contracts,
    query: {
      enabled: enabled && !!nftMarketAddress && count > 0,
    },
  });

  const data = useMemo<ListingInfo[]>(() => {
    if (!listingsData) return [];
    return listingsData
      .map((result, i) => {
        if (result.status === "failure" || !result.result) return null;
        const r = result.result as {
          seller: `0x${string}`;
          nftContract: `0x${string}`;
          tokenId: bigint;
          price: bigint;
          isActive: boolean;
        };
        return {
          listingId: BigInt(i),
          seller: r.seller,
          nftContract: r.nftContract,
          tokenId: r.tokenId,
          price: r.price,
          isActive: r.isActive,
        };
      })
      .filter((item): item is ListingInfo => item !== null && item.isActive);
  }, [listingsData]);

  const refetch = async () => {
    await Promise.all([refetchNextId(), refetchListings()]);
  };

  const error = nextIdError?.message ?? (listingsError?.message ?? null);

  return {
    data,
    isLoading: nextIdLoading || listingsLoading,
    error,
    refetch,
  };
}
