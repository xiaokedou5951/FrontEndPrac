"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type Address,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from "viem";
import { getPublicClient, getWalletClient } from "@/lib/viem";

const CONNECTED_KEY = "tokenbank:walletConnected";

type WalletState = {
  account: Address | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
  walletClient: WalletClient | null;
  publicClient: PublicClient;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState | undefined>(undefined);

function getEthereumProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  return eth ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const publicClient = useMemo(() => getPublicClient(), []);

  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  const providerRef = useRef<EIP1193Provider | null>(null);

  const handleAccountsChanged = useCallback((accounts: Address[]) => {
    if (accounts.length === 0) {
      setAccount(null);
      setChainId(null);
      setWalletClient(null);
      localStorage.removeItem(CONNECTED_KEY);
    } else {
      setAccount(accounts[0]);
    }
  }, []);

  const handleChainChanged = useCallback((newChainIdHex: string) => {
    setChainId(Number.parseInt(newChainIdHex, 16));
  }, []);

  const attachListeners = useCallback(
    (provider: EIP1193Provider) => {
      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);
    },
    [handleAccountsChanged, handleChainChanged],
  );

  const detachListeners = useCallback(
    (provider: EIP1193Provider) => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    },
    [handleAccountsChanged, handleChainChanged],
  );

  const connect = useCallback(async () => {
    setError(null);
    const provider = getEthereumProvider();
    if (!provider) {
      setError("未检测到钱包，请安装 MetaMask 或其他 EIP-1193 钱包。");
      return;
    }
    setIsConnecting(true);
    try {
      const client = getWalletClient(provider);
      const [addresses, id] = await Promise.all([
        client.requestAddresses(),
        client.getChainId(),
      ]);
      if (addresses.length === 0) {
        setError("未返回任何账户。");
        return;
      }
      setAccount(addresses[0]);
      setChainId(id);
      setWalletClient(client);
      providerRef.current = provider;
      attachListeners(provider);
      localStorage.setItem(CONNECTED_KEY, "1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接钱包失败。");
    } finally {
      setIsConnecting(false);
    }
  }, [attachListeners]);

  const disconnect = useCallback(() => {
    const provider = providerRef.current;
    if (provider) {
      detachListeners(provider);
      providerRef.current = null;
    }
    setAccount(null);
    setChainId(null);
    setWalletClient(null);
    setError(null);
    localStorage.removeItem(CONNECTED_KEY);
  }, [detachListeners]);

  useEffect(() => {
    if (localStorage.getItem(CONNECTED_KEY) !== "1") return;
    const provider = getEthereumProvider();
    if (!provider) return;
    let cancelled = false;
    (async () => {
      try {
        const client = getWalletClient(provider);
        const addresses = await client.getAddresses();
        if (cancelled || addresses.length === 0) return;
        const id = await client.getChainId();
        setAccount(addresses[0]);
        setChainId(id);
        setWalletClient(client);
        providerRef.current = provider;
        attachListeners(provider);
      } catch {
        localStorage.removeItem(CONNECTED_KEY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachListeners]);

  useEffect(() => {
    return () => {
      const provider = providerRef.current;
      if (provider) {
        detachListeners(provider);
        providerRef.current = null;
      }
    };
  }, [detachListeners]);

  const value = useMemo<WalletState>(
    () => ({
      account,
      chainId,
      isConnecting,
      error,
      walletClient,
      publicClient,
      connect,
      disconnect,
    }),
    [
      account,
      chainId,
      isConnecting,
      error,
      walletClient,
      publicClient,
      connect,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (ctx === undefined) {
    throw new Error("useWallet 必须在 <WalletProvider> 内使用。");
  }
  return ctx;
}
