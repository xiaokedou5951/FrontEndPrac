# NFT Market 白名单许可购买 — 测试说明

## 概述

本目录包含 NFT Market 白名单许可购买功能的测试脚本和说明。

NFTMarketPermit 合约在 NFTMarket 基础上增加了 **EIP-712 签名验证**的 `permitBuy` 方法：只有持有项目方（signer）签名的白名单用户才能购买上架的 NFT，普通 `buyNFT` 不受签名限制。

## 前置条件

- 安装 [Foundry](https://book.getfoundry.sh/)（需要 `cast` 命令）
- 启动 Anvil 本地链：`anvil`
- 部署以下合约并配置到 `wagmi-front/.env.local`：
  - `NFTMarketPermit` 合约 → `NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_LOCAL`
  - `SimpleNft` 合约 → `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL`
  - `Token`（ERC20 支付代币）→ `NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL`

## 角色说明

| 角色 | Anvil 默认账户 | 说明 |
|------|---------------|------|
| 项目方 Signer | #0 (`0xf39Fd...2266`) | 合约部署者，拥有签名权限，生成白名单签名 |
| 卖家 | #0 或其他 | 拥有 NFT，上架到市场 |
| 买家（白名单用户） | #1 (`0x7099...0C05`) 等 | 持有项目方签名，可通过 `permitBuy` 购买 |

## 完整测试流程

### 第一步：铸造 NFT

使用 `mint-nft.sh` 脚本铸造一个 NFT 给卖家：

```bash
./mint-nft.sh 1
```

脚本会自动：
1. 从 `.env.local` 读取 SimpleNft 合约地址
2. 检查 Token ID 是否可用
3. 调用 `mint(address, tokenId)` 铸造 NFT
4. 验证铸造结果

### 第二步：卖家授权 NFT 给市场

在前端页面「授权 NFT 给市场（卖家）」卡片中：
1. 输入 NFT 合约地址（SimpleNft 地址）
2. 点击「授权」，调用 `setApprovalForAll(marketAddress, true)`

或使用 cast 命令：
```bash
cast send $SIMPLE_NFT_ADDRESS \
  "setApprovalForAll(address,bool)" \
  $NFT_MARKET_PERMIT_ADDRESS true \
  --private-key $PRIVATE_KEY \
  --rpc-url http://127.0.0.1:8545
```

### 第三步：卖家上架 NFT

在「上架 NFT」卡片中：
1. 输入 NFT 合约地址
2. 输入 Token ID
3. 输入价格（ERC20 代币数量）
4. 点击「上架」，调用 `list(nftContract, tokenId, price)`
5. 从事件日志中记录返回的 **Listing ID**

### 第四步：项目方生成白名单签名

在「项目方签名（白名单授权）」卡片中（**必须使用 signer 账户连接**）：
1. 输入买家地址（白名单用户的钱包地址）
2. 输入 Listing ID
3. 点击「生成签名」

签名使用 EIP-712 结构化数据：
- **Domain**: `{ name: "NFTMarketPermit", chainId, verifyingContract }`
- **Type**: `PermitBuy(buyer: address, listingId: uint256)`

生成后会得到 65 字节签名（`0x` + 130 hex 字符），以及拆分后的 `v`, `r`, `s`。

### 第五步：买家授权支付代币

在「白名单许可购买 NFT」卡片中：
1. 输入 Listing ID
2. 如果支付代币授权额度不足，点击「授权支付代币」
3. 调用 `approve(marketAddress, price)`

### 第六步：白名单购买

在「白名单许可购买 NFT」卡片中：
1. 输入 Listing ID
2. 选择签名输入模式：
   - **完整签名**：粘贴第四步生成的完整 65 字节签名（`0x...`）
   - **手动 v, r, s**：分别填入 `v`（27 或 28）、`r`（bytes32）、`s`（bytes32）
3. 点击「白名单购买」，调用 `permitBuy(listingId, v, r, s)`

### 第七步：验证

- 查看「上架列表」表格，该 Listing 应已变为非活跃状态
- 查看「事件日志」，应出现 `NFTSold` 事件
- NFT 所有权已转移到买家地址

## 签名模式说明

### 完整签名模式

直接粘贴 EIP-712 签名的完整 hex 字符串（`0x` + 64 字节 = 132 字符），前端自动拆分为 `v`, `r`, `s`：
- `r` = 签名[2:66]（前 32 字节）
- `s` = 签名[66:130]（后 32 字节）
- `v` = 签名[130:132]（最后 1 字节，通常为 27 或 28）

### 手动 v, r, s 模式

分别输入签名的三个分量，适用于通过其他工具（如 `cast`）拆分签名后的场景。

## 使用命令行生成白名单签名

### 方式一：使用 sign-permit.sh 脚本（推荐）

```bash
# 语法
./sign-permit.sh <buyer_address> <listing_id>

# 示例：为买家 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 生成 listingId=0 的签名
./sign-permit.sh 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0
```

脚本会自动完成以下步骤：
1. 验证签名者私钥与合约 signer 一致
2. 从链上读取 `domainSeparator` 和 `PERMIT_TYPEHASH`
3. 构造 EIP-712 digest 并签名
4. 拆分签名为 `v`, `r`, `s`
5. 输出完整签名和 `permitBuy` 命令

输出示例：
```
  完整签名 (65 bytes):
    0x1234...abcd

  拆分结果:
    v = 28
    r = 0x1234...
    s = 0xabcd...

  下一步：
    cast send 0x... \
      "permitBuy(uint256,uint8,bytes32,bytes32)" \
      0 28 0x1234... 0xabcd... \
      --rpc-url http://127.0.0.1:8545 \
      --private-key <buyer_private_key>
```

### 方式二：手动 cast 命令

```bash
# 设置变量
NFT_MARKET_PERMIT=0x...   # NFTMarketPermit 合约地址
BUYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
LISTING_ID=0
RPC=http://127.0.0.1:8545
SIGNER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 1. 从链上读取 EIP-712 参数
DOMAIN_SEP=$(cast call $NFT_MARKET_PERMIT "domainSeparator()(bytes32)" --rpc-url $RPC)
TYPEHASH=$(cast call $NFT_MARKET_PERMIT "PERMIT_TYPEHASH()(bytes32)" --rpc-url $RPC)

# 2. 计算 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, buyer, listingId))
#    cast abi-encode 的函数签名格式："函数名(参数类型,...)"
#    函数名随意取（此处用 f），cast 只根据参数类型做 ABI 编码
#    bytes32=PERMIT_TYPEHASH, address=buyer, uint256=listingId
STRUCT_HASH=$(cast keccak "$(cast abi-encode "f(bytes32,address,uint256)" $TYPEHASH $BUYER $LISTING_ID)")

# 3. 计算 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))
DIGEST=$(cast keccak "0x1901${DOMAIN_SEP#0x}${STRUCT_HASH#0x}")

# 4. 签名（--no-hash 表示直接对 digest 签名，不再做 keccak256）
SIG=$(cast wallet sign $DIGEST --private-key $SIGNER_KEY --no-hash)

# 5. 拆分签名为 v, r, s
R="0x${SIG:2:64}"
S="0x${SIG:66:64}"
V=$((16#${SIG:130:2}))

echo "v=$V r=$R s=$S"

# 6. 买家调用 permitBuy
cast send $NFT_MARKET_PERMIT \
  "permitBuy(uint256,uint8,bytes32,bytes32)" \
  $LISTING_ID $V $R $S \
  --rpc-url $RPC \
  --private-key <buyer_private_key>
```

## 合约关键方法

| 方法 | 说明 | 权限 |
|------|------|------|
| `list(nftContract, tokenId, price)` | 上架 NFT | 任何人（需先授权 NFT） |
| `cancelListing(listingId)` | 取消上架 | 仅卖家 |
| `buyNFT(listingId)` | 普通购买 | 任何人（需授权支付代币） |
| `permitBuy(listingId, v, r, s)` | 白名单购买 | 需有效签名（需授权支付代币） |
| `signer()` | 查询项目方签名地址 | 只读 |
| `domainSeparator()` | 查询 EIP-712 domain separator | 只读 |
| `PERMIT_TYPEHASH()` | 查询 PermitBuy 类型哈希 | 只读 |

## 常见问题

**Q: 签名生成后提示"当前钱包不是项目方签名地址"**
A: 必须使用合约的 signer 地址对应的钱包连接。可在「项目方签名地址」卡片中查看当前合约的 signer 地址。

**Q: permitBuy 交易失败**
A: 检查以下几点：
1. 签名的 buyer 地址与当前连接的钱包一致
2. 签名的 listingId 与目标上架一致
3. 签名未过期（合约可能会校验 nonce）
4. 支付代币已授权足够额度
5. Listing 仍处于活跃状态

**Q: 完整签名输入后提示长度不对**
A: 签名必须为 `0x` + 130 个 hex 字符（共 132 字符），65 字节。

**Q: sign-permit.sh 报 `bad substitution` 错误**
A: macOS 自带 Bash 3.2，不支持 `${var,,}` 等 Bash 4+ 语法。脚本已使用 `tr` 替代，如果仍有问题请确认脚本为最新版本。

**Q: `f(bytes32,address,uint256)` 中的 `f` 是什么？**
A: `cast abi-encode` 的参数是函数签名格式 `"函数名(参数类型,...)"`，函数名只是占位符，cast 只根据参数类型做 ABI 编码，因此 `f`、`PermitBuy`、`encode` 等任意名称效果相同。参数类型对应关系：`bytes32` = PERMIT_TYPEHASH，`address` = buyer，`uint256` = listingId。
