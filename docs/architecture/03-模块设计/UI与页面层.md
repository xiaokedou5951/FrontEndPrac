# UI 与页面层

> 一句话定位：本文档回答「组件怎么分层、页面怎么组装」，受众是开发者。

涵盖模块：`src/components/ui/`、`src/components/tokenbank/`、`src/app/`

## 组件分层

```
components/
├── ui/                    # 通用组件（无业务语义，可复用）
│   ├── Button.tsx         # variant: primary/secondary/danger + loading
│   ├── Card.tsx           # 标题 + 内容容器
│   └── AmountInput.tsx    # 受控小数输入 + 可选 Max 按钮
│
└── tokenbank/             # TokenBank 业务组件
    ├── types.ts           # RefreshFns 共享类型
    ├── WalletBar.tsx      # [客户端] 连接/断开 + 账号显示
    ├── TokenBalanceCard   # [展示] Token 余额
    ├── AllowanceCard      # [客户端] 授权额度 + approve 操作
    ├── DepositCard        # [客户端] 存款（含授权检查）
    ├── DepositBalanceCard # [展示] 存款余额
    └── WithdrawCard       # [客户端] 取款
```

## 展示组件 vs 操作组件

| 类型 | 特征 | 组件 |
|---|---|---|
| 展示组件 | 无 `'use client'`，纯函数式，所有数据通过 props 传入 | TokenBalanceCard, DepositBalanceCard |
| 操作组件 | `'use client'`，内部调 `useWallet()` 取 walletClient，含交易逻辑 | AllowanceCard, DepositCard, WithdrawCard |
| 混合 | `'use client'`，调 `useWallet()` 但不做交易 | WalletBar |

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

## 业务组件 Props 契约

### 展示组件

```typescript
// TokenBalanceCard
{ account, balance, isLoading, error, metadata }

// DepositBalanceCard
{ account, depositBalance, isLoading, error, metadata }
```

### 操作组件

```typescript
// AllowanceCard
{ allowance, metadata, refresh: RefreshFns }

// DepositCard
{ balance, allowance, metadata, refresh: RefreshFns }

// WithdrawCard
{ depositBalance, metadata, refresh: RefreshFns }
```

操作组件内部通过 `useWallet()` 获取 `account` / `walletClient` / `publicClient`，不从 props 接收。

## 操作组件的交易流程

以 AllowanceCard 为例：

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

### writeContract 的 chain 参数

viem 的 `WalletClient` 默认泛型为 `Chain | undefined`，当 chain 类型可能为 undefined 时，`writeContract` 要求显式传 `chain` 参数 → [06-横切关注点](../06-横切关注点.md)

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

项目简介 + 链接到 `/tokenbank` + "更多 Demo"占位。

### tokenbank/page.tsx（Client Component）

```
1. useWallet() → account
2. 单次调用 4 个 hooks（enabled = connected && configOk）
3. useMemo 打包 RefreshFns
4. if (!configOk) → 显示配置缺失卡片
5. 渲染：WalletBar + 2列网格（6张卡片）
```

### Hooks 调用顺序（不可变）

```typescript
const metadata = useTokenMetadata(configOk);
const balance = useTokenBalance(account, connected && configOk);
const allowance = useAllowance(account, tokenBankAddress, connected && configOk);
const deposit = useDepositBalance(account, connected && configOk);
const refresh = useMemo<RefreshFns>(...);

if (!configOk) return <配置缺失 />;
return <主内容 />;
```

> 所有 hooks 必须在条件返回之前调用，否则违反 React hooks 规则。

## 相关文档

- [05-接口契约](../05-接口契约.md) — 完整 Props 类型定义
- [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md) — 页面组装决策
- [ADR-0003](../decisions/0003-展示组件与操作组件分离.md) — 组件分层决策

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建 | — |
