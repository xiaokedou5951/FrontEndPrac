"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useContractEvents, useWatchContractEvent } from "wagmi";
import { nftMarketAbi } from "@/contracts/nftMarketAbi";
import { nftMarketAddress } from "@/config/nftmarket";
import type { MarketLog, MarketEventName } from "@/components/nftmarket/types";

const MAX_LOGS = 200;

type DecodedLog = {
  eventName: MarketEventName;
  args: Record<string, unknown>;
  transactionHash: string;
  blockNumber: bigint | null;
  logIndex: number;
};

function makeId(txHash: string, logIndex: number): string {
  return `${txHash}:${logIndex}`;
}

function getAddress(args: Record<string, unknown>, key: string): Address | undefined {
  const v = args[key];
  return typeof v === "string" ? (v as Address) : undefined;
}

function getBigInt(args: Record<string, unknown>, key: string): bigint | undefined {
  const v = args[key];
  return typeof v === "bigint" ? v : undefined;
}

function toMarketLog(log: DecodedLog): MarketLog {
  const base: MarketLog = {
    id: makeId(log.transactionHash, log.logIndex),
    eventName: log.eventName,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    listingId: getBigInt(log.args, "listingId") ?? null,
    timestamp: Date.now(),
  };

  switch (log.eventName) {
    case "NFTListed":
      return {
        ...base,
        seller: getAddress(log.args, "seller"),
        nftContract: getAddress(log.args, "nftContract"),
        tokenId: getBigInt(log.args, "tokenId"),
        price: getBigInt(log.args, "price"),
      };
    case "NFTSold":
      return {
        ...base,
        seller: getAddress(log.args, "seller"),
        buyer: getAddress(log.args, "buyer"),
        nftContract: getAddress(log.args, "nftContract"),
        tokenId: getBigInt(log.args, "tokenId"),
        price: getBigInt(log.args, "price"),
      };
    case "NFTListingCancelled":
    default:
      return base;
  }
}

function formatLogForConsole(log: MarketLog): string {
  const parts: string[] = [`#${log.listingId ?? "?"}`];
  if (log.seller) parts.push(`seller=${log.seller}`);
  if (log.buyer) parts.push(`buyer=${log.buyer}`);
  if (log.nftContract) parts.push(`nft=${log.nftContract}`);
  if (log.tokenId !== undefined) parts.push(`tokenId=${log.tokenId.toString()}`);
  if (log.price !== undefined) parts.push(`price=${log.price.toString()}`);
  parts.push(`block=${log.blockNumber?.toString() ?? "?"}`);
  parts.push(`tx=${log.txHash}`);
  return parts.join(" ");
}

export function useNFTMarketEventsWagmi(enabled = true) {
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const {
    data: pastLogs,
    isLoading,
    error: pastError,
  } = useContractEvents({
    address: nftMarketAddress ?? undefined,
    abi: nftMarketAbi,
    fromBlock: 0n,
    query: {
      enabled: enabled && !!nftMarketAddress,
    },
  });

  const addLogs = useCallback((incoming: MarketLog[]) => {
    const fresh = incoming.filter((l) => !knownIdsRef.current.has(l.id));
    if (fresh.length === 0) return;
    fresh.forEach((l) => {
      knownIdsRef.current.add(l.id);
      console.log(`[NFTMarket][${l.eventName}] ${formatLogForConsole(l)}`, l);
    });
    setLogs((prev) => [...fresh, ...prev].slice(0, MAX_LOGS));
  }, []);

  useEffect(() => {
    if (!pastLogs) return;
    const mapped = (pastLogs as unknown as DecodedLog[])
      .map(toMarketLog)
      .sort((a, b) => {
        const an = a.blockNumber ?? 0n;
        const bn = b.blockNumber ?? 0n;
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
    addLogs(mapped);
  }, [pastLogs, addLogs]);

  useEffect(() => {
    setIsWatching(enabled && !isLoading && !pastError);
    setError(pastError?.message ?? null);
  }, [enabled, isLoading, pastError]);

  useWatchContractEvent({
    address: nftMarketAddress ?? undefined,
    abi: nftMarketAbi,
    enabled: enabled && !!nftMarketAddress,
    pollingInterval: 2000,
    onLogs: (events) => {
      const mapped = (events as unknown as DecodedLog[]).map(toMarketLog);
      addLogs(mapped);
    },
  });

  const clear = useCallback(() => {
    knownIdsRef.current.clear();
    setLogs([]);
  }, []);

  return { logs, isWatching, error, clear };
}
