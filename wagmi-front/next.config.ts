import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // wagmi v3 将部分 connector 依赖声明为可选 peer dependencies，
    // AppKit 引入 @wagmi/connectors 时会无条件引用这些模块。
    // 这里将未使用的 connector 模块标记为 false，避免打包失败。
    config.resolve.alias = {
      ...config.resolve.alias,
      // 未使用的 wagmi v3 connector 可选依赖
      porto: false,
      "porto/internal": false,
      accounts: false,
      "@metamask/connect-evm": false,
      "@walletconnect/ethereum-provider": false,
    };
    return config;
  },
};

export default nextConfig;
