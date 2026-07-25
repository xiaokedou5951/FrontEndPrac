# 合约-前端集成约定

## ABI 管理

### 现状

ABI 以 TypeScript 常量手写，位于 `src/contracts/` 目录：

| 文件 | 内容 | 两套前端是否相同 |
|------|------|-----------------|
| `erc20Abi.ts` | ERC20 标准接口 (balanceOf / approve / allowance / transfer / transferFrom / name / symbol / decimals) | 相同 |
| `tokenBankAbi.ts` | TokenBank 完整 ABI (deposit / withdraw / balanceOf / deposits / token + Deposit/Withdraw 事件 + SafeERC20FailedOperation error) | 相同 |
| `nftMarketAbi.ts` | NFTMarket ABI + erc721Abi + nftMarketEvents | 相同 |

### 同步规则

1. 合约接口变更时，需**同时更新** `viem-front/src/contracts/` 和 `wagmi-front/src/contracts/` 下的对应文件
2. ABI 使用 `as const` 断言，确保 TypeScript 推断出精确类型
3. `nftMarketEvents` 单独导出，因为 viem 的 `watchEvent` 需要单独传入 events 而非完整 abi
4. 当前未使用代码生成工具（如 wagmi-cli），因为合约规模小且变更不频繁

## 合约地址配置

### viem-front（单链）

环境变量直接读取，无链后缀：

```typescript
// viem-front/src/config/shared.ts
export const tokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;

// viem-front/src/config/tokenbank.ts
export const tokenBankAddress = process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS;

// viem-front/src/config/nftmarket.ts
export const nftMarketAddress = process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS;
```

链信息也由环境变量控制：

```typescript
const envChainId = process.env.NEXT_PUBLIC_CHAIN_ID ? Number(...) : 31337;
export const chain = envChainId === 31337 ? foundry : defineChain({...});
```

### wagmi-front（多链）

合约地址按 chainId 分发，环境变量带链后缀：

```typescript
// wagmi-front/src/config/shared.ts
export function getTokenAddress(chainId: number): Address | null {
  switch (chainId) {
    case foundry.id:   return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL;
    case sepolia.id:   return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA;
    case polygon.id:   return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_POLYGON;
    case optimism.id:  return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_OPTIMISM;
  }
}
```

链定义在 AppKit 初始化时固定（foundry / sepolia / polygon / optimism），不可动态添加。

### 环境变量命名对比

| 合约 | viem-front | wagmi-front |
|------|-----------|-------------|
| MyERC20 | `NEXT_PUBLIC_TOKEN_ADDRESS` | `NEXT_PUBLIC_TOKEN_ADDRESS_{LOCAL,SEPOLIA,POLYGON,OPTIMISM}` |
| TokenBank | `NEXT_PUBLIC_TOKENBANK_ADDRESS` | `NEXT_PUBLIC_TOKENBANK_ADDRESS_{LOCAL,...}` |
| NFTMarket | `NEXT_PUBLIC_NFT_MARKET_ADDRESS` | `NEXT_PUBLIC_NFT_MARKET_ADDRESS_{LOCAL,...}` |
| SimpleNft | `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS` | `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_{LOCAL,...}` |

## 配置校验

两套前端均在 config 模块中提供 `configOk` / `configError`：

```typescript
// viem-front
export const configOk = tokenAddress !== null && tokenBankAddress !== null;
export const configError: string | null = ...;  // 列出缺失的变量

// wagmi-front
export function getConfigOk(chainId: number): boolean { ... }
export function getConfigError(chainId: number): string | null { ... }  // 含链名和具体变量名
```

组件中根据 `configOk` 决定是否渲染交互区域，`configError` 展示给用户。

## 多链切换流程（wagmi-front）

```
用户在 AppKit 中切换链
    │
    ├─ wagmi 内部: account.chainId 变更
    │
    ├─ hooks 重新执行: useReadContract / useReadContracts 自动用新 chainId 的地址
    │   getNftMarketAddress(newChainId) → 新地址 → 重新查询
    │
    ├─ config 校验: getConfigOk(newChainId)
    │   ├─ true → 正常渲染
    │   └─ false → 显示 getConfigError 提示配置缺失
    │
    └─ 注意: 切换链后 React Query 缓存基于 chainId + address 区分，不会混淆
```

## 关键约束

1. **TokenBank.token() 必须等于 NEXT_PUBLIC_TOKEN_ADDRESS**：否则存款时 `transferFrom` 会失败。部署脚本在部署后会链上回读校验。
2. **NFTMarket.paymentToken() 必须等于 NEXT_PUBLIC_TOKEN_ADDRESS**：同理。
3. **wagmi-front 的 AppKit 需要 NEXT_PUBLIC_REOWN_PROJECT_ID**：从 https://cloud.reown.com 获取，缺失时应用无法启动。
4. **viem-front 的 RPC URL 默认指向本地 anvil**：生产环境需通过 `NEXT_PUBLIC_RPC_URL` 覆盖。
