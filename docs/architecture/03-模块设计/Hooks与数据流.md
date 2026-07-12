# Hooks 与数据流

> 一句话定位：本文档回答「链上数据怎么读、怎么轮询、怎么在交易后刷新」，受众是开发者。

涵盖模块：`src/hooks/` 下的 4 个数据查询 Hook。

## Hook 清单

| Hook | 读取合约 | 函数 | 轮询 | 用途 |
|---|---|---|---|---|
| `useTokenMetadata(enabled)` | MyERC20 | name, symbol, decimals | 否（一次性） | 供格式化和显示 |
| `useTokenBalance(account, enabled)` | MyERC20 | balanceOf | 4s | 钱包 Token 余额 |
| `useAllowance(account, spender, enabled)` | MyERC20 | allowance | 4s | 授权额度 |
| `useDepositBalance(account, enabled)` | TokenBank | balanceOf | 4s | 银行存款余额 |

## 统一返回类型

```typescript
type Return = {
  data: T | null;        // T = TokenMetadata | bigint
  isLoading: boolean;    // 仅首次加载为 true，轮询时不触发
  error: Error | null;
  refetch: () => Promise<void>;
};
```

## 统一行为模式

每个 Hook 内部 `useEffect` 的逻辑：

```
enabled = false 或依赖缺失？
  → 清空 data/error，isLoading = false，return（不设 interval）

enabled = true 且依赖齐全？
  → isLoading = true
  → refetch()  // 首次立即拉取
  → isLoading = false（finally）
  → setInterval(refetch, 4000)  // 4s 轮询
  → cleanup: clearInterval + active = false
```

### `enabled` 参数

页面层传入 `connected && configOk`：
- 未连接钱包 → 不发请求（省 RPC 调用、避免报错）
- 配置缺失 → 不发请求（地址为 null）

### `isLoading` 语义

- `true`：仅首次加载（`data === null` 且正在请求）
- `false`：首次加载完成后的轮询不触发 `isLoading`（展示组件用 `isLoading && data === null` 判断是否显示"加载中"）

### `refetch` 稳定性

`refetch` 用 `useCallback` 包裹，依赖 `account` / `spender` / `publicClient`。当 account 不变时，`refetch` 引用稳定，不会触发 `useEffect` 重跑。

## 交易后刷新机制

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

### 各操作的刷新范围

| 操作 | 刷新 |
|---|---|
| approve | allowance + balance（approve 不改 balance，但保持一致性） |
| deposit | balance + deposit + allowance |
| withdraw | deposit + balance |

> 为什么不在 hook 内自动监听事件刷新？—— 学习项目保持简单，用轮询 + 手动刷新足够。事件订阅是 [07-演进路线](../07-演进路线.md) 中的技术债。

## 为什么页面层调 hooks 而非各卡片自调

如果每个卡片各自调用 `useTokenBalance` 等 hook：

1. **多轮询实例**：同一数据被 4s 轮询 N 次，浪费 RPC
2. **跨卡片刷新失效**：AllowanceCard 的 `refetch` 无法刷新 DepositCard 的数据

→ 页面层单次调用 + RefreshFns 下发 → [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md)

## 相关文档

- [UI与页面层](./UI与页面层.md) — 页面如何调用 hooks 并传 props
- [05-接口契约](../05-接口契约.md) — Hook 返回类型和 RefreshFns 定义
- [ADR-0002](../decisions/0002-页面层单次Hook调用与RefreshFns下发.md) — 决策详情

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建 | — |
