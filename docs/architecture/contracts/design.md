# 合约设计

## 合约间依赖关系

```
MyERC20 ──────┬────── TokenBank(构造参数: token 地址)
              │
              └────── NFTMarket(构造参数: paymentToken 地址)
              └────── NFTMarketPermit(构造参数: paymentToken + signer 地址)

SimpleNft ────┬────── NFTMarket(运行时: NFT 授权与转移)
              └────── NFTMarketPermit(运行时: NFT 授权与转移)
```

部署顺序：MyERC20 → TokenBank → NFTMarket/NFTMarketPermit → SimpleNft

## 各合约设计要点

### MyERC20

- 继承 OpenZeppelin `ERC20`，构造时向部署者铸造 `1,000,000 * 1e18`
- 扩展 `transferWithCallbackAndData(address, uint256, bytes)`：转账后若接收方是合约，调用 `ITokenReceiver.tokensReceived` 回调
- 回调采用 try-catch 三层处理：成功验证返回值 → 高级 revert 原样抛出 → 低级 revert 用 assembly 原样回滚
- 该回调机制是 NFTMarket 的 `buyNFTWithCallback` 路径的基础

### TokenBank

- 存取款银行，构造时绑定底层 ERC20 地址
- 存款：`deposit(amount)` — `safeTransferFrom` 拉取代币，更新 `deposits` 映射
- 取款：`withdraw(amount)` — **先减记录再转账**，防止重入攻击（Checks-Effects-Interactions）
- 使用 `SafeERC20` 处理非标准 ERC20 返回值
- 前置检查：金额 > 0、余额/存款充足

### SimpleNft

- 最小化 ERC721 实现，仅包含 NFTMarket 所需接口：`ownerOf` / `transferFrom` / `safeTransferFrom` / `approve` / `getApproved` / `setApprovalForAll` / `isApprovedForAll`
- `mint(address, tokenId)` 无权限控制（仅用于测试）
- 从 NFTMarket.sol 导入 `IERC721` 接口，保持一致性

### NFTMarket

- 构造参数：`paymentToken` 地址（必须为实现了 `IExtendedERC20` 的合约，即 MyERC20）
- 上市流程：`list(nftContract, tokenId, price)` — 验证调用者为 NFT owner 或被授权，创建 Listing，**不转移 NFT**
- 购买路径（两条）：
  - `buyNFT(listingId)`：买家先 `approve` 代币，市场合约 `transferFrom` 拉取代币，再 `transferFrom` 转移 NFT
  - `buyNFTWithCallback(listingId)`：买家调用 `paymentToken.transferWithCallbackAndData(market, price, abi.encode(listingId))`，代币合约在转账成功后回调 `tokensReceived`，市场在回调中完成代币转卖家 + NFT 转买家
- 取消：`cancelListing(listingId)` — 仅卖家可调用，标记 `isActive = false`
- `tokensReceived` 安全检查：验证 `msg.sender == paymentToken`、`data.length == 32`、金额匹配价格

### NFTMarketPermit

- 在 NFTMarket 基础上增加白名单许可购买：`permitBuy(listingId, v, r, s)`
- EIP-712 签名结构：`PermitBuy(address buyer, uint256 listingId)`
- 域分隔符：`EIP712Domain("NFTMarketPermit", chainId, verifyingContract)`
- 签名验证流程：构造 structHash → `MessageHashUtils.toTypedDataHash` → `ECDSA.recover` → 比对 `signer`
- 构造参数额外需要 `signer` 地址（项目方签名地址）
- 其余逻辑（list / cancelListing / buyNFT / tokensReceived）与 NFTMarket 完全一致
- **签名不防重放**：同一签名可被指定 buyer 重复使用（因 listingId 购买后 isActive 变 false，实际不会重复执行）

## 访问控制模型

| 操作 | 权限 |
|------|------|
| `list` | NFT owner 或被授权（ownerOf/isApprovedForAll/getApproved） |
| `cancelListing` | 仅 listing.seller |
| `buyNFT` / `buyNFTWithCallback` | 任何人（需持有足够代币 + 已授权） |
| `permitBuy` | 签名中指定的 buyer（需有效 EIP-712 签名 + 足够代币 + 已授权） |
| `deposit` | 任何人（需持有代币 + 已授权 TokenBank） |
| `withdraw` | 任何人（需 deposits 余额充足） |

## 状态变更入口汇总

```
MyERC20:    transfer / approve / transferFrom / transferWithCallbackAndData
TokenBank:  deposit / withdraw
NFTMarket:  list / cancelListing / buyNFT / buyNFTWithCallback / tokensReceived(回调)
SimpleNft:  mint / approve / setApprovalForAll / transferFrom / safeTransferFrom
```
