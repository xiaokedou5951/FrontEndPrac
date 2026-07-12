# TokenBank 前端设计与实现计划

## 摘要

在 `/Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/`（当前为空目录）下，从零搭建一个 Next.js + TypeScript + Tailwind CSS 4 + Viem v2 的前端项目，实现对已部署的 `TokenBank` 与 `MyERC20` 合约的交互：连接钱包、查看 Token 余额、授权、存款、查看存款金额、取款。

技术选型已与用户确认：
- **钱包连接**：直接使用 Viem v2（`createWalletClient` + `custom(window.ethereum)`），自建 React Context + Hooks，**不引入 wagmi / RainbowKit**，贴合 PRD 显式技术栈与"学习与链上合约交互"的目标。
- **合约地址**：通过 `NEXT_PUBLIC_*` 环境变量配置，默认填入已发现的 anvil 部署地址，用户重新部署后改 env 即可。

## 现状分析（Phase 1 探索结论）

### 合约（已编译，位于 `contracts/out/`）

**TokenBank.sol** — 已部署于本地 anvil (chain 31337)
- ABI 函数：
  - `deposit(uint256 _amount)` — 存款（需先 approve）
  - `withdraw(uint256 _amount)` — 取款
  - `balanceOf(address _user) → uint256` — 查询用户存款
  - `deposits(address) → uint256` — 公开 mapping（与 balanceOf 等价）
  - `token() → address` — 底层 ERC20 地址
- 事件：`Deposit(address indexed user, uint256 amount)`、`Withdraw(address indexed user, uint256 amount)`
- 错误：`SafeERC20FailedOperation(address token)`
- 关键约束：`deposit` 内部调用 `token.safeTransferFrom`，**用户必须先在 Token 合约上 `approve(tokenBankAddress, amount)`**。

**MyERC20.sol** — 标准 ERC20 + `transferWithCallback`
- ABI 函数：`name()`、`symbol()`、`decimals()`、`totalSupply()`、`balanceOf(address)`、`transfer(address,uint256)`、`approve(address,uint256)`、`allowance(address,address)`、`transferFrom(address,address,uint256)`、`transferWithCallback(address,uint256,bytes)`
- 事件：`Approval`、`Transfer`
- 构造时向部署者铸造 1,000,000 * 1e18

### 部署记录（`contracts/broadcast/*/31337/run-latest.json`）

| 合约 | 地址 | 链 |
|---|---|---|
| TokenBank | `0xc5a5C42992dECbae36851359345FE25997F5C42d` | 31337 (anvil) |
| MyERC20 | `0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E` | 31337 (anvil) |

⚠️ **地址不一致**：TokenBank 构造时传入的 token 地址是 `0x5FbDB2315678afecb367f032d93F642f64180aa3`（旧部署），而最新 MyERC20 在 `0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E`。**用户需在重新部署 TokenBank 时把 `TOKEN_ADDRESS` 改为正确的 MyERC20 地址**，或确认当前 anvil 状态下哪个地址有效。前端通过 env 读取，不写死。

### 目标目录
- `/viem-front/` — 空目录，全新搭建。
- PRD 第 1 行明确："会有各种类型的合约，其对应的页面资源应各自独立" → 架构须支持扩展多个合约 Demo，TokenBank 为首个，放在 `src/app/tokenbank/`。

### 技术栈版本（2026 年 7 月当前稳定版）
- Next.js 15（App Router）
- React 19
- TypeScript 5.x
- Tailwind CSS 4（CSS-first 配置，`@import "tailwindcss"`，PostCSS 插件 `@tailwindcss/postcss`）
- Viem v2

## 假设与决策

1. **App Router**（非 Pages Router）— Next.js 现代默认。
2. **客户端组件为主**：钱包交互依赖浏览器 `window.ethereum`，TokenBank 页面及相关组件使用 `'use client'`。根 layout 保持 Server Component。
3. **链配置**：默认 `foundry`（anvil, chain 31337），从 `viem/chains` 导入。RPC 默认 `http://127.0.0.1:8545`，可通过 `NEXT_PUBLIC_RPC_URL` 覆盖。
4. **地址配置**：`NEXT_PUBLIC_TOKEN_ADDRESS`、`NEXT_PUBLIC_TOKENBANK_ADDRESS` 写入 `.env.local`，提供 `.env.local.example`。`src/config/contracts.ts` 读取并校验非空，缺失时在 UI 给出明确提示。
5. **ABI 管理**：手写精简 ABI（仅用到的函数）放 `src/contracts/abis/`，作为 TypeScript 常量导出。不引入自动生成工具（如 wagmi cli），保持简单并利于学习。
6. **状态管理**：单一 `WalletContext` 管理连接状态；每个数据查询用独立 hook（`useTokenBalance` 等），内部用 `useEffect` + 定时轮询（4s）+ 交易后手动刷新。不引入 react-query，避免偏离技术栈。
7. **钱包假设**：用户浏览器已注入 EIP-1193 provider（MetaMask 等）。未注入时显示安装引导。
8. **金额输入**：以"人类可读单位"（如 100 MTK）输入，内部用 `parseUnits` 按 `decimals()` 转换；显示用 `formatUnits`。
9. **不实现**：多链切换 UI（仅支持配置的单一链）、交易历史列表、事件订阅日志面板。聚焦 PRD 5 条需求。
10. **不做过度抽象**：不为"未来合约"提前建通用框架，仅通过目录结构（`app/<contract-name>/`、`components/<contract-name>/`）预留扩展位。

## 目录结构（待创建）

```
viem-front/
├── package.json
├── tsconfig.json
├── next.config.ts
├── next-env.d.ts
├── postcss.config.mjs
├── .env.local.example
├── .gitignore
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # 根布局（Server Component），挂载 WalletProvider
│   │   ├── page.tsx                    # 首页：项目简介 + 导航到各合约 Demo
│   │   ├── globals.css                 # @import "tailwindcss"; + 基础样式
│   │   └── tokenbank/
│   │       └── page.tsx                # TokenBank Demo 页（client，组合各功能卡片）
│   ├── config/
│   │   └── contracts.ts                # 读取 env，导出 tokenAddress/tokenBankAddress/chain/rpcUrl
│   ├── contracts/
│   │   └── abis.ts                     # tokenBankAbi、erc20Abi（精简手写，const ... as const）
│   ├── context/
│   │   └── WalletContext.tsx           # WalletProvider + useWallet：account/chain/clients/connect/disconnect
│   ├── hooks/
│   │   ├── useTokenBalance.ts          # ERC20 balanceOf(account)
│   │   ├── useAllowance.ts             # ERC20 allowance(account, tokenBankAddress)
│   │   ├── useDepositBalance.ts        # TokenBank balanceOf(account)
│   │   └── useTokenMetadata.ts         # name/symbol/decimals（一次读取，供格式化）
│   ├── lib/
│   │   └── viem.ts                     # 创建 publicClient（http）、walletClient（custom(window.ethereum)）工厂
│   └── components/
│       ├── ui/
│       │   ├── Button.tsx              # 通用按钮（variant: primary/secondary/danger）
│       │   ├── Card.tsx                # 通用卡片容器
│       │   └── AmountInput.tsx         # 金额输入（受控，max 按钮）
│       └── tokenbank/
│           ├── WalletBar.tsx           # 顶栏：连接/断开 + 账号 + 链
│           ├── TokenBalanceCard.tsx    # 需求2：钱包 Token 余额
│           ├── AllowanceCard.tsx       # 需求5：授权额度 + approve 操作
│           ├── DepositCard.tsx         # 需求2：存款（内含授权不足提示）
│           ├── DepositBalanceCard.tsx  # 需求3：存款金额
│           └── WithdrawCard.tsx        # 需求4：取款
```

## 实施步骤

### 步骤 1：初始化项目骨架
- 在 `viem-front/` 创建 `package.json`，依赖：`next@15`、`react@19`、`react-dom@19`、`viem@^2`、`typescript`、`@types/react`、`@types/node`、`tailwindcss@^4`、`@tailwindcss/postcss@^4`。
- `tsconfig.json`：`target ES2022`、`module bundler`、`jsx preserve`、paths `@/* -> src/*`。
- `next.config.ts`：空配置（默认）。
- `postcss.config.mjs`：`export default { plugins: { '@tailwindcss/postcss': {} } }`。
- `next-env.d.ts`：由 next 生成，手动放占位。
- `.gitignore`：`node_modules`、`.next`、`.env.local`、`out`、`*.log`。
- `src/app/globals.css`：`@import "tailwindcss";` + 基础 body 样式。
- 运行 `npm install`（实施阶段）。

### 步骤 2：配置与 ABI
- `src/config/contracts.ts`：
  - 读取 `process.env.NEXT_PUBLIC_TOKEN_ADDRESS`、`NEXT_PUBLIC_TOKENBANK_ADDRESS`、`NEXT_PUBLIC_RPC_URL`（默认 `http://127.0.0.1:8545`）。
  - 导出 `tokenAddress`、`tokenBankAddress`、`rpcUrl`，以及 `chain`（`foundry`，可被 `NEXT_PUBLIC_CHAIN_ID` 覆盖时用 `defineChain` 自建）。
  - 导出 `configOk` 布尔，标记地址是否齐全，供 UI 提示。
- `src/contracts/abis.ts`：手写 `erc20Abi`（name/symbol/decimals/balanceOf/allowance/approve）与 `tokenBankAbi`（deposit/withdraw/balanceOf/token/deposits），用 `as const` 保证类型推断。

### 步骤 3：Viem 客户端工厂
- `src/lib/viem.ts`：
  - `getPublicClient()`：`createPublicClient({ chain, transport: http(rpcUrl) })`。
  - `getWalletClient(ethereum)`：`createWalletClient({ chain, transport: custom(ethereum) })`。
  - 导出 `formatTokenAmount`/`parseTokenAmount` 辅助（基于 decimals）。

### 步骤 4：Wallet Context
- `src/context/WalletContext.tsx`（`'use client'`）：
  - State：`account: Address | null`、`chainId: number | null`、`isConnecting`、`error`。
  - `connect()`：检测 `window.ethereum`；`walletClient.requestAddresses()` → set account；`getChainId()` → set chainId；监听 `accountsChanged`/`chainChanged`。
  - `disconnect()`：清空 state（不调用 wallet 方法，MetaMask 无断开 API）。
  - 暴露 `walletClient`、`publicClient`。
  - 首次挂载检查 `localStorage` 之前是否连过（简单标记），若曾连接则尝试 silent reconnect。
  - 用 `useMemo` 稳定 context value。

### 步骤 5：数据 Hooks
每个 hook 接受 `enabled` 参数（未连接时禁用），返回 `{ data, isLoading, error, refetch }`，内部 `useEffect` 设 4s 轮询，并在 hook 返回的 `refetch` 上手动触发。
- `useTokenMetadata()`：读 `name`/`symbol`/`decimals`，一次性缓存。
- `useTokenBalance(account)`：`readContract` ERC20 `balanceOf`。
- `useAllowance(account, spender)`：`readContract` ERC20 `allowance`。
- `useDepositBalance(account)`：`readContract` TokenBank `balanceOf`。

### 步骤 6：UI 基础组件
- `Button`：props `variant`、`disabled`、`loading`、`onClick`、`children`。
- `Card`：标题 + 子内容容器，统一圆角/阴影/间距。
- `AmountInput`：受控数字输入 + Max 按钮（可选填入全部余额）。
均用 Tailwind 类，无自定义 CSS。

### 步骤 7：TokenBank 功能组件
- `WalletBar`：未连接显示"连接钱包"按钮；已连接显示截断地址 + 链 ID + 断开按钮。
- `TokenBalanceCard`：调 `useTokenBalance`，显示 `formatUnits(balance, decimals) symbol`。
- `AllowanceCard`：
  - 调 `useAllowance(account, tokenBankAddress)`，显示当前额度。
  - AmountInput + "授权"按钮 → `walletClient.writeContract` ERC20 `approve(tokenBankAddress, parseUnits(amount))`；等待交易 `publicClient.waitForTransactionReceipt`；成功后 `refetch` allowance 与余额。
- `DepositCard`：
  - AmountInput + "存款"按钮。
  - 校验：amount > 0、≤ 余额；若 amount > allowance，按钮置灰并提示"请先授权至少 {amount}"。
  - `writeContract` TokenBank `deposit(parseUnits(amount))` → 等待确认 → 刷新余额、存款余额、allowance。
- `DepositBalanceCard`：调 `useDepositBalance`，显示银行内存款金额。
- `WithdrawCard`：
  - AmountInput + "取款"按钮。
  - 校验：amount > 0、≤ 存款余额。
  - `writeContract` TokenBank `withdraw(parseUnits(amount))` → 等待 → 刷新存款余额、Token 余额。

### 步骤 8：页面组装
- `src/app/layout.tsx`：`<html><body>` 包裹 `<WalletProvider>`，引入 `globals.css`。
- `src/app/page.tsx`：首页，简短介绍 + 链接到 `/tokenbank`（后续可加更多合约入口）。
- `src/app/tokenbank/page.tsx`（`'use client'`）：若 `!configOk` 显示 env 配置缺失提示；否则垂直排列各卡片（WalletBar → TokenBalanceCard → AllowanceCard → DepositCard → DepositBalanceCard → WithdrawCard）。

### 步骤 9：环境变量样例与文档
- `.env.local.example`：
  ```
  NEXT_PUBLIC_TOKEN_ADDRESS=0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E
  NEXT_PUBLIC_TOKENBANK_ADDRESS=0xc5a5C42992dECbae36851359345FE25997F5C42d
  NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
  ```
  注释提醒：TokenBank 必须指向正确的 token 地址，重新部署后更新。
- 复制为 `.env.local`（实施阶段）。

### 步骤 10：启动与验证
- `npm run dev`，浏览器访问 `http://localhost:3000/tokenbank`。
- 前置：anvil 已运行，合约已部署，MetaMask 已导入 anvil 账户（`0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266` 私钥）并连接到 localhost 8545 网络。

## 验证步骤（Verification）

按 PRD 5 条需求逐项验证：

1. **连接钱包**：点击"连接钱包"，MetaMask 弹窗授权，顶栏显示账号地址与 chainId 31337。
2. **余额 + 存款**：连接后 `TokenBalanceCard` 显示部署账户的 1,000,000 MTK（或其余额）。`DepositCard` 输入金额可存款。
3. **存款金额**：存款成功后 `DepositBalanceCard` 数值增加；`TokenBalanceCard` 数值减少。
4. **取款**：`WithdrawCard` 输入金额取款，成功后存款余额减少、Token 余额回升。
5. **授权额度**：`AllowanceCard` 输入金额点"授权"，MetaMask 确认后当前额度更新显示；存款时若额度不足有明确提示。

边界检查：
- 未连接钱包时各卡片显示"请先连接钱包"占位，不发起读请求。
- env 地址缺失时页面显示配置提示而非崩溃。
- 金额输入非数字/超余额时按钮禁用并提示。
- 账户切换/链切换后状态自动更新。

## 不在本次范围

- wagmi / RainbowKit 集成
- 多链切换、Sepolia 部署前端（仅本地 anvil，但 env 可改）
- 事件日志订阅展示
- 交易历史
- 单元测试 / E2E（学习项目，聚焦功能）
- 国际化、深色模式等非核心体验
