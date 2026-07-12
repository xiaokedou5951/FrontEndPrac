"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { nftMarketAbi, nftMarketEvents } from "@/contracts/nftMarketAbi";
import { nftMarketAddress } from "@/config/nftmarket";
import { useWallet } from "@/context/WalletContext";
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

/**
 * 后台监听 NFTMarket 的 NFTListed / NFTSold / NFTListingCancelled 事件。
 * - 启动时拉取历史事件
 * - 通过 watchEvent 订阅新区块中的事件
 * - 每条事件同时打印到浏览器控制台和组件状态
 */
export function useNFTMarketEvents(enabled = true) {
  const { publicClient } = useWallet();
  const [logs, setLogs] = useState<MarketLog[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !nftMarketAddress) return;
    const marketAddress = nftMarketAddress;
    let unwatch: (() => void) | undefined;
    let cancelled = false;

    const addLogs = (incoming: MarketLog[]) => {
      const fresh = incoming.filter((l) => !knownIdsRef.current.has(l.id));
      if (fresh.length === 0) return;
      fresh.forEach((l) => {
        knownIdsRef.current.add(l.id);
        // 后台日志打印
        console.log(
          `[NFTMarket][${l.eventName}] ${formatLogForConsole(l)}`,
          l,
        );
      });
      // 新事件排在最前
      setLogs((prev) => [...fresh, ...prev].slice(0, MAX_LOGS));
    };

    const init = async () => {
      try {
        // 1. 拉取历史事件，按区块号升序排列
        const past = (await publicClient.getContractEvents({
          address: marketAddress,
          abi: nftMarketAbi,
          fromBlock: 0n,
        })) as unknown as DecodedLog[];

        if (cancelled) return;

        const pastMapped = past
          .map(toMarketLog)
          .sort((a, b) => {
            const an = a.blockNumber ?? 0n;
            const bn = b.blockNumber ?? 0n;
            return an < bn ? -1 : an > bn ? 1 : 0;
          });
        addLogs(pastMapped);

        // 2. 订阅后续新事件
        unwatch = publicClient.watchEvent({
          address: marketAddress,
          events: nftMarketEvents,
          pollingInterval: 2000,
          onLogs: (events) => {
            const mapped = (events as unknown as DecodedLog[]).map(toMarketLog);
            addLogs(mapped);
          },
        });

        if (cancelled) {
          unwatch();
          return;
        }
        setIsWatching(true);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unwatch) unwatch();
    };
  }, [enabled, publicClient]);

  const clear = useCallback(() => {
    knownIdsRef.current.clear();
    setLogs([]);
  }, []);

  return { logs, isWatching, error, clear };
}
