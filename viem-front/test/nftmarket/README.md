# SimpleNft 铸造脚本 (NFTMarket 测试前置)

本目录包含一个独立脚本 `mint-nfts.mjs`，用于在本地链上调用 `SimpleNft.mint(to, tokenId)` 铸造 NFT，为 NFTMarket 的上架 / 购买测试准备资产。

## 运行

```bash
cd viem-front
node test/nftmarket/mint-nfts.mjs
```

脚本使用 viem-front 已安装的 `viem` 依赖，无需额外安装。默认连本地 anvil (http://127.0.0.1:8545)。

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
