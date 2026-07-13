# 术语表

> 一句话定位：本文档回答「这个术语什么意思」，受众是所有人。

## 链上交互

| 术语 | 释义 |
|---|---|
| **EIP-1193** | 以太坊钱包 provider 标准接口，定义 `request` 方法和事件监听。`window.ethereum` 即为 EIP-1193 provider。 |
| **anvil** | Foundry 工具链提供的本地开发链，默认 chain ID 31337，监听 127.0.0.1:8545。 |
| **foundry** | viem 内置的 chain 定义，对应 anvil 本地链（ID 31337）。 |
| **ERC20** | 以太坊同质化代币标准。定义 `balanceOf`、`transfer`、`approve`、`allowance` 等接口。 |
| **ERC721** | 以太坊非同质化代币（NFT）标准。定义 `ownerOf`、`transferFrom`、`approve`、`setApprovalForAll`、`isApprovedForAll` 等接口。 |
| **approve / allowance** | ERC20 授权机制。`approve(spender, amount)` 授权 spender 可动用 amount 代币；`allowance(owner, spender)` 查询剩余授权额度。 |
| **setApprovalForAll** | ERC721 授权机制。`setApprovalForAll(operator, true)` 授权 operator 可转移调用者名下所有 NFT；NFTMarket 上架前需先调用此方法授权市场。 |
| **safeTransferFrom** | OpenZeppelin SafeERC20 的安全转账函数。TokenBank 存款时调用，要求调用者已 approve 足够额度。 |
| **revert** | 合约交易执行失败、状态回滚。`receipt.status === "reverted"` 表示交易被回滚。 |
| **publicClient** | viem 的只读链客户端，通过 HTTP RPC 读取链上状态（readContract、waitForTransactionReceipt、getContractEvents、watchEvent）。 |
| **walletClient** | viem 的钱包客户端，通过 EIP-1193 provider 发起交易（writeContract、requestAddresses）。 |
| **paymentToken** | NFTMarket 合约中用于支付的 ERC20 代币地址。本项目复用 MyERC20，部署脚本将 `TOKEN_ADDRESS` 传入 NFTMarket 构造函数。 |

## 前端架构

| 术语 | 释义 |
|---|---|
| **App Router** | Next.js 13+ 的路由系统，基于文件系统，`app/` 目录下文件即路由。 |
| **Server Component** | 仅在服务端执行的 React 组件，不携带 `'use client'` 指令。不能使用 hooks、事件监听等浏览器 API。 |
| **Client Component** | 带 `'use client'` 指令的 React 组件，在浏览器端执行，可使用 hooks、`window`、事件监听。 |
| **WalletProvider** | 本项目的 React Context Provider，管理钱包连接状态，包裹在根 layout 中。 |
| **按功能拆分** | 资源（ABI、config、hooks、components）按 `tokenbank/`、`nftmarket/`、`shared/` 三组组织，功能间互不依赖。详见 [ADR-0004](./decisions/0004-按功能拆分资源.md)。 |
| **shared/** | 跨功能复用的资源目录。含 `erc20Abi`、`config/shared.ts`（rpcUrl/chain/tokenAddress）、`useTokenMetadata`、`components/shared/WalletBar`、`components/ui/`。 |
| **RefreshFns** | TokenBank 页面层打包的刷新函数集合 `{ balance, allowance, deposit }`，通过 props 传给操作组件。 |
| **RefreshFn** | NFTMarket 页面层打包的单函数刷新 `() => Promise<void>`（刷新 listings），下发给 ListCard / BuyCard / CancelCard。 |
| **展示组件** | 无 `'use client'`，纯函数式，所有数据通过 props 传入的组件。如 TokenBalanceCard、ListingsTable。 |
| **操作组件** | `'use client'`，内部调 `useWallet()` 取 walletClient，含交易逻辑的组件。如 AllowanceCard、BuyCard。 |
| **轮询** | 定时（4s 或 6s）重复调用 `readContract` 刷新链上数据的机制。用 `setInterval` 实现。 |
| **事件订阅** | 通过 `watchEvent` 持续监听链上事件并回调的机制。NFTMarket 用此捕获 NFTListed/NFTSold/NFTListingCancelled。 |
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
| **getContractEvents** | 一次性拉取合约历史事件，接受完整 `abi` 自动解码。NFTMarket 启动时用此拉取所有历史 NFTListed/NFTSold。 |
| **watchEvent** | 持续订阅合约事件，通过轮询新区块发现匹配事件后回调 `onLogs`。**只接受 `event`/`events`，不接受完整 `abi`**。 |
| **unwatch** | `watchEvent` 返回的取消订阅函数，调用后停止轮询。组件卸载时在 cleanup 中调用。 |
| **AbiEvent** | ABI 中事件类型的 TypeScript 表示。`nftMarketEvents` 是 `AbiEvent[]`，专门给 `watchEvent` 用。 |

## 项目特定

| 术语 | 释义 |
|---|---|
| **TokenBank** | 存取款合约。用户先 approve 授权，再 deposit 存款，可 withdraw 取款。本项目两个功能之一。 |
| **NFTMarket** | NFT 交易市场合约。支持 list 上架、buyNFT 购买、cancelListing 取消。本项目两个功能之一。 |
| **MyERC20** | 标准 ERC20 代币合约，构造时向部署者铸造 1,000,000 * 1e18。同时作为 TokenBank 的存款代币和 NFTMarket 的 paymentToken。 |
| **Listing** | NFTMarket 中的上架记录结构体 `{ seller, nftContract, tokenId, price, isActive }`。通过 `listings(listingId)` 读取。 |
| **listingId** | NFTMarket 上架记录的自增 ID，从 0 开始。`list` 返回新分配的 listingId。 |
| **NFTListed / NFTSold / NFTListingCancelled** | NFTMarket 的三个事件。分别在上架、购买、取消时触发，前端通过 `useNFTMarketEvents` 订阅。 |
| **MarketLog** | 前端事件日志的统一形状，由链上事件解码而来。含 eventName、listingId、txHash、blockNumber 等字段。 |
| **configOk** | 各功能配置模块导出的布尔值，表示该功能所需地址 env 是否都配置且格式合法。`config/tokenbank.ts` 和 `config/nftmarket.ts` 各导出一个。 |
| **safeParseTokenAmount** | `lib/viem.ts` 中的安全解析函数，`parseUnits` 失败时返回 `0n` 而非抛异常。 |

## 相关文档

- [README](./README.md) — 文档入口
