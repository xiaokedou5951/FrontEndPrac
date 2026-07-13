# NFTMarket 测试工具集

本目录包含以下独立脚本，用于 NFTMarket 的端到端测试：

| 脚本 | 用途 |
| --- | --- |
| [`mint-nfts.mjs`](./mint-nfts.mjs) | 调用 `SimpleNft.mint` 铸造 NFT，为上架 / 购买测试准备资产 |
| [`watch-events.mjs`](./watch-events.mjs) | 事件监听（HTTP 轮询版） |
| [`watch-events-ws.mjs`](./watch-events-ws.mjs) | 事件监听（WebSocket 推送版，推荐） |

所有脚本均使用 viem-front 已安装的 `viem` 依赖，无需额外安装，默认连本地 anvil。

## 两个监听版本的区别

| | `watch-events.mjs` (HTTP) | `watch-events-ws.mjs` (WebSocket) |
| --- | --- | --- |
| Transport | `http()` 轮询 | `webSocket()` 推送 |
| 实现方式 | 周期性 `eth_getLogs` | `eth_subscribe` 订阅 |
| 延迟 | 受 `POLLING_INTERVAL` 限制（默认 1s） | 事件入块即推送，毫秒级 |
| 配置变量 | `NEXT_PUBLIC_RPC_URL` | `NEXT_PUBLIC_WS_URL` |
| 适用场景 | WS 不可用时的兜底 | 实时监听首选 |

## 快速开始

```bash
cd viem-front

# 1. 后台启动事件监听（推荐 WS 版，另开一个终端）
node test/nftmarket/watch-events-ws.mjs

# 2. 铸造 NFT（默认 5 个，并自动授权 NFTMarket）
node test/nftmarket/mint-nfts.mjs

# 3. 在前端 /nftmarket 页面或用 cast 上架、购买，观察监听终端的实时日志
```

---

## mint-nfts.mjs — 铸造 NFT

```bash
node test/nftmarket/mint-nfts.mjs
```

## 配置来源

脚本会自动加载 `viem-front/.env.local`（与前端共用同一份配置），优先级：

```
CLI 环境变量  >  .env.local  >  代码内默认值
```

即 `MINT_COUNT=10 node ...` 会覆盖 `.env.local` 中的值，而 `.env.local` 又会覆盖代码内默认值。

| 脚本变量 | `.env.local` 中的键 | 默认值（无文件时） |
| --- | --- | --- |
| `SIMPLE_NFT_ADDRESS` | `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS` | `0x95401dc811bb5740090279Ba06cfA8fcF6113778` |
| `NFT_MARKET_ADDRESS` | `NEXT_PUBLIC_NFT_MARKET_ADDRESS` | `0xf5059a5D33d5853360D16C683c16e67980206f36` |
| `RPC_URL` | — | `http://127.0.0.1:8545` |
| `CHAIN_ID` | — | `31337` |
| `MINTER_PRIVATE_KEY` | — | anvil 账户 #0（仅本地测试） |
| `MINT_TO` | — | = minter |
| `MINT_COUNT` | — | `5` |
| `MINT_START_ID` | — | `1` |
| `APPROVE_MARKET` | — | `1`（置 `0` 跳过 `setApprovalForAll`） |

> 合约地址改在 `.env.local` 里改一次即可，前端和脚本同步生效。其他铸造参数（数量、起始 ID 等）按需通过 CLI 环境变量传入。

## 流程

1. 用 `MINTER_PRIVATE_KEY` 创建 walletClient
2. 依次铸造 `tokenId ∈ [MINT_START_ID, MINT_START_ID + MINT_COUNT)`，每笔等待 receipt 并回读 `ownerOf` 校验
3. 若 `APPROVE_MARKET=1` 且 `MINT_TO` = minter，调用 `setApprovalForAll(NFT_MARKET_ADDRESS, true)` 并回读 `isApprovedForAll` 校验
4. 打印汇总与下一步操作提示

## 示例

```bash
# 铸造 10 个，tokenId 100..109，给另一个地址
MINT_COUNT=10 MINT_START_ID=100 \
MINT_TO=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
node test/nftmarket/mint-nfts.mjs

# 跳过授权步骤
APPROVE_MARKET=0 node test/nftmarket/mint-nfts.mjs
```

> ⚠️ 当 `MINT_TO` ≠ minter 时，脚本不会自动为 recipient 授权 NFTMarket（需要 recipient 自己的私钥）。请用 recipient 私钥单独调用 `setApprovalForAll`，或在 NFTMarket 页面通过钱包发起授权。

## 铸造后测试 NFTMarket

| 步骤 | 操作 | 调用 |
| --- | --- | --- |
| 1 | 用 minter 账户连接前端 `/nftmarket` 页面 | — |
| 2 | 上架 NFT | `NFTMarket.list(SimpleNft, tokenId, price)` |
| 3 | 用买家账户 `approve` 支付代币给 NFTMarket | `MyERC20.approve(NFTMarket, price)` |
| 4 | 买家购买 | `NFTMarket.buyNFT(listingId)` 或 `buyNFTWithCallback(listingId)` |

## 涉及的合约

- `SimpleNft` (`contracts/src/SimpleNft.sol`) — 仅实现最小 ERC721 接口，`mint(to, tokenId)` 直接写 `_owners[tokenId] = to`
- `NFTMarket` (`contracts/src/NFTMarket.sol`) — `list` 时校验 `ownerOf` / `isApprovedForAll` / `getApproved`，故铸造后必须授权市场合约才能上架

---

## watch-events.mjs — 事件监听

```bash
node test/nftmarket/watch-events.mjs
```

脚本启动后会先回放从 `FROM_BLOCK`（默认 0，即创世块）以来的历史事件，然后进入实时监听，按 `Ctrl+C` 退出并打印汇总。

### 监听的事件

| 事件 | 颜色 | 含义 | 关键字段 |
| --- | --- | --- | --- |
| `NFTListed` | 绿色 | NFT 上架 | `listingId` / `seller` / `nftContract` / `tokenId` / `price` |
| `NFTSold` | 洋红 | NFT 售出 | `listingId` / `buyer` / `seller` / `nftContract` / `tokenId` / `price` |
| `NFTListingCancelled` | 黄色 | 取消上架 | `listingId` |

### 输出示例

```
02:40:14 [LISTED] block=58 logIdx=0
         listingId=0  seller=0xf39Fd6e5...b92266  nft=0x95401dc8...113778  tokenId=1  price=200 TOKEN
         tx=0x221cf4faebcbbb8bcf3ea7a435f8d78a76fc7151946f7e8aba5c8c188f0675da
02:41:44 [SOLD  ] block=67 logIdx=1
         listingId=1  buyer=0xf39Fd6e5...b92266  seller=0xf39Fd6e5...b92266  nft=0x95401dc8...113778  tokenId=200  price=50 TOKEN
         tx=0x639c85a83f1dfa637e03c5d9b8e333d3c9075df6c10939c0d43eb1f30e436b04
```

`price` 用 `PAYMENT_DECIMALS`（默认 18，匹配 MyERC20）格式化为可读金额。

### 配置（环境变量覆盖）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NFT_MARKET_ADDRESS` | `NEXT_PUBLIC_NFT_MARKET_ADDRESS` | 监听的 NFTMarket 合约（与前端共用） |
| `FROM_BLOCK` | `0` | 历史回放起始块；设为较大值可跳过历史 |
| `POLLING_INTERVAL` | `1000` (ms) | 轮询间隔，anvil 本地可调小 |
| `PAYMENT_DECIMALS` | `18` | 价格格式化精度 |

例：只看实时事件、不回放历史：

```bash
FROM_BLOCK=999999 node test/nftmarket/watch-events.mjs
```

### 工作原理

脚本使用 viem 的 `publicClient.watchEvent({ events, fromBlock, onLogs })`：
- `fromBlock` 设为 0 时，首次轮询会回放 `[0, latest]` 的全部历史日志，之后自动切换为实时监听新块
- `onLogs` 批量回调，每条日志按事件类型解码并格式化打印
- `Ctrl+C` 触发 `SIGINT`，调用 `unwatch()` 取消订阅并打印各事件计数汇总

---

## watch-events-ws.mjs — 事件监听 (WebSocket)

```bash
node test/nftmarket/watch-events-ws.mjs
```

通过 `eth_subscribe` 实时推送事件，无轮询延迟。与 HTTP 版的输出格式完全一致（颜色 / 字段 / 汇总），只是底层 transport 不同。

### 与 HTTP 版的关键差异

- **Transport**：`webSocket(WS_URL)` 替代 `http(RPC_URL)`，`watchEvent` 自动走 `eth_subscribe`
- **无 `POLLING_INTERVAL`**：事件入块即推送，不依赖轮询
- **心跳检测**：每 `HEARTBEAT_INTERVAL`（默认 15s）做一次 `getBlockNumber` 探活，仅在连接状态变化时打印日志（连接建立 / 异常 / 恢复）
- **自动重连**：viem `webSocket()` transport 内置 `reconnect: true`，断线后指数退避重连，`watchEvent` 会自动重新订阅

### 配置（环境变量覆盖）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WS_URL` | `NEXT_PUBLIC_WS_URL` | WebSocket 端点（anvil 默认 `ws://127.0.0.1:8545`，同端口复用 HTTP+WS） |
| `NFT_MARKET_ADDRESS` | `NEXT_PUBLIC_NFT_MARKET_ADDRESS` | 监听的 NFTMarket 合约 |
| `FROM_BLOCK` | `0` | 历史回放起始块 |
| `HEARTBEAT_INTERVAL` | `15000` (ms) | 心跳探活间隔 |
| `PAYMENT_DECIMALS` | `18` | 价格格式化精度 |

### anvil 的 WebSocket

anvil 默认在 HTTP 端口（8545）上同时复用 WebSocket，无需额外开启 WS 端口。脚本默认连 `ws://127.0.0.1:8545`。若 anvil 以 `--port` 指定了其他端口，相应修改 `NEXT_PUBLIC_WS_URL` 即可。

### 输出示例（与 HTTP 版一致）

```
✓ WebSocket 连接已建立
✓ 实时订阅已启动，按 Ctrl+C 退出

02:55:07 [LISTED] block=69 logIdx=0
         listingId=3  seller=0xf39Fd6e5...b92266  nft=0x95401dc8...113778  tokenId=300  price=5 TOKEN
         tx=0xb61d7302af0123cd50503c856e3658c7bd9f11370707ffb78ffaf08fc7912645
```
