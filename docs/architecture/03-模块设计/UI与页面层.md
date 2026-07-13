# UI 与页面层

> 一句话定位：本文档回答「组件怎么分层、页面怎么组装」，受众是开发者。

涵盖模块：`src/components/ui/`、`src/components/shared/`、`src/components/tokenbank/`、`src/components/nftmarket/`、`src/app/`

## 组件分层

```
components/
├── ui/                    # 通用组件（无业务语义，跨功能复用）
│   ├── Button.tsx         # variant: primary/secondary/danger + loading
│   ├── Card.tsx           # 标题 + 内容容器
│   ├── AmountInput.tsx    # 受控小数输入 + 可选 Max 按钮
│   └── AddressInput.tsx   # 地址输入 + 合法性高亮
│
├── shared/                # 跨功能复用的业务组件
│   └── WalletBar.tsx      # [客户端] 连接/断开 + 账号显示
│
├── tokenbank/             # TokenBank 业务组件
│   ├── types.ts           # RefreshFns 共享类型
│   ├── TokenBalanceCard   # [展示] Token 余额
│   ├── AllowanceCard      # [客户端] 授权额度 + approve 操作
│   ├── DepositCard        # [客户端] 存款（含授权检查）
│   ├── DepositBalanceCard # [展示] 存款余额
│   └── WithdrawCard       # [客户端] 取款
│
└── nftmarket/             # NFTMarket 业务组件
    ├── types.ts           # MarketLog / ListingInfo / RefreshFn / MarketEventName
    ├── ListCard           # [客户端] 上架 NFT
    ├── ApproveNFTCard     # [客户端] 授权 NFT 合约给市场
    ├── BuyCard            # [客户端] 购买（含代币额度检查与一键授权）
    ├── CancelCard         # [客户端] 取消上架
    ├── ListingsTable      # [展示] 活跃上架表格
    └── EventLogCard       # [客户端] 事件日志面板（含监听指示 + 清空）
```

## 展示组件 vs 操作组件

| 类型 | 特征 | TokenBank | NFTMarket |
|---|---|---|---|
| 展示组件 | 无 `'use client'`，纯函数式，所有数据通过 props 传入 | TokenBalanceCard, DepositBalanceCard | ListingsTable |
| 操作组件 | `'use client'`，内部调 `useWallet()` 取 walletClient，含交易逻辑 | AllowanceCard, DepositCard, WithdrawCard | ListCard, ApproveNFTCard, BuyCard, CancelCard |
| 客户端展示 | `'use client'`，调 `useWallet()` 但不做交易 | — | EventLogCard（消费 useNFTMarketEvents） |
| 混合 | `'use client'`，调 `useWallet()` 但不做交易 | WalletBar（已迁至 shared/） | WalletBar（复用 shared/） |

→ 为什么这么分？详见 [ADR-0003](../decisions/0003-展示组件与操作组件分离.md)

## 通用 UI 组件

### Button

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `variant` | `primary \| secondary \| danger` | `primary` | 颜色变体 |
| `loading` | `boolean` | `false` | 显示 spinner + disabled |
| `disabled` | `boolean` | — | 禁用 |
| `type` | `button \| submit` | `button` | 防止表单误提交 |
| `className` | `string` | — | 追加到默认样式后 |
| `...rest` | `ButtonHTMLAttributes` | — | 透传 onClick 等 |

### Card

| Prop | 类型 | 说明 |
|---|---|---|
| `title` | `ReactNode` | 可选标题 |
| `children` | `ReactNode` | 内容 |
| `className` | `string` | 追加样式 |

### AmountInput

| Prop | 类型 | 说明 |
|---|---|---|
| `value` | `string` | 受控值 |
| `onChange` | `(value: string) => void` | 变更回调 |
| `onMax` | `() => void` | 可选，显示 Max 按钮 |
| `suffix` | `ReactNode` | 可选后缀（如 symbol） |
| `disabled` | `boolean` | 禁用 |
| `placeholder` | `string` | 默认 `"0.0"` |

输入过滤：`/^\d*\.?\d*$/`，只允许数字和小数点。

### AddressInput

| Prop | 类型 | 说明 |
|---|---|---|
| `value` | `string` | 受控值 |
| `onChange` | `(value: string) => void` | 变更回调 |
| `disabled` | `boolean` | 禁用 |
| `invalid` | `boolean` | 是否非法（用于红色高亮） |
| `placeholder` | `string` | 默认 `"0x..."` |

合法性判断在父组件做（`isAddress(value)`），AddressInput 只负责根据 `invalid` 切换边框色。

## 业务组件 Props 契约

### TokenBank 展示组件

```typescript
// TokenBalanceCard
{ account, balance, isLoading, error, metadata }

// DepositBalanceCard
{ account, depositBalance, isLoading, error, metadata }
```

### TokenBank 操作组件

```typescript
// AllowanceCard
{ allowance, metadata, refresh: RefreshFns }

// DepositCard
{ balance, allowance, metadata, refresh: RefreshFns }

// WithdrawCard
{ depositBalance, metadata, refresh: RefreshFns }
```

操作组件内部通过 `useWallet()` 获取 `account` / `walletClient` / `publicClient`，不从 props 接收。

### NFTMarket 组件

```typescript
// ListCard
{ metadata, refresh: RefreshFn }

// ApproveNFTCard
{}  // 无 props，内部 useWallet()

// BuyCard
{ metadata, listings: ListingInfo[], refresh: RefreshFn }

// CancelCard
{ refresh: RefreshFn }

// ListingsTable
{ listings, isLoading, error, metadata }

// EventLogCard
{ logs: MarketLog[], isWatching, error, metadata, onClear }
```

NFTMarket 的 `RefreshFn` 是单函数 `() => Promise<void>`（刷新 listings），不同于 TokenBank 的多函数 `RefreshFns`。

## 操作组件的交易流程

以 AllowanceCard 为例（TokenBank）：

```
1. 用户输入金额 → safeParseTokenAmount(amount, decimals)
2. 点击"授权" → 校验 canSubmit（account 存在 + amount > 0）
3. walletClient.writeContract({ approve, chain })  ← chain 必须显式传
4. publicClient.waitForTransactionReceipt({ hash })
5. receipt.status === "reverted" → throw
6. setAmount("") + Promise.all([refresh.allowance(), refresh.balance()])
7. catch → setTxError
8. finally → setPending(false)
```

以 BuyCard 为例（NFTMarket）：

```
1. 用户输入 listingId → 找到对应 listing
2. 检查 erc20 allowance(account, nftMarketAddress) 是否 ≥ price
3. 不足 → 显示"授权支付代币"按钮，点击先 approve(price) 再 fetchAllowance
4. 充足 → walletClient.writeContract({ buyNFT, chain })
5. waitForTransactionReceipt → reverted 则 throw
6. 成功 → Promise.all([refresh(), fetchAllowance()])
7. useNFTMarketEvents 在后台独立捕获 NFTSold 事件
```

### writeContract 的 chain 参数

viem 的 `WalletClient` 默认泛型为 `Chain | undefined`，当 chain 类型可能为 undefined 时，`writeContract` 要求显式传 `chain` 参数 → [06-横切关注点](../06-横切关注点.md)

所有操作组件从 `@/config/shared` 导入 `chain`。

## 页面层

### layout.tsx（Server Component）

```
<html lang="zh-CN">
  <body>
    <WalletProvider>{children}</WalletProvider>
  </body>
</html>
```

### page.tsx（首页，Server Component）

项目简介 + 链接到 `/tokenbank` 和 `/nft-market`。

### tokenbank/page.tsx（Client Component）

```
1. useWallet() → account
2. 单次调用 4 个 hooks（enabled = connected && configOk）
3. useMemo 打包 RefreshFns
4. if (!configOk) → 显示配置缺失卡片
5. 渲染：WalletBar + 2列网格（5张卡片）
```

### nft-market/page.tsx（Client Component）

```
1. useWallet() → account
2. useTokenMetadata(!!tokenAddress)            // 复用共享 hook
3. useListings(configOk)                       // NFTMarket 专属
4. useNFTMarketEvents(configOk)                // NFTMarket 专属
5. useMemo 打包 refreshListings = listings.refetch
6. if (!configOk) → 显示配置缺失卡片
7. 渲染：WalletBar + 3列网格（4张操作卡 + ListingsTable）+ EventLogCard
```

### Hooks 调用顺序（不可变）

TokenBank 页面：

```typescript
const metadata = useTokenMetadata(configOk);
const balance = useTokenBalance(account, connected && configOk);
const allowance = useAllowance(account, tokenBankAddress, connected && configOk);
const deposit = useDepositBalance(account, connected && configOk);
const refresh = useMemo<RefreshFns>(...);

if (!configOk) return <配置缺失 />;
return <主内容 />;
```

NFTMarket 页面：

```typescript
const metadata = useTokenMetadata(!!tokenAddress);
const listings = useListings(configOk);
const events = useNFTMarketEvents(configOk);
const refreshListings = useMemo(() => listings.refetch, [listings.refetch]);

if (!configOk) return <配置缺失 />;
return <主内容 />;
```

> 所有 hooks 必须在条件返回之前调用，否则违反 React hooks 规则。

## 相关文档

- [05-接口契约](../05-接口契约.md) — 完整 Props 类型定义
- [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md) — 页面组装决策
- [ADR-0003](../decisions/0003-展示组件与操作组件分离.md) — 组件分层决策
- [ADR-0004](../decisions/0004-按功能拆分资源.md) — 资源按功能拆分决策

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建（仅 TokenBank） | — |
| 2026-07-13 | 新增 NFTMarket 组件、shared/WalletBar、AddressInput | — |
