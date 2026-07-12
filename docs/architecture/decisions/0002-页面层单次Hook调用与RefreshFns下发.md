# ADR-0002：页面层单次 Hook 调用与 RefreshFns 下发

- 状态：已接受
- 日期：2026-07-12
- 决策者：项目作者

## 背景

TokenBank 页面有 6 个卡片组件，其中 3 个需要读 Token 余额、2 个需要读授权额度、2 个需要读存款余额。

如果每个卡片各自调用对应的 Hook（如 `TokenBalanceCard` 内调 `useTokenBalance`、`DepositCard` 内也调 `useTokenBalance`），会产生两个问题：

1. **多轮询实例**：同一个 `useTokenBalance` 被调用 N 次，创建 N 个 4s `setInterval`，每分钟 ~N×15 次 RPC 调用
2. **跨卡片刷新失效**：`AllowanceCard` 的 `refetch` 只能刷新自己的 `useAllowance` 实例，无法刷新 `DepositCard` 内的 `useTokenBalance` 实例 → approve 后 DepositCard 看到的余额不更新

## 决策

页面层（`tokenbank/page.tsx`）单次调用所有数据 Hooks，通过 props 把数据下发给展示组件，通过 `RefreshFns` 对象把刷新能力下发给操作组件。

```typescript
// 页面层
const balance = useTokenBalance(account, enabled);
const allowance = useAllowance(account, tokenBankAddress, enabled);
const deposit = useDepositBalance(account, enabled);

const refresh = useMemo<RefreshFns>(() => ({
  balance: balance.refetch,
  allowance: allowance.refetch,
  deposit: deposit.refetch,
}), [balance.refetch, allowance.refetch, deposit.refetch]);

// 下发
<AllowanceCard allowance={allowance.data} refresh={refresh} />
<DepositCard balance={balance.data} allowance={allowance.data} refresh={refresh} />
```

## 备选方案

### 各卡片自调 Hook

**为什么不选**：
- 多轮询实例浪费 RPC
- 跨卡片刷新需要额外的事件总线或状态提升，更复杂

### React Context 共享数据

在页面层创建一个 `TokenBankDataContext`，把所有数据放进去，卡片从 Context 取。

**为什么不选**：
- 过度抽象，仅 6 个组件不需要全局 Context
- Context 值变化会触发所有消费者重渲染，需要额外 selector 优化
- props 更显式，数据流更易追踪

### 引入 React Query / SWR

用 `useQuery` 的 cache key 自动去重。

**为什么不选**：
- 违反 ADR-0001（不引入额外状态管理库）
- 学习项目自建 hooks 更有价值

## 后果

**正面**：
- 每个数据点只有一个轮询实例，RPC 调用最少
- 交易后 `refresh.xxx()` 刷新的是页面层唯一实例，所有卡片同步更新
- props 数据流显式，易于理解和调试

**负面**：
- 页面组件 props 传递较多（`tokenbank/page.tsx` 有较多 JSX props）
- 展示组件和操作组件的 props 接口不同，需分别设计
- 新增数据需求时需改页面层（但这是合理的，页面是组装点）

**关键约束**：
- `RefreshFns` 用 `useMemo` 稳定引用，避免操作组件因 `refresh` 变化而不必要重渲染
- Hook 的 `refetch` 用 `useCallback` 稳定，确保 `useMemo` 依赖不变

## 相关文档

- [03-模块设计/Hooks与数据流](../03-模块设计/Hooks与数据流.md) — Hook 层实现
- [03-模块设计/UI与页面层](../03-模块设计/UI与页面层.md) — 页面组装细节
