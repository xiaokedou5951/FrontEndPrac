import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error(
    "请在 .env.local 中配置 NEXT_PUBLIC_REOWN_PROJECT_ID（从 https://cloud.reown.com 获取）",
  );
}

const appKitFoundry = defineChain({
  id: 31337,
  caipNetworkId: "eip155:31337",
  chainNamespace: "eip155",
  name: "Foundry",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  blockExplorers: {
    default: { name: "Foundry", url: "" },
  },
  testnet: true,
});

const appKitSepolia = defineChain({
  id: 11155111,
  caipNetworkId: "eip155:11155111",
  chainNamespace: "eip155",
  name: "Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.org"] },
    public: { http: ["https://rpc.sepolia.org"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
});

const appKitPolygon = defineChain({
  id: 137,
  caipNetworkId: "eip155:137",
  chainNamespace: "eip155",
  name: "Polygon",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://polygon-rpc.com"] },
    public: { http: ["https://polygon-rpc.com"] },
  },
  blockExplorers: {
    default: { name: "PolygonScan", url: "https://polygonscan.com" },
  },
  testnet: false,
});

export const networks = [appKitFoundry, appKitSepolia, appKitPolygon] as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

const chainIconSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23626262"/><text x="50" y="58" font-size="32" text-anchor="middle" fill="white">F</text></svg>`;

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: appKitFoundry,
  projectId,
  metadata: {
    name: "TokenBank Demo",
    description: "基于 Next.js + Viem 的链上合约交互演示",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    icons: [],
  },
  chainImages: {
    [appKitFoundry.id]: chainIconSvg,
  },
  features: {
    analytics: false,
  },
});