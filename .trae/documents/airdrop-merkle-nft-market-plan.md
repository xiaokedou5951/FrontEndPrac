# AirdropMerkleNFTMarket 合约改造计划

## Summary

将 `contracts/src/airdrop-merkle/AirdropMerkleNFTMarket.sol` 由当前的 `NFTMarket` 副本改造为 `AirdropMerkleNFTMarket`：基于 Merkle 树验证白名单，白名单用户可凭 EIP‑2612 `permit` 授权，通过 OpenZeppelin `Multicall`（delegatecall）一次性调用 `permitPrePay()` + `claimNFT()`，以上架价 50% 的 Token 购买 NFT。每个白名单地址限领一次，merkleRoot 可由 owner 更新。

## Current State Analysis

- 目标文件 [AirdropMerkleNFTMarket.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/airdrop-merkle/AirdropMerkleNFTMarket.sol) 当前内容与 [NFTMarket.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/NFTMarket.sol) 完全一致（合约名仍为 `NFTMarket`），已包含：`IERC20`/`ITokenReceiver`/`IERC721`/`IExtendedERC20` 接口、`Listing` 结构、`list`/`cancelListing`/`buyNFT`/`tokensReceived`/`buyNFTWithCallback`。
- 支付代币 [MyTokenPermit.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/airdrop-merkle/MyTokenPermit.sol) 已继承 OZ `ERC20Permit`（EIP‑2612），并实现 `transferWithCallbackAndData`，满足“Token 支持 permit”前提。
- 参考实现 [NFTMarketPermit.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/NFTMarketPermit.sol) 展示了白名单购买+permit 签名的既有写法（本任务改为 Merkle + 多签 multicall，不复用其 EIP‑712 signer 逻辑）。
- OZ 库已就位：[Multicall.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/lib/openzeppelin-contracts/contracts/utils/Multicall.sol)（基于 `Address.functionDelegateCall`，正是所需 delegatecall 方式）、[MerkleProof.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/lib/openzeppelin-contracts/contracts/utils/cryptography/MerkleProof.sol)（`verify(proof, root, leaf)`）。
- remappings：`@openzeppelin/contracts/` → `lib/openzeppelin-contracts/contracts/`，可直接 import。
- 测试范式见 [NFTMarketPermit.t.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/test/NFTMarketPermit.t.sol)（`vm.sign`、`vm.prank`、SimpleNft 上架辅助）。
- [SimpleNft.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/SimpleNft.sol) 提供 `mint`/`setApprovalForAll`，用于测试上架。

## Assumptions & Decisions

1. **合约名**：`AirdropMerkleNFTMarket`（替换原 `NFTMarket`）。
2. **优惠价**：白名单用户支付 `listing.price / 2`（“优惠 50%”= 五折）。
3. **Merkle 叶子**：`keccak256(abi.encodePacked(account))`，仅校验地址是否在白名单（需求为“验证某用户是否在白名单中”）。
4. **领取限制**：引入 `mapping(address => bool) claimed`，每个白名单地址全局仅能以优惠价购买一次（用户已确认）。
5. **merkleRoot 更新**：引入 `Ownable`，构造函数设置 root，提供 `setMerkleRoot` 仅 owner 可调用（用户已确认）。
6. **支付代币类型**：保留 `IExtendedERC20 paymentToken`；新增本地接口 `IERC20WithPermit`（仅 `permit` 签名），在 `permitPrePay` 中以 `IERC20WithPermit(address(paymentToken))` 调用，避免与本地 `IERC20`/OZ `IERC20Permit` 类型冲突。
7. **Multicall**：直接 `is Multicall`（OZ），其 `multicall(bytes[])` 内部用 delegatecall 调本合约，`msg.sender` 在两个子调用中保持为原始买家 EOA——保证 `permit(owner=msg.sender, spender=address(this))` 与 `transferFrom(from=msg.sender, ...)` 身份一致。
8. **保留现有功能**：`list`/`cancelListing`/`buyNFT`（原价购买路径，供非白名单或不想用 permit 的用户）/`tokensReceived`/`buyNFTWithCallback` 全部保留，仅新增白名单优惠路径，最小改动。
9. **`claimNFT` 单独调用**：亦允许单独调用（前提是买家已通过其他方式 approve 了市场合约）；通过 multicall 与 `permitPrePay` 组合时无需预先 approve，这是推荐路径。
10. **不改 MyTokenPermit / SimpleNft**：二者已满足接口需求。

## Proposed Changes

### 文件 1：`contracts/src/airdrop-merkle/AirdropMerkleNFTMarket.sol`（重写）

**新增 import**
```solidity
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
```

**新增接口**（本地定义，避免类型冲突）
```solidity
interface IERC20WithPermit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}
```

**合约声明**：`contract AirdropMerkleNFTMarket is ITokenReceiver, Ownable, Multicall {`

**新增状态变量**
- `bytes32 public merkleRoot;`
- `mapping(address => bool) public claimed;`

**构造函数**：参数 `(address _paymentTokenAddress, bytes32 _merkleRoot)`，校验非零后赋值，并 `Ownable(msg.sender)`。

**新增事件**
- `event MerkleRootUpdated(bytes32 newRoot);`
- `event NFTClaimed(uint256 indexed listingId, address indexed buyer, address indexed seller, address nftContract, uint256 tokenId, uint256 paidAmount);`

**新增 `setMerkleRoot`（onlyOwner）**
- 校验 `_merkleRoot != bytes32(0)`，赋值，emit `MerkleRootUpdated`。

**新增 `permitPrePay`**
```solidity
function permitPrePay(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
    IERC20WithPermit(address(paymentToken)).permit(msg.sender, address(this), amount, deadline, v, r, s);
}
```
- `amount` 由调用方（链下/前端）按目标 listing 的 `price/2` 预计算并签名。
- 仅做 permit，不改任何市场状态；multicall 中作为第一步，授权市场支配买家 Token。

**新增 `claimNFT`**
```solidity
function claimNFT(uint256 _listingId, bytes32[] calldata _proof) external {
    // 1. Merkle 白名单校验
    require(!claimed[msg.sender], "AirdropMerkleNFTMarket: already claimed");
    bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
    require(MerkleProof.verify(_proof, merkleRoot, leaf), "AirdropMerkleNFTMarket: not in whitelist");

    // 2. 取 listing 并校验
    Listing storage listing = listings[_listingId];
    require(listing.isActive, "AirdropMerkleNFTMarket: listing is not active");

    // 3. 50% 优惠价
    uint256 payAmount = listing.price / 2;
    require(paymentToken.balanceOf(msg.sender) >= payAmount, "AirdropMerkleNFTMarket: insufficient token balance");

    // 4. 状态前置更新（防重入）
    listing.isActive = false;
    claimed[msg.sender] = true;

    // 5. 利用 permitPrePay 留下的授权：买家 -> 卖家
    bool ok = paymentToken.transferFrom(msg.sender, listing.seller, payAmount);
    require(ok, "AirdropMerkleNFTMarket: token transfer failed");

    // 6. NFT：卖家 -> 买家
    IERC721(listing.nftContract).transferFrom(listing.seller, msg.sender, listing.tokenId);

    emit NFTClaimed(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, payAmount);
    emit NFTSold(_listingId, msg.sender, listing.seller, listing.nftContract, listing.tokenId, payAmount);
}
```

**Multicall 调用方式（前端/测试构造）**
```solidity
bytes[] memory calls = new bytes[](2);
calls[0] = abi.encodeWithSelector(market.permitPrePay.selector, payAmount, deadline, v, r, s);
calls[1] = abi.encodeWithSelector(market.claimNFT.selector, listingId, proof);
market.multicall(calls);  // 由买家 EOA 直接调用
```
- delegatecall 保证两步 `msg.sender` 均为买家；permit 在第 1 步写入 token 的 `allowance[buyer][market]`，第 2 步 `transferFrom` 消费该授权。

**保留**：`list`/`cancelListing`/`buyNFT`/`tokensReceived`/`buyNFTWithCallback` 及全部既有接口、结构、事件、错误信息前缀统一改为 `AirdropMerkleNFTMarket:`。

### 文件 2（新增，验证用）：`contracts/test/AirdropMerkleNFTMarket.t.sol`

参照 [NFTMarketPermit.t.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/test/NFTMarketPermit.t.sol) 风格，使用 `MyTokenPermit` + `SimpleNft`，覆盖：

1. **`test_multicall_claim_success`**：部署→卖家上架→构造 Merkle 树（叶子 `keccak256(buyer)`）→链下 `vm.sign` 生成 permit 签名（digest 用 `MyTokenPermit` 的 EIP‑712 domain：`name="MyTokenPermit"`, `chainId`, `verifyingContract=token`）→`market.multicall([permitPrePay, claimNFT])`→断言 NFT 归买家、卖家收到 `price/2`、`claimed[buyer]==true`、listing 失活。
2. **`test_claim_notInWhitelist_reverts`**：用未在 Merkle 树中的地址或伪造 proof → `not in whitelist`。
3. **`test_claim_alreadyClaimed_reverts`**：同一买家第二次 claim（另一 listing）→ `already claimed`。
4. **`test_claim_withoutPermit_reverts`**：单独调 `claimNFT` 且未 approve → `token transfer failed`。
5. **`test_claim_cancelledListing_reverts`**：卖家先 `cancelListing` 再 multicall → `listing is not active`。
6. **`test_setMerkleRoot_onlyOwner`**：非 owner 调用 revert；owner 更新后旧 proof 失效。
7. **`test_buyNFT_stillWorks`**：原价 `buyNFT` 路径不受影响。

> 说明：permit 签名 digest = `MessageHashUtils.toTypedDataHash(token.DOMAIN_SEPARATOR(), structHash)`，其中 `structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline))`，`PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 deadline,uint256 nonce)")`，nonce 取 `token.nonces(owner)`。`MyTokenPermit` 继承自 `ERC20Permit`，已暴露 `DOMAIN_SEPARATOR()`/`nonces()`。

## Verification Steps

1. `forge build` 编译通过（确认 import 路径、selector、override 正确）。
2. `forge test -vv` 运行新增测试，全部通过：
   - multicall 成功路径：NFT/Token 资产正确流转，金额恰为 `price/2`。
   - 白名单/重领/未授权/取消上架 revert 路径符合预期。
3. `forge coverage`（可选）确认 `claimNFT`/`permitPrePay`/`setMerkleRoot` 行覆盖。
4. 手动核对 multicall 的 delegatecall 语义：`msg.sender` 在两子调用中一致（OZ `Multicall` 实现，无需自定义）。

## Out of Scope

- 不修改 `MyTokenPermit.sol`、`SimpleNft.sol`、`NFTMarket.sol`、`NFTMarketPermit.sol`。
- 不引入 ReentrancyGuard（已通过 checks-effects-interactions 顺序：先置 `isActive=false`/`claimed=true` 再转账）。
- 不提供链下 Merkle 树/签名生成脚本（测试内用 solidity/forge 内联构造即可）。
