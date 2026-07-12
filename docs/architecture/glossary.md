# 术语表

> 一句话定位：本文档回答「这个术语什么意思」，受众是所有人。

## 链上交互

| 术语 | 释义 |
|---|---|
| **EIP-1193** | 以太坊钱包 provider 标准接口，定义 `request` 方法和事件监听。`window.ethereum` 即为 EIP-1193 provider。 |
| **anvil** | Foundry 工具链提供的本地开发链，默认 chain ID 31337，监听 127.0.0.1:8545。 |
| **foundry** | viem 内置的 chain 定义，对应 anvil 本地链（ID 31337）。 |
| **ERC20** | 以太坊同质化代币标准。定义 `balanceOf`、`transfer`、`approve`、`allowance` 等接口。 |
| **approve / allowance** | ERC20 授权机制。`approve(spender, amount)` 授权 spender 可动用 amount 代币；`allowance(owner, spender)` 查询剩余授权额度。 |
| **safeTransferFrom** | OpenZeppelin SafeERC20 的安全转账函数。TokenBank 存款时调用，要求调用者已 approve 足够额度。 |
| **revert** | 合约交易执行失败、状态回滚。`receipt.status === "reverted"` 表示交易被回滚。 |
| **publicClient** | viem 的只读链客户端，通过 HTTP RPC 读取链上状态（readContract、waitForTransactionReceipt）。 |
| **walletClient** | viem 的钱包客户端，通过 EIP-1193 provider 发起交易（writeContract、requestAddresses）。 |

## 前端架构

| 术语 | 释义 |
|---|---|
| **App Router** | Next.js 13+ 的路由系统，基于文件系统，`app/` 目录下文件即路由。 |
| **Server Component** | 仅在服务端执行的 React 组件，不携带 `'use client'` 指令。不能使用 hooks、事件监听等浏览器 API。 |
| **Client Component** | 带 `'use client'` 指令的 React 组件，在浏览器端执行，可使用 hooks、`window`、事件监听。 |
| **WalletProvider** | 本项目的 React Context Provider，管理钱包连接状态，包裹在根 layout 中。 |
| **RefreshFns** | 页面层打包的刷新函数集合 `{ balance, allowance, deposit }`，通过 props 传给操作组件，用于交易后刷新链上数据。 |
| **展示组件** | 无 `'use client'`，纯函数式，所有数据通过 props 传入的组件。如 TokenBalanceCard。 |
| **操作组件** | `'use client'`，内部调 `useWallet()` 取 walletClient，含交易逻辑的组件。如 AllowanceCard。 |
| **轮询** | 定时（4s）重复调用 `readContract` 刷新链上数据的机制。用 `setInterval` 实现。 |
| **静默重连** | 页面刷新后检查 localStorage 标记，若之前连过钱包则用 `getAddresses()`（不弹窗）恢复连接。 |

## Viem 相关

| 术语 | 释义 |
|---|---|
| **parseUnits** | 将人类可读金额（如 "100.5"）按 decimals 转为 bigint（如 100500000000000000000n）。 |
| **formatUnits** | 将 bigint 按 decimals 转为人类可读字符串。 |
| **readContract** | 通过 publicClient 读取合约 view 函数，不上链、不花 gas。 |
| **writeContract** | 通过 walletClient 调用合约写函数，需钱包签名、上链、花 gas。 |
| **waitForTransactionReceipt** | 轮询等待交易被打包出块，返回包含 status 的 receipt。 |
| **defineChain** | viem 的链定义工具，用于创建自定义链配置（id、name、rpcUrls 等）。 |

## 项目特定

| 术语 | 释义 |
|---|---|
| **TokenBank** | 存取款合约。用户先 approve 授权，再 deposit 存款，可 withdraw 取款。 |
| **MyERC20** | 标准 ERC20 代币合约，构造时向部署者铸造 1,000,000 * 1e18。 |
| **configOk** | `config/contracts.ts` 导出的布尔值，表示两个合约地址 env 是否都配置且格式合法。 |
| **safeParseTokenAmount** | `lib/viem.ts` 中的安全解析函数，`parseUnits` 失败时返回 `0n` 而非抛异常。 |

## 相关文档

- [README](./README.md) — 文档入口
