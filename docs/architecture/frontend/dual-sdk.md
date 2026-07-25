# viem vs wagmi 双套前端

## 为什么两套前端

项目目标是学习链上合约交互，而业界有两种主流范式：

| 维度 | viem-front | wagmi-front |
|------|-----------|-------------|
| 学习目标 | viem 底层 API：手动创建 client、手动管理状态 | wagmi React Hooks：声明式数据获取 + 缓存 |
| 钱包连接 | 手写 WalletContext，直接调用 `window.ethereum` | AppKit 统一管理，支持 MetaMask / WalletConnect 等 |
| 链支持 | 单链（环境变量配置） | 多链（Foundry / Sepolia / Polygon / Optimism） |
| 状态管理 | useState + useEffect + setInterval 轮询 | useReadContract / useReadContracts + React Query 缓存 |
| 事件监听 | publicClient.watchEvent 手动订阅 | useContractEvents + useWatchContractEvent 声明式 |

## 架构对比

### 钱包层

**viem-front** — `viem-front/src/context/WalletContext.tsx`

```
window.ethereum → getWalletClient(provider) → useState 管理 account/chainId/walletClient
                  监听 accountsChanged / chainChanged 事件
                  localStorage 记住连接状态
```

**wagmi-front** — `wagmi-front/src/context/WalletContext.tsx` + `wagmi-front/src/lib/appkit.ts`

```
AppKit UI → WagmiAdapter → WagmiProvider → QueryClientProvider
            useAccount() 提供 address / chainId / isConnecting
            useWalletClient() 提供 walletClient
            usePublicClient() 提供 publicClient
```

wagmi-front 的 WalletContext 仅做薄适配层（统一 useWallet 接口），核心逻辑由 wagmi hooks 处理。

### 数据读取层

**viem-front** — 手写 Hook 模式

```typescript
// viem-front/src/hooks/tokenbank/useDepositBalance.ts
const [data, setData] = useState(null);
const refetch = async () => {
  const balance = await publicClient.readContract({...});
  setData(balance);
};
useEffect(() => {
  refetch();
  const interval = setInterval(refetch, 4000);  // 4秒轮询
  return () => clearInterval(interval);
}, [...]);
```

**wagmi-front** — wagmi Hook 模式

```typescript
// wagmi-front 中的 TokenBank hooks 目前仍为手写（尚未迁移），
// 但 NFTMarket 相关 hooks 已使用 wagmi：
// wagmi-front/src/hooks/nftmarket/useListingsWagmi.ts
const { data: nextIdData } = useReadContract({...});
const { data: listingsData } = useReadContracts({ contracts: [...] });
// React Query 自动管理缓存、refetch、loading/error
```

### 事件监听层

**viem-front** — `viem-front/src/hooks/nftmarket/useNFTMarketEvents.ts`

```
publicClient.getContractEvents()  → 拉取历史
publicClient.watchEvent()         → 轮询订阅新事件 (2s)
手动去重 (knownIdsRef: Set<string>)
```

**wagmi-front** — `wagmi-front/src/hooks/nftmarket/useNFTMarketEventsWagmi.ts`

```
useContractEvents()     → 拉取历史 (React Query 管理)
useWatchContractEvent() → 轮询订阅新事件 (2s)
手动去重 (knownIdsRef: Set<string>)
```

## 功能对齐关系

| 功能 | viem-front | wagmi-front |
|------|-----------|-------------|
| TokenBank 存款 | DepositCard | （尚未实现） |
| TokenBank 取款 | WithdrawCard | （尚未实现） |
| TokenBank 余额查询 | useDepositBalance / useTokenBalance | （尚未实现） |
| TokenBank 授权 | AllowanceCard | （尚未实现） |
| NFTMarket 上架 | ListCard | ListCard |
| NFTMarket 购买 | BuyCard | BuyCard |
| NFTMarket 取消 | CancelCard | CancelCard |
| NFTMarket 事件日志 | EventLogCard + useNFTMarketEvents | EventLogCard + useNFTMarketEventsWagmi |
| NFTMarket 挂单列表 | ListingsTable + useListings | ListingsTable + useListingsWagmi |
| NFT 授权 | ApproveNFTCard | ApproveNFTCard |
| NFTMarketPermit 签名生成 | （尚未实现） | SignPermitCard |
| NFTMarketPermit 白名单购买 | （尚未实现） | PermitBuyCard |
| NFTMarketPermit 签名地址展示 | （尚未实现） | SignerInfoCard |
| 多链切换 | 不支持 | 支持 (AppKit) |
| Token 元数据 | useTokenMetadata | useTokenMetadataWagmi |

## 差异点清单

1. **合约地址配置方式**：viem-front 用 `process.env.NEXT_PUBLIC_*` 直接读取；wagmi-front 按 chainId 分发 `get*Address(chainId)`
2. **publicClient 来源**：viem-front 手动 `createPublicClient`；wagmi-front 从 `usePublicClient()` 获取
3. **NFTMarketPermit 前端**：wagmi-front 已实现完整的白名单签名生成（SignPermitCard）和许可购买（PermitBuyCard）页面；viem-front 尚未实现
4. **TokenBank 页面**：viem-front 有完整实现；wagmi-front 尚未实现
5. **部署脚本**：viem-front 写 `NEXT_PUBLIC_TOKEN_ADDRESS`；wagmi-front 写 `NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL`（带链后缀）
