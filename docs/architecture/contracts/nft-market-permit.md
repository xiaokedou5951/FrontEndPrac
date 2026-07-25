# NFTMarketPermit：EIP-712 白名单许可购买

## 为什么需要 Permit

NFTMarket 的 `buyNFT` 对所有用户开放。NFTMarketPermit 通过 EIP-712 签名实现白名单：只有项目方 `signer` 为指定买家签名的订单才能购买，适用于预售、内测等场景。

## EIP-712 签名流程

```
项目方(链下)                     买家(前端)                      合约(链上)
    │                               │                               │
    │  构造 PermitBuy 结构体        │                               │
    │  { buyer, listingId }        │                               │
    │                               │                               │
    │  structHash = keccak256(     │                               │
    │    abi.encode(               │                               │
    │      PERMIT_TYPEHASH,        │                               │
    │      buyer, listingId        │                               │
    │    )                         │                               │
    │  )                           │                               │
    │                               │                               │
    │  digest = toTypedDataHash(   │                               │
    │    domainSeparator,           │                               │
    │    structHash                 │                               │
    │  )                           │                               │
    │                               │                               │
    │  用 signer 私钥签名 digest  │                               │
    │  → (v, r, s)                 │                               │
    │                               │                               │
    │ ──── 签名传给前端 ────►      │                               │
    │                               │  调用 permitBuy(             │
    │                               │    listingId, v, r, s        │
    │                               │  )                           │
    │                               │ ──────────────────────────►   │
    │                               │                               │
    │                               │         链上验证:            │
    │                               │         1. 重建 structHash   │
    │                               │         2. 计算 digest       │
    │                               │         3. recover 签名者    │
    │                               │         4. 比对 == signer    │
    │                               │                               │
    │                               │         验证通过 → 执行购买  │
```

## 核心参数

| 参数 | 值 | 说明 |
|------|----|------|
| `PERMIT_TYPEHASH` | `keccak256("PermitBuy(address buyer,uint256 listingId)")` | 类型哈希，标识签名结构 |
| `domainSeparator` | `keccak256(abi.encode(EIP712Domain, "NFTMarketPermit", chainId, address(this)))` | 域分隔符，防跨链/跨合约重放 |
| `signer` | 构造时传入 | 项目方签名地址，`permitBuy` 中 `ECDSA.recover` 必须等于此地址 |

## 前端集成要点

### 签名构造（项目方后端或脚本）

```typescript
import { keccak256, encodeAbiParameters, parseSignature } from "viem";

const PERMIT_TYPEHASH = keccak256(
  new TextEncoder().encode("PermitBuy(address buyer,uint256 listingId)")
);

const structHash = keccak256(
  encodeAbiParameters(
    [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
    [PERMIT_TYPEHASH, buyerAddress, listingId]
  )
);

const digest = hashTypedData({
  domain: {
    name: "NFTMarketPermit",
    version: "1",
    chainId: 31337n,
    verifyingContract: marketAddress,
  },
  primaryType: "PermitBuy",
  types: { PermitBuy: [{ name: "buyer", type: "address" }, { name: "listingId", type: "uint256" }] },
  message: { buyer: buyerAddress, listingId },
});
```

### 合约调用（前端）

```typescript
walletClient.writeContract({
  address: marketPermitAddress,
  abi: nftMarketPermitAbi,
  functionName: "permitBuy",
  args: [listingId, v, r, s],
});
```

## 安全考量

1. **签名绑定 buyer**：`structHash` 包含 `msg.sender`（buyer），其他人拿到签名也无法使用，因为 `recover` 出的地址不匹配
2. **签名绑定 listingId**：签名不能跨 listing 使用
3. **无 nonce 机制**：同一 buyer + listingId 的签名可重复提交，但因 listing 购买后 `isActive = false`，不会产生实际影响
4. **domainSeparator 绑定 chainId**：跨链重放时 `recover` 的 digest 不同，签名无效
5. **signer 不可更改**：构造后无修改接口，如需更换需重新部署

## 测试覆盖

见 `contracts/test/NFTMarketPermit.t.sol`：

| 测试 | 验证点 |
|------|--------|
| `test_permitBuy_success` | 白名单用户有效签名购买成功 |
| `test_permitBuy_invalidSignature_reverts` | 非 signer 签名 revert |
| `test_permitBuy_signatureUsedByOtherAddress_reverts` | 签名被其他地址使用 revert |
| `test_permitBuy_signatureForDifferentListing_reverts` | 签名跨 listingId 使用 revert |
| `test_permitBuy_cancelledListing_reverts` | 已取消 listing 的签名购买 revert |
| `test_permitBuy_insufficientBalance_reverts` | 余额不足 revert |
| `test_domainSeparator` | domainSeparator 计算正确性 |
| `test_buyNFT_stillWorks` | 原有 buyNFT 功能不受影响 |
