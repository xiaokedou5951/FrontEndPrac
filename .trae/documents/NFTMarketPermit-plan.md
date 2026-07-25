# NFTMarketPermit 合约实现计划

## 概述

基于现有 `NFTMarket.sol` 创建 `NFTMarketPermit.sol` 合约，新增 `permitBuy()` 函数，实现仅经项目方离线签名授权的白名单地址才可购买 NFT 的功能。

## 当前状态分析

- 项目使用 Foundry 框架，Solidity `^0.8.30`
- 已有依赖：OpenZeppelin contracts（含 `ECDSA.sol`、`MessageHashUtils.sol`）
- `NFTMarket.sol` 提供了 `buyNFT()` 和 `buyNFTWithCallback()` 两种购买方式
- **已知 Bug**：`buyNFTWithCallback()` 由市场合约调用 `transferWithCallbackAndData`，导致 Token 合约内 `msg.sender` 为市场合约而非买家，代币无法从买家转出（已修复：替换为 `getBuyData()` 辅助函数）
- 合约自带 `IERC721`、`IERC20`、`IExtendedERC20`、`ITokenReceiver` 接口定义
- `SimpleNft.sol` 从 `NFTMarket.sol` 导入 `IERC721`

## 核心设计：EIP-712 风格的离线签名白名单

### 签名流程

1. **项目方（signer）** 持有私钥，对白名单地址签名
2. **白名单用户** 购买时，将签名 `(v, r, s)` 作为参数传入 `permitBuy()`
3. **合约内** 使用 `ecrecover` 恢复签名者地址，验证是否为项目方授权的 signer

### 签名消息结构

使用 EIP-712 typed data 防止签名重用和钓鱼攻击：

```
struct PermitBuy {
    address buyer;      // 购买者地址
    uint256 listingId;  // 要购买的 NFT listing ID
}

DOMAIN_SEPARATOR = keccak256(abi.encode(
    keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
    keccak256("NFTMarketPermit"),
    block.chainid,
    address(this)
))
```

这样每个签名绑定到特定的 `buyer` + `listingId`，防止：
- 签名被其他地址使用（绑定 buyer）
- 签名跨合约/跨链重放（DOMAIN_SEPARATOR）
- 签名跨 listing 重用（绑定 listingId）

### 可选设计：签名是否绑定 listingId

- **绑定 listingId**：每个 (buyer, listingId) 需要一个独立签名，更安全但项目方签名成本高
- **不绑定 listingId**：一个 buyer 只需一个签名即可购买任意 listing，签名成本低但灵活性更大

**选择：绑定 listingId**，理由是安全性更高，且这是 permit 模式的标准做法（类似 ERC20 Permit 每笔授权独立签名）。

## 具体变更

### 1. 新建文件：`contracts/src/NFTMarketPermit.sol`

复制 `NFTMarket.sol` 全部内容，修改如下：

1. **合约名** 改为 `NFTMarketPermit`
2. **新增 import**：
   ```solidity
   import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
   import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
   ```
3. **新增状态变量**：
   ```solidity
   address public signer;  // 项目方签名地址
   ```
4. **修改 constructor**，新增 `_signer` 参数：
   ```solidity
   constructor(address _paymentTokenAddress, address _signer) {
       require(_signer != address(0), "NFTMarketPermit: signer cannot be zero");
       paymentToken = IExtendedERC20(_paymentTokenAddress);
       signer = _signer;
   }
   ```
5. **新增 EIP-712 相关常量/变量**：
   ```solidity
   bytes32 public constant PERMIT_TYPEHASH = keccak256("PermitBuy(address buyer,uint256 listingId)");
   bytes32 private _domainSeparator;
   ```
   在 constructor 中初始化 `_domainSeparator`
6. **新增 `permitBuy()` 函数**：
   ```solidity
   function permitBuy(uint256 _listingId, uint8 v, bytes32 r, bytes32 s) external {
       // 1. 验证签名
       bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, msg.sender, _listingId));
       bytes32 digest = MessageHashUtils.hashTypedDataV4(_domainSeparator, structHash);
       address recoveredSigner = ECDSA.recover(digest, v, r, s);
       require(recoveredSigner == signer, "NFTMarketPermit: invalid signature");

       // 2. 复用 buyNFT 的购买逻辑
       Listing storage listing = listings[_listingId];
       require(listing.isActive, "NFTMarketPermit: listing is not active");
       require(paymentToken.balanceOf(msg.sender) >= listing.price, "NFTMarketPermit: insufficient token balance");

       listing.isActive = false;
       bool success = paymentToken.transferFrom(msg.sender, listing.seller, listing.price);
       require(success, "NFTMarketPermit: token transfer failed");
       IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

       emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, listing.price);
   }
   ```
7. **可选**：新增 `updateSigner()` 函数供项目方更换 signer 地址（需加权限控制，如 `onlySigner` modifier）
8. **Bug 修复**：将 `buyNFTWithCallback()` 替换为 `getBuyData()` 辅助函数
   - **问题**：`buyNFTWithCallback()` 中市场合约调用 `paymentToken.transferWithCallbackAndData()`，Token 合约内 `msg.sender` 为市场合约而非买家，`transfer()` 实际从市场合约转到市场合约，代币无法从买家转出
   - **修复**：删除 `buyNFTWithCallback()`，新增 `getBuyData(uint256 _listingId) external pure returns (bytes memory)` 辅助函数
   - **正确调用方式**：买家直接调用 Token 合约的 `token.transferWithCallbackAndData(marketAddress, price, market.getBuyData(listingId))`，Token 合约将代币从买家转给市场合约，然后回调 `tokensReceived` 完成购买

### 2. 新建文件：`contracts/test/NFTMarketPermit.t.sol`

编写 Foundry 测试用例：
- 部署合约（使用 `vm.sign` 生成项目方密钥对）
- 测试白名单用户用有效签名购买成功
- 测试非白名单用户（无效签名）购买 revert
- 测试签名被其他地址使用时 revert
- 测试签名跨 listingId 使用时 revert
- 测试重复使用同一签名（对已取消/已售出的 listing）行为

### 3. 新建文件：`contracts/script/NFTMarketPermit.s.sol`

部署脚本，新增 `SIGNER_ADDRESS` 环境变量。

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 签名方案 | EIP-712 typed data | 防钓鱼、防重放、行业标准 |
| 签名绑定 | buyer + listingId | 安全性最高，防止签名滥用 |
| 是否保留原 buyNFT | 保留 | permitBuy 是新增购买方式，不替换原有功能 |
| 是否加 updateSigner | 否 | 遵循最小变更原则，按需后续添加 |
| buyNFTWithCallback Bug | 替换为 getBuyData() | 原函数由市场合约调用 transfer，msg.sender 错误导致代币无法从买家转出 |

## 验证步骤

1. `forge build` 编译通过
2. `forge test` 测试全部通过
3. 验证 `permitBuy()` 仅接受有效白名单签名
4. 验证无效签名/错误参数均 revert
5. 验证原有 `buyNFT()` / `list()` / `cancelListing()` 功能不受影响
6. 验证买家通过 `token.transferWithCallbackAndData(marketAddress, price, market.getBuyData(listingId))` 可正常购买
