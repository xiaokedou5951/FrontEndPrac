# airdrop-merkle 白名单 proof 后端

原生 Node http 服务，手写 Merkle 树（与 OpenZeppelin `commutativeKeccak256` 兼容），为 `airdrop-merkle` 前端页面提供白名单 proof 接口。

## 文件

| 文件 | 用途 |
| --- | --- |
| [`server.mjs`](./server.mjs) | HTTP 服务，构建 Merkle 树并提供 proof API |
| [`whitelist.json`](./whitelist.json) | 白名单地址清单，后端据此构建 Merkle 树 |
| [`mint-nft.sh`](./mint-nft.sh) | 铸造 SimpleNft 合约的 NFT，用于上架测试 |
| [`package.json`](./package.json) | 项目元信息（依赖从父级 `wagmi-front/node_modules` 解析） |

## 快速开始

```bash
# 1. 确保已启动本地 anvil
anvil

# 2. 确保已部署合约（参考 wagmi-front/scripts/README.md）
#    AirdropMerkleNFTMarket 部署时 merkleRoot 必须等于后端 GET /root 返回值

# 3. 启动 proof 后端
npm start

# 4. 验证
curl http://localhost:4001/health          # {"ok":true}
curl http://localhost:4001/root             # {"root":"0x..."}
curl http://localhost:4001/whitelist        # {"addresses":[...], "root":"0x...", "count":N}
curl http://localhost:4001/proof/0xf39...   # {"address":"0x...", "leaf":"0x...", "proof":["0x...",...], "root":"0x..."}
```

## API 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/root` | 返回 Merkle 根（部署合约时使用此值作为 `merkleRoot` 构造参数） |
| GET | `/whitelist` | 返回完整白名单、Merkle 根与地址数量 |
| GET | `/proof/:address` | 返回指定地址的 proof（白名单命中时）；未命中返回 404 |

### GET /proof/:address 响应示例

```json
{
  "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "leaf": "0x34c4d3f1...",
  "proof": [
    "0x8a9c7d2b...",
    "0x1f3e5a9b..."
  ],
  "root": "0x7b4e2c8f..."
}
```

- `leaf`：`keccak256(address)`（叶子哈希）
- `proof`：从叶子到根每层的兄弟节点数组，与 OZ `MerkleProof.verify` 兼容
- 404 响应：`{"error":"not in whitelist","address":"0x..."}`

## Merkle 树算法

与 OpenZeppelin `StandardMerkleTree` 完全兼容：

- **叶子**：`keccak256(address)`（20 字节地址的 keccak256）
- **配对哈希**：`commutativeKeccak256(a, b)`——按字典序排序后 `keccak256(concat(a, b))`，保证交换律
- **奇数层处理**：末尾节点与自身配对（复制自身作为兄弟）

## 配置白名单

编辑 [`whitelist.json`](./whitelist.json)：

```json
{
  "addresses": [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  ]
}
```

- 地址会自动校验格式、转小写、去重
- 修改后需**重启后端**才能生效
- 重新部署 `AirdropMerkleNFTMarket` 合约时，`merkleRoot` 必须等于新的 `GET /root` 返回值

## 铸造 NFT

[`mint-nft.sh`](./mint-nft.sh) 用于铸造 SimpleNft 合约的 NFT，方便上架测试：

```bash
# 铸造 tokenId=1 给默认 anvil 账户 #0
./mint-nft.sh

# 铸造指定 tokenId
./mint-nft.sh 5
```

- 脚本自动从 `wagmi-front/.env.local` 读取 `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL`
- 默认接收地址为 anvil 账户 #0
- 铸造前会检查 tokenId 是否已被铸造

## 环境变量

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `PORT` | proof 后端监听端口 | `4001` |
| `RPC_URL` | mint-nft.sh 的 RPC 端点 | `http://127.0.0.1:8545` |
| `PRIVATE_KEY` | mint-nft.sh 的签名私钥 | anvil 账户 #0 私钥 |

## 与前端集成

- 前端页面：`/airdrop-merkle`（`wagmi-front/src/app/airdrop-merkle/page.tsx`）
- 前端通过 `NEXT_PUBLIC_AIRDROP_PROOF_API_BASE`（默认 `http://localhost:4001`）调用 proof API
- 支付代币通过 `NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS_*` 读取（MyTokenPermit，支持 EIP-2612 permit）
- 购买流程：白名单用户用钱包对 EIP-2612 Permit 签名 → 一笔 multicall 交易完成扣款与领 NFT

## 故障排查

| 现象 | 原因 / 解决 |
| --- | --- |
| `merkleRoot 与合约不一致` | 修改了 `whitelist.json` 或重新部署后未更新合约。调用 `setMerkleRoot(newRoot)` 或重跑部署脚本 |
| `/proof/:address` 返回 404 | 地址不在白名单中；检查地址大小写（后端自动转小写） |
| 后端启动报错 `找不到 viem` | 依赖从父级 `wagmi-front/node_modules` 解析，确保 `wagmi-front` 已 `npm install` |
| mint-nft.sh 报错 `未找到 NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL` | 先运行 `wagmi-front/scripts/deploy-contracts.sh` 部署合约 |
| mint-nft.sh 报错 `Token ID 已被铸造` | 换一个 tokenId，或用 `cast call ... "burn(uint256)"` 销毁后重试 |