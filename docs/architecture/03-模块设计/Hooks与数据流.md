# Hooks 与数据流

> 一句话定位：本文档回答「链上数据怎么读、怎么轮询、怎么订阅事件、怎么在交易后刷新」，受众是开发者。

涵盖模块：
- `src/hooks/useTokenMetadata.ts`（共享）
- `src/hooks/tokenbank/`（3 个轮询 hook）
- `src/hooks/nftmarket/`（2 个 hook：列表查询 + 事件订阅）

## Hook 清单

### 共享

| Hook | 读取合约 | 函数 | 轮询 | 用途 |
|---|---|---|---|---|
| `useTokenMetadata(enabled)` | MyERC20 | name, symbol, decimals | 否（一次性） | 供格式化和显示，TokenBank 与 NFTMarket 共用 |

### TokenBank（`src/hooks/tokenbank/`）

| Hook | 读取合约 | 函数 | 轮询 | 用途 |
|---|---|---|---|---|
| `useTokenBalance(account, enabled)` | MyERC20 | balanceOf | 4s | 钱包 Token 余额 |
| `useAllowance(account, spender, enabled)` | MyERC20 | allowance | 4s | 授权额度（spender 传 tokenBankAddress） |
| `useDepositBalance(account, enabled)` | TokenBank | balanceOf | 4s | 银行存款余额 |

### NFTMarket（`src/hooks/nftmarket/`）

| Hook | 读取合约 | 函数/方法 | 机制 | 用途 |
|---|---|---|---|---|
| `useListings(enabled)` | NFTMarket | nextListingId + listings(id) | 6s 轮询 + 手动 refetch | 活跃上架列表 |
| `useNFTMarketEvents(enabled)` | NFTMarket | getContractEvents + watchEvent | 历史拉取 + 2s 轮询订阅 | 后台事件日志（NFTListed / NFTSold / NFTListingCancelled） |

## 统一返回类型（轮询类 Hook）

```typescript
type Return = {
  data: T | null;        // T = TokenMetadata | bigint
  isLoading: boolean;    // 仅首次加载为 true，轮询时不触发
  error: Error | null;
  refetch: () => Promise<void>;
};
```

`useListings` 返回 `{ data: ListingInfo[]; isLoading; error: string | null; refetch }`（`data` 默认 `[]`，`error` 为 `string`）。
`useNFTMarketEvents` 返回 `{ logs: MarketLog[]; isWatching: boolean; error: string | null; clear: () => void }`（无 refetch，事件驱动追加）。

## 统一行为模式（轮询类 Hook）

每个轮询 Hook 内部 `useEffect` 的逻辑：

```
enabled = false 或依赖缺失？
  → 清空 data/error，isLoading = false，return（不设 interval）

enabled = true 且依赖齐全？
  → isLoading = true
  → refetch()  // 首次立即拉取
  → isLoading = false（finally）
  → setInterval(refetch, 4000 或 6000)  // TokenBank 4s，NFTMarket listings 6s
  → cleanup: clearInterval + active = false
```

### `enabled` 参数

页面层传入 `connected && configOk`（TokenBank）或 `configOk`（NFTMarket，列表查询不依赖 account）：
- 未连接钱包 → 不发请求（省 RPC 调用、避免报错）
- 配置缺失 → 不发请求（地址为 null）

### `isLoading` 语义

- `true`：仅首次加载（`data === null` 且正在请求）
- `false`：首次加载完成后的轮询不触发 `isLoading`（展示组件用 `isLoading && data === null` 判断是否显示"加载中"）

### `refetch` 稳定性

`refetch` 用 `useCallback` 包裹，依赖 `account` / `spender` / `publicClient`。当 account 不变时，`refetch` 引用稳定，不会触发 `useEffect` 重跑。

## NFTMarket 事件订阅机制

`useNFTMarketEvents` 采用「历史拉取 + 实时订阅」双机制：

```
useEffect 启动
  ├─ 1. getContractEvents({ address, abi: nftMarketAbi, fromBlock: 0n })
  │     → 拉取全部历史事件，按 blockNumber 升序排列后追加到 state
  │
  └─ 2. watchEvent({ address, events: nftMarketEvents, pollingInterval: 2000, onLogs })
        → 每 2s 轮询新区块，发现匹配事件就回调 onLogs
        → 解码为 MarketLog 后追加到 state 前部
        → 同时 console.log 打印到浏览器控制台
```

### 关键技术点

| 点 | 说明 |
|---|---|
| `watchEvent` 用 `events` 不用 `abi` | viem 的 `watchEvent` 只接受 `event`（单个）或 `events`（AbiEvent 数组），不接受完整 `abi`；故单独导出 `nftMarketEvents` 常量 |
| `getContractEvents` 用 `abi` | 拉历史事件时接受完整 `abi`，自动解码所有事件 |
| `Set` 去重 | 历史事件与 watchEvent 订阅可能重叠（订阅瞬间区块已出），用 `knownIdsRef: Set<string>` 按 `txHash:logIndex` 去重 |
| 闭包类型收窄 | `nftMarketAddress` 是 `Address \| null`，在 async 闭包中 TS 不保留收窄；hook 内捕获 `const marketAddress = nftMarketAddress` 后使用 |
| `MAX_LOGS = 200` | 防止内存无限增长，超出时丢弃最旧日志 |
| cleanup | `unwatch()` 取消订阅 + `cancelled = true` 阻止异步回调 |

### MarketLog 形状

```typescript
type MarketLog = {
  id: string;                    // `${txHash}:${logIndex}` 去重键
  eventName: "NFTListed" | "NFTSold" | "NFTListingCancelled";
  blockNumber: bigint | null;
  txHash: string;
  listingId: bigint | null;
  timestamp: number;             // 前端收到时间
  // NFTListed / NFTSold 扩展字段：
  seller?: Address;
  buyer?: Address;               // 仅 NFTSold
  nftContract?: Address;
  tokenId?: bigint;
  price?: bigint;
};
```

## 交易后刷新机制

### TokenBank：手动 RefreshFns

```
操作组件（如 AllowanceCard）
  → walletClient.writeContract(...)  // 发交易
  → publicClient.waitForTransactionReceipt({ hash })  // 等确认
  → receipt.status === "reverted" ? throw : 继续
  → Promise.all([refresh.allowance(), refresh.balance()])  // 并行刷新
```

`refresh` 是 `RefreshFns` 对象，由页面层通过 `useMemo` 打包传入：

```typescript
type RefreshFns = {
  balance: () => Promise<void>;
  allowance: () => Promise<void>;
  deposit: () => Promise<void>;
};
```

#### 各操作的刷新范围

| 操作 | 刷新 |
|---|---|
| approve | allowance + balance（approve 不改 balance，但保持一致性） |
| deposit | balance + deposit + allowance |
| withdraw | deposit + balance |

### NFTMarket：事件驱动 + 手动 refetch

NFTMarket 的刷新分两层：
1. **手动 refetch**：list / buy / cancel 后立即调 `refresh()`（即 `useListings.refetch`），UI 即时刷新
2. **事件订阅**：`useNFTMarketEvents` 在后台捕获 NFTListed/NFTSold/NFTListingCancelled，打印日志并更新 EventLogCard

```typescript
// BuyCard 成功后
await Promise.all([refresh(), fetchAllowance()]);
// useNFTMarketEvents 在后台独立捕获 NFTSold 事件
```

> NFTMarket 没有采用 RefreshFns 多函数包，因为只有一个数据源（listings）需要刷新；代币 allowance 是 BuyCard 内部状态。

## 为什么页面层调 hooks 而非各卡片自调

如果每个卡片各自调用对应的 Hook：

1. **多轮询实例**：同一数据被 4s 轮询 N 次，浪费 RPC
2. **跨卡片刷新失效**：AllowanceCard 的 `refetch` 无法刷新 DepositCard 的数据

→ 页面层单次调用 + RefreshFns 下发 → [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md)

NFTMarket 同理：`useListings` 在页面层调一次，`refreshListings` 下发给 ListCard / BuyCard / CancelCard。

## 相关文档

- [UI与页面层](./UI与页面层.md) — 页面如何调用 hooks 并传 props
- [05-接口契约](../05-接口契约.md) — Hook 返回类型和 RefreshFns 定义
- [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md) — 决策详情

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建（仅 TokenBank） | — |
| 2026-07-13 | 新增 NFTMarket hooks 与事件订阅机制 | — |
