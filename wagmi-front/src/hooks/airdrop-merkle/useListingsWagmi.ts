import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useReadContract, useReadContracts } from "wagmi";
import { airdropMerkleNftMarketAbi } from "@/contracts/airdropMerkleNftMarketAbi";
import { getAirdropMerkleAddress } from "@/config/airdropMerkle";
import type { ListingInfo } from "@/components/airdrop-merkle/types";

type Return = {
  data: ListingInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useListingsWagmi(enabled = true): Return {
  const { chainId } = useAccount();
  const marketAddress = chainId ? getAirdropMerkleAddress(chainId) : null;

  const {
    data: nextIdData,
    isLoading: nextIdLoading,
    error: nextIdError,
    refetch: refetchNextId,
  } = useReadContract({
    address: marketAddress ?? undefined,
    abi: airdropMerkleNftMarketAbi,
    functionName: "nextListingId",
    query: {
      enabled: enabled && !!marketAddress,
    },
  });

  const nextId = nextIdData ? BigInt(nextIdData) : 0n;
  const count = nextId > 0n ? Number(nextId) : 0;

  const contracts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        address: marketAddress ?? undefined,
        abi: airdropMerkleNftMarketAbi,
        functionName: "listings" as const,
        args: [BigInt(i)] as const,
      })),
    [count, marketAddress],
  );

  const {
    data: listingsData,
    isLoading: listingsLoading,
    error: listingsError,
    refetch: refetchListings,
  } = useReadContracts({
    contracts,
    query: {
      enabled: enabled && !!marketAddress && count > 0,
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
