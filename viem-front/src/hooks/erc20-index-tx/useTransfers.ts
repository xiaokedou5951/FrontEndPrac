import { useWallet } from "@/context/WalletContext";
import { useState, useEffect, useCallback } from "react";
import type { TransferRecord } from "@/lib/database";

type UseTransfersResult = {
  transfers: TransferRecord[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  limit: number;
  refetch: () => void;
};

export function useTransfers(
  initialPage: number = 1,
  initialLimit: number = 20
): UseTransfersResult {
  const { account } = useWallet();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);

  const fetchTransfers = useCallback(async () => {
    if (!account) {
      setTransfers([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/transfers/${account}?page=${page}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setTransfers(result.data.transfers);
        setTotal(result.data.total);
        setLimit(result.data.limit);
      } else {
        setError(result.error || "Failed to fetch transfers");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transfers");
    } finally {
      setLoading(false);
    }
  }, [account, page, limit]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  return {
    transfers,
    loading,
    error,
    total,
    page,
    limit,
    refetch: fetchTransfers,
  };
}