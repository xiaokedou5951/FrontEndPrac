import type { Address } from "viem";

export type MarketEventName = "NFTListed" | "NFTSold" | "NFTListingCancelled";

export type MarketLog = {
  id: string;
  eventName: MarketEventName;
  blockNumber: bigint | null;
  txHash: string;
  listingId: bigint | null;
  seller?: Address;
  buyer?: Address;
  nftContract?: Address;
  tokenId?: bigint;
  price?: bigint;
  timestamp: number;
};

export type ListingInfo = {
  listingId: bigint;
  seller: Address;
  nftContract: Address;
  tokenId: bigint;
  price: bigint;
  isActive: boolean;
};

export type RefreshFn = () => Promise<void>;
