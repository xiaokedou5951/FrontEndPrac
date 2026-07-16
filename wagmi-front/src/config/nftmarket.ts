import { isAddress, type Address } from "viem";

// NFTMarket 配置

const rawNftMarketAddress = process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS;

export const nftMarketAddress: Address | null =
  rawNftMarketAddress && isAddress(rawNftMarketAddress) ? (rawNftMarketAddress as Address) : null;

export const configOk = nftMarketAddress !== null;

export const configError: string | null = nftMarketAddress
  ? null
  : "缺少环境变量: NEXT_PUBLIC_NFT_MARKET_ADDRESS。请在 viem-front/.env.local 中配置后重启开发服务器。";
