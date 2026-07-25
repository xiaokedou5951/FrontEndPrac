# NFT Market White 白名单购买页面实现计划

## 概述

在 `wagmi-front/src/app/nft-market-white/` 创建白名单用户购买 NFT 的页面，交互 NFTMarketPermit 合约的 `permitBuy(listingId, v, r, s)` 函数。页面需要：展示活跃上架列表、让用户输入签名信息进行白名单购买、监听链上事件。

## 当前状态分析

### 合约接口 (NFTMarketPermit)
- `list(nftContract, tokenId, price)` — 上架（与 NFTMarket 相同）
- `cancelListing(listingId)` — 取消上架（与 NFTMarket 相同）
- `buyNFT(listingId)` — 普通购买（保留）
- `permitBuy(listingId, v, r, s)` — **核心：白名单许可购买**
- `signer()` — 项目方签名地址（view）
- `domainSeparator()` — EIP-712 域分隔符（view）
- `PERMIT_TYPEHASH()` — 类型哈希（view, constant）
- `paymentToken()`, `nextListingId()`, `listings(id)` — 与 NFTMarket 相同
- 事件：`NFTListed`, `NFTSold`, `NFTListingCancelled` — 与 NFTMarket 相同

### 前端现有模式
- **页面结构**：`nft-market/page.tsx` 使用 `useAccount` + `useWallet` + config 校验 + 各功能 Card 组件 + ListingsTable + EventLogCard
- **组件模式**：每个操作一个 Card（ListCard, BuyCard, CancelCard, ApproveNFTCard），使用 `useWriteContract` + `useWaitForTransactionReceipt` 处理交易
- **配置模式**：多链地址通过 `config/nftmarket.ts` 中的 `getNftMarketAddress(chainId)` 获取，环境变量 `NEXT_PUBLIC_NFT_MARKET_ADDRESS_{LOCAL,SEPOLIA,...}`
- **ABI 模式**：手写 `as const` ABI，位于 `src/contracts/`
- **hooks 模式**：`useListingsWagmi` + `useNFTMarketEventsWagmi` 分别读取 listing 和监听事件
- **UI 组件**：Card, Button, AmountInput, AddressInput, WalletBar

### 签名流程
1. **项目方签名**：项目方在前端 SignPermitCard 中输入买家地址 + listingId，使用 EIP-712 构造签名，通过钱包 `signTypedData` 生成签名
2. **用户购买**：白名单用户拿到签名后，在前端 PermitBuyCard 输入签名，调用 `permitBuy`

前端提供完整的签名生成和签名消费两端功能。

## 具体变更

### 1. 新建 `src/contracts/nftMarketPermitAbi.ts`

NFTMarketPermit 合约 ABI，基于 `nftMarketAbi.ts` 扩展：
- 新增 `permitBuy(uint256 _listingId, uint8 v, bytes32 r, bytes32 s)` 函数
- 新增 `signer()` view 函数
- 新增 `domainSeparator()` view 函数
- 新增 `PERMIT_TYPEHASH()` view 函数
- 保留所有现有函数和事件（list, cancelListing, buyNFT, buyNFTWithCallback, listings, nextListingId, paymentToken）
- 导出 `nftMarketPermitAbi` 和 `nftMarketPermitEvents`

### 2. 新建 `src/config/nftMarketPermit.ts`

NFTMarketPermit 合约地址配置，模式与 `nftmarket.ts` 完全对齐：
- 环境变量：`NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_{LOCAL,SEPOLIA,POLYGON,OPTIMISM}`
- 导出 `getNftMarketPermitAddress(chainId)`, `getConfigOk(chainId)`, `getConfigError(chainId)`
- 同时导出 `getSignerAddress(chainId)` 读取 `NEXT_PUBLIC_SIGNER_ADDRESS_{LOCAL,SEPOLIA,...}` 环境变量

### 3. 新建 `src/hooks/nftmarket-permit/useListingsWagmi.ts`

从 NFTMarketPermit 合约读取 listings，逻辑与 `useListingsWagmi.ts` 相同，但使用 `nftMarketPermitAbi` 和 `getNftMarketPermitAddress`。

### 4. 新建 `src/hooks/nftmarket-permit/useNFTMarketPermitEventsWagmi.ts`

监听 NFTMarketPermit 合约事件，逻辑与 `useNFTMarketEventsWagmi.ts` 相同，但使用 `nftMarketPermitAbi` 和 `getNftMarketPermitAddress`。

### 5. 新建 `src/components/nftmarket-permit/types.ts`

复用 `nftmarket/types.ts` 的类型定义（ListingInfo, MarketLog, RefreshFn, MarketEventName 完全相同）。

### 6. 新建 `src/components/nftmarket-permit/SignPermitCard.tsx`

**核心组件 — 项目方签名生成卡片**：
- 输入买家地址（buyer）和 listingId
- 从合约读取 `domainSeparator()` 和 `signer()` 验证当前钱包是否为 signer
- 使用 viem 的 `signTypedData` 构造 EIP-712 签名：
  ```typescript
  const signature = await walletClient.signTypedData({
    domain: {
      name: "NFTMarketPermit",
      chainId,
      verifyingContract: nftMarketPermitAddress,
    },
    primaryType: "PermitBuy",
    types: {
      PermitBuy: [
        { name: "buyer", type: "address" },
        { name: "listingId", type: "uint256" },
      ],
    },
    message: {
      buyer: buyerAddress,
      listingId: listingId,
    },
  });
  ```
- 输出完整签名 hex 字符串（65 字节）
- 自动拆分显示 v, r, s 供参考
- 提供一键复制签名按钮
- **权限检查**：只有当前钱包地址 === 合约 `signer()` 时才允许签名，否则提示"当前钱包不是项目方签名地址"

### 7. 新建 `src/components/nftmarket-permit/PermitBuyCard.tsx`

**核心组件** — 白名单许可购买卡片：
- 输入 listingId（支持从 listings 列表点击自动填入）
- 显示选中 listing 的价格/卖家/NFT 信息
- 输入签名 v, r, s（三个 hex 输入框，或者一个完整签名字符串自动拆分）
- 检查 ERC20 授权额度，不足时提示先 approve
- 调用 `permitBuy(listingId, v, r, s)`
- 交易确认后刷新 listings 和事件

签名输入方式选择：**一个 65 字节 hex 签名字符串 + 自动拆分为 v,r,s**，因为这是最常见的签名格式（ethers/viem 签名输出），比让用户手动输入三个分离值更友好。同时也支持手动输入 v, r, s 三个字段。

### 8. 新建 `src/components/nftmarket-permit/ListCard.tsx`

上架 NFT 组件，逻辑与 `nftmarket/ListCard.tsx` 相同，但使用 `nftMarketPermitAbi` 和 `getNftMarketPermitAddress`。

### 9. 新建 `src/components/nftmarket-permit/CancelCard.tsx`

取消上架组件，逻辑与 `nftmarket/CancelCard.tsx` 相同，但使用新配置。

### 10. 新建 `src/components/nftmarket-permit/ApproveNFTCard.tsx`

授权 NFT 组件，逻辑与 `nftmarket/ApproveNFTCard.tsx` 相同，但使用 `getNftMarketPermitAddress` 作为 operator。

### 11. 新建 `src/components/nftmarket-permit/ListingsTable.tsx`

活跃上架列表表格，逻辑与 `nftmarket/ListingsTable.tsx` 相同。增加点击 listingId 可填入 PermitBuyCard 的交互（通过回调 prop）。

### 12. 新建 `src/components/nftmarket-permit/EventLogCard.tsx`

事件日志卡片，逻辑与 `nftmarket/EventLogCard.tsx` 相同。

### 13. 新建 `src/app/nft-market-white/page.tsx`

主页面，结构对齐 `nft-market/page.tsx`：
- Header（标题：NFT Market (白名单购买) + 合约地址 + WalletBar）
- 配置缺失提示
- 功能区：
  - ApproveNFTCard（授权 NFT）
  - ListCard（上架 NFT）
  - CancelCard（取消上架）
  - **SignPermitCard（项目方签名生成 — 核心功能）**
  - **PermitBuyCard（白名单许可购买 — 核心功能）**
  - ListingsTable（活跃上架列表）
- EventLogCard（链上事件日志）
- SignerInfoCard 显示合约 signer 地址

### 14. 新建 `src/components/nftmarket-permit/SignerInfoCard.tsx`

显示项目方 signer 地址的小组件，从合约读取 `signer()` 并展示，让用户知道哪个地址是项目方授权签名地址。

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 签名输入方式 | 支持 65 字节 hex 完整签名 + 手动 v,r,s 两种 | 完整签名更友好（viem/ethers 默认输出），手动模式供灵活使用 |
| 组件是否复用 | 新建独立组件 | NFTMarketPermit 合约地址/ABI 不同，独立更清晰，避免条件分支 |
| types 是否复用 | 新建独立文件 | 保持模块独立，但类型定义相同 |
| 保留 buyNFT | 不在页面暴露 | 白名单页面专注 permitBuy，普通购买在 nft-market 页面 |
| signer 地址展示 | 从链上 signer() 读取 | 最准确，无需额外配置 |

## 签名输入组件设计

PermitBuyCard 中的签名输入：

```
模式选择：[完整签名] [手动输入 v,r,s]

完整签名模式：
  ┌─ 签名 (65 bytes hex) ──────────────────────┐
  │ 0xabc123...                                │
  └────────────────────────────────────────────┘
  自动拆分为 v=28, r=0xabc1..., s=0x2345...

手动模式：
  ┌─ v ─┐  ┌─ r ──────────────────┐  ┌─ s ──────────────────┐
  │ 28  │  │ 0xabc123...          │  │ 0x234567...          │
  └─────┘  └──────────────────────┘  └──────────────────────┘
```

## 验证步骤

1. `next build` 或 `next dev` 编译通过
2. 连接钱包后页面正常渲染
3. 配置缺失时显示错误提示
4. SignPermitCard：项目方钱包可生成签名，非 signer 钱包提示无权限
5. SignPermitCard：EIP-712 签名输出为 65 字节 hex，自动拆分 v/r/s 正确
6. SignPermitCard：一键复制签名功能正常
7. PermitBuyCard：签名输入和拆分逻辑正确
8. PermitBuyCard：签名格式校验（65 字节 hex 或手动 v/r/s 格式）
9. ERC20 授权检查和 approve 流程正常
10. `permitBuy` 合约调用正确传入参数
11. ListingsTable 和 EventLogCard 数据正确
12. SignerInfoCard 正确显示 signer 地址
13. 端到端：SignPermitCard 生成签名 → 复制 → PermitBuyCard 粘贴 → 购买成功
