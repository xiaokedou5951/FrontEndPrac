# 多链支持实现计划

## 项目研究结论

当前项目 `wagmi-front` 使用单链配置：
- 通过环境变量 `NEXT_PUBLIC_CHAIN_ID` 和 `NEXT_PUBLIC_RPC_URL` 配置链
- 默认使用 foundry (chainId: 31337)
- 合约地址是全局的，不区分链

需要修改为支持三条链：
1. **Local** (foundry/anvil, chainId: 31337)
2. **Sepolia** (Ethereum 测试网, chainId: 11155111)
3. **Polygon** (Polygon PoS, chainId: 137)

## 文件修改清单

### 1. 修改配置文件

**`src/config/shared.ts`** - 支持多链定义
- 移除单链的 `chain` 和 `rpcUrl` 导出
- 添加支持的链列表 (foundry, sepolia, polygon)
- 添加根据链 ID 获取链定义的函数

**`src/config/nftmarket.ts`** - 支持多链合约地址
- 修改为按链 ID 存储合约地址

**`src/config/tokenbank.ts`** - 支持多链合约地址
- 修改为按链 ID 存储合约地址

### 2. 修改 AppKit 配置

**`src/lib/appkit.ts`** - 添加多网络支持
- 使用 viem 内置的链定义 (foundry, sepolia, polygon)
- 配置 networks 数组包含所有三条链
- 更新 defaultNetwork 配置

### 3. 修改 viem 工具

**`src/lib/viem.ts`** - 移除硬编码链
- 删除 `getPublicClient` 中的硬编码链配置
- 保留辅助函数 (`formatTokenAmount`, `parseTokenAmount` 等)

### 4. 更新 WalletContext

**`src/context/WalletContext.tsx`** - 移除单链依赖
- 移除对 `getPublicClient` 的调用
- 使用 wagmi 的 `usePublicClient` hook 获取当前链的 publicClient

### 5. 更新组件中的链引用

**`src/components/nftmarket/ListCard.tsx`** - 移除硬编码链
- 删除 `chain` 的导入和使用

**`src/components/nftmarket/BuyCard.tsx`** - 移除硬编码链
- 删除 `chain` 的导入和使用

### 6. 更新环境变量示例

**`.env.local.example`** - 支持多链配置
- 添加各链的 RPC URL 配置
- 添加各链的合约地址配置

## 步骤详解

### 步骤 1: 修改 `src/config/shared.ts`

```typescript
// 导出支持的链
export const chains = [foundry, sepolia, polygon] as const;

// 根据链 ID 获取链定义
export function getChain(chainId: number): Chain | undefined {
  return chains.find((c) => c.id === chainId);
}

// 默认链
export const defaultChain = foundry;
```

### 步骤 2: 修改 `src/lib/appkit.ts`

- 使用 `chains` 数组配置 networks
- 移除自定义链定义，使用 viem 内置链

### 步骤 3: 修改合约地址配置

将单链地址改为按链 ID 映射：

```typescript
export const nftMarketAddresses: Record<number, Address | null> = {
  [foundry.id]: process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL ? (process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL as Address) : null,
  [sepolia.id]: process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_SEPOLIA ? (process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_SEPOLIA as Address) : null,
  [polygon.id]: process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_POLYGON ? (process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_POLYGON as Address) : null,
};

export function getNftMarketAddress(chainId: number): Address | null {
  return nftMarketAddresses[chainId] ?? null;
}
```

### 步骤 4: 更新 `.env.local.example`

添加多链环境变量：
- `NEXT_PUBLIC_RPC_URL_LOCAL`
- `NEXT_PUBLIC_RPC_URL_SEPOLIA`
- `NEXT_PUBLIC_RPC_URL_POLYGON`
- `NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL/SEPOLIA/POLYGON`
- `NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL/SEPOLIA/POLYGON`
- `NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL/SEPOLIA/POLYGON`
- `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL/SEPOLIA/POLYGON`

## 潜在依赖和注意事项

1. **viem 链定义**：需要确认 viem 已导出 `sepolia` 和 `polygon` 链
2. **RPC URL**：需要为每条链提供有效的 RPC URL
3. **合约地址**：不同链上的合约地址不同，需要分别配置
4. **wagmi hooks**：使用 wagmi 的 hooks 时不需要指定链，wagmi 会自动使用当前连接的链
5. **钱包切换链**：AppKit 默认支持链切换，用户可以通过钱包 UI 切换链

## 风险处理

1. **合约地址缺失**：当用户切换到没有配置合约地址的链时，显示配置错误提示
2. **RPC URL 无效**：确保提供有效的 RPC URL，否则无法连接链
3. **链切换后数据刷新**：wagmi 会自动处理链切换后的状态更新

## 验证步骤

1. 修改完成后运行 `npm run build` 确保无编译错误
2. 配置 `.env.local` 后启动开发服务器
3. 连接钱包后测试链切换功能
4. 在不同链上测试合约交互功能
