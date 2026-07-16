import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";
import { rpcUrl, chain as viemChain } from "@/config/shared";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error(
    "请在 .env.local 中配置 NEXT_PUBLIC_REOWN_PROJECT_ID（从 https://cloud.reown.com 获取）",
  );
}

const appKitChain: AppKitNetwork = defineChain({
  id: viemChain.id,
  caipNetworkId: `eip155:${viemChain.id}`,
  chainNamespace: "eip155",
  name: viemChain.name,
  nativeCurrency: viemChain.nativeCurrency,
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Foundry", url: "" },
  },
});

export const networks = [appKitChain] as [AppKitNetwork, ...AppKitNetwork[]];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

// 自定义链在 WalletConnect 网络列表中没有默认图标，提供一个占位图标
const chainIconSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23626262"/><text x="50" y="58" font-size="32" text-anchor="middle" fill="white">F</text></svg>`;

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: appKitChain,
  projectId,
  metadata: {
    name: "TokenBank Demo",
    description: "基于 Next.js + Viem 的链上合约交互演示",
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    icons: [],
  },
  chainImages: {
    [appKitChain.id]: chainIconSvg,
  },
  features: {
    analytics: false,
  },
});
