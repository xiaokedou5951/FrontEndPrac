# 前端状态流：钱包连接 → 合约调用 → UI 刷新

## TokenBank 数据流

### 存款流程

```
用户输入金额 → DepositCard
    │
    ├─ 检查 configOk (tokenAddress + tokenBankAddress 非空)
    │
    ├─ 检查 allowance < amount ?
    │   └─ 是 → 提示先授权：调用 ERC20.approve(tokenBank, amount)
    │            walletClient.writeContract({ erc20Abi, approve })
    │            等待交易确认 → useAllowance refetch → 显示新授权额度
    │
    └─ 调用 TokenBank.deposit(amount)
         walletClient.writeContract({ tokenBankAbi, deposit })
         等待交易确认 → 触发 refetch:
           - useTokenBalance refetch  (代币余额减少)
           - useDepositBalance refetch (存款余额增加)
           - useAllowance refetch     (授权额度减少)
```

### 取款流程

```
用户输入金额 → WithdrawCard
    │
    ├─ 检查 depositBalance >= amount
    │
    └─ 调用 TokenBank.withdraw(amount)
         walletClient.writeContract({ tokenBankAbi, withdraw })
         等待交易确认 → 触发 refetch:
           - useTokenBalance refetch  (代币余额增加)
           - useDepositBalance refetch (存款余额减少)
```

### 状态轮询机制

viem-front 中各 Hook 使用 `setInterval` 轮询刷新：

| Hook | 轮询间隔 | 数据 |
|------|---------|------|
| `useTokenBalance` | 4s | `ERC20.balanceOf(account)` |
| `useDepositBalance` | 4s | `TokenBank.balanceOf(account)` |
| `useAllowance` | 4s | `ERC20.allowance(account, spender)` |

wagmi-front 中使用 `useReadContract` / `useReadContracts`，由 React Query 管理缓存和自动 refetch（staleTime 默认值）。

## NFTMarket 数据流

### 上架流程

```
用户填写 nftContract / tokenId / price → ListCard
    │
    ├─ 检查 NFT 授权状态
    │   ├─ isApprovedForAll ? → 已授权
    │   └─ 否 → ApproveNFTCard: 调用 NFT.setApprovalForAll(market, true)
    │            或 NFT.approve(market, tokenId)
    │
    └─ 调用 NFTMarket.list(nftContract, tokenId, price)
         walletClient.writeContract({ nftMarketAbi, list })
         等待交易确认 → useListings refetch → ListingsTable 更新
```

### 购买流程（普通）

```
用户点击 Buy → BuyCard
    │
    ├─ 检查 ERC20 授权
    │   └─ allowance < price → 提示先授权: ERC20.approve(market, price)
    │
    └─ 调用 NFTMarket.buyNFT(listingId)
         walletClient.writeContract({ nftMarketAbi, buyNFT })
         等待交易确认 → 触发 refetch:
           - useListings refetch (listing 变为非活跃)
           - useNFTMarketEvents 收到 NFTSold 事件
           - useTokenBalance refetch (代币减少)
```

### 事件监听流

```
组件挂载 → useNFTMarketEvents / useNFTMarketEventsWagmi
    │
    ├─ 1. 拉取历史事件
    │     viem:  publicClient.getContractEvents({ fromBlock: 0n })
    │     wagmi: useContractEvents({ fromBlock: 0n })
    │     → 解码为 MarketLog[] → 按 blockNumber 排序 → 写入 state
    │
    └─ 2. 订阅新事件
          viem:  publicClient.watchEvent({ pollingInterval: 2000 })
          wagmi: useWatchContractEvent({ pollingInterval: 2000 })
          → 解码为 MarketLog[] → 去重 (txHash:logIndex) → 前置插入 state
          → 同步打印到浏览器 console
```

### Listings 获取逻辑

```
useListings / useListingsWagmi
    │
    ├─ 1. 读取 nextListingId
    │     publicClient.readContract({ functionName: "nextListingId" })
    │     → 得到 listing 总数 count
    │
    ├─ 2. 批量读取所有 listing
    │     viem:  Promise.all(ids.map(id => readContract({ listings, [id] })))
    │     wagmi: useReadContracts({ contracts: ids.map(...) })
    │     → 解码为 ListingInfo[]
    │
    └─ 3. 过滤 isActive === true
           → 返回活跃挂单列表
```

viem-front 轮询 6s 刷新；wagmi-front 由 React Query 的 refetch 机制管理。

## NFTMarketPermit 数据流（wagmi-front）

### 白名单签名生成流程（SignPermitCard）

```
项目方填写 buyer + listingId → SignPermitCard
    │
    ├─ 从合约读取 signer() 地址
    ├─ 检查当前钱包 === signer?
    │   └─ 否 → 提示"当前钱包不是项目方签名地址"
    │
    └─ 调用 walletClient.signTypedData({
         domain: { name: "NFTMarketPermit", chainId, verifyingContract },
         primaryType: "PermitBuy",
         types: { PermitBuy: [{ name: "buyer", type: "address" }, { name: "listingId", type: "uint256" }] },
         message: { buyer, listingId }
       })
       → 输出 65 字节 hex 签名
       → 自动拆分为 v, r, s 显示
       → 一键复制签名
```

### 白名单许可购买流程（PermitBuyCard）

```
买家输入 listingId + 签名 → PermitBuyCard
    │
    ├─ 签名输入模式：
    │   ├─ 完整签名：粘帖 65 字节 hex → 自动拆分 v, r, s
    │   └─ 手动模式：分别输入 v, r, s
    │
    ├─ 检查 ERC20 授权
    │   └─ allowance < price → 提示先授权: ERC20.approve(marketPermit, price)
    │
    └─ 调用 NFTMarketPermit.permitBuy(listingId, v, r, s)
         walletClient.writeContract({ nftMarketPermitAbi, permitBuy })
         等待交易确认 → 触发 refetch:
           - useListingsWagmi refetch (listing 变为非活跃)
           - useNFTMarketPermitEventsWagmi 收到 NFTSold 事件
           - useTokenBalance refetch (代币减少)
```

### 端到端流程

```
SignPermitCard 生成签名 → 复制 → PermitBuyCard 粘帖 → 购买成功
```

### 事件监听与 Listings 获取

与 NFTMarket 完全一致，仅替换为 NFTMarketPermit 的 ABI 和合约地址：
- `useListingsWagmi`（from `hooks/nftmarket-permit/`）
- `useNFTMarketPermitEventsWagmi`（from `hooks/nftmarket-permit/`）

## 钱包状态流

### viem-front

```
用户点击 Connect → WalletContext.connect()
    │
    ├─ 检测 window.ethereum
    ├─ createWalletClient({ transport: custom(ethereum) })
    ├─ client.requestAddresses() → [account]
    ├─ client.getChainId() → chainId
    ├─ 监听 accountsChanged / chainChanged
    └─ localStorage.setItem(CONNECTED_KEY, "1")

页面刷新 → useEffect 自动重连
    │
    ├─ localStorage 有 CONNECTED_KEY ?
    ├─ 检测 window.ethereum
    ├─ client.getAddresses() → [account]
    ├─ client.getChainId() → chainId
    └─ attachListeners
```

### wagmi-front

```
AppKit UI 弹窗 → 用户选择钱包 → wagmi 内部处理连接
    │
    ├─ useAccount() → { address, chainId, isConnecting }
    ├─ useWalletClient() → { data: walletClient }
    └─ usePublicClient() → publicClient

WalletContext 仅做适配：将 wagmi hooks 的结果统一为 useWallet() 接口
```
