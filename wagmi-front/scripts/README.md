# viem-front/scripts

前端辅助脚本目录。当前包含：

| 脚本 | 用途 |
| --- | --- |
| [`deploy-contracts.sh`](./deploy-contracts.sh) | 一键部署 `contracts/` 下的 7 个合约（含 proof 后端自动启动），并把地址写回 `viem-front/.env.local` |

---

## deploy-contracts.sh

一条命令完成「部署合约 → 提取地址 → 写回 `.env.local` → 链上回读校验」全流程，避免手动跑 7 条 `forge script` 再抠地址改配置。部署 `AirdropMerkleNFTMarket` 时会自动启动 proof 后端（若未运行）。

### 部署顺序（存在依赖关系）

1. **MyERC20** — 无前置依赖，构造时向部署者铸造 1,000,000 * 1e18
2. **MyTokenPermit** — 无前置依赖，EIP-2612 permit 代币，向部署者铸造 `TOKEN_INITIAL_SUPPLY` * 1e18
3. **TokenBank** — 构造参数 `TOKEN_ADDRESS` = MyERC20 地址
4. **NFTMarket** — 构造参数 `TOKEN_ADDRESS` = MyERC20 地址（作为支付代币）
5. **NFTMarketPermit** — 构造参数 `TOKEN_ADDRESS` + `SIGNER_ADDRESS`（白名单签名地址）
6. **SimpleNft** — 无构造参数
7. **AirdropMerkleNFTMarket** — 构造参数 `MY_TOKEN_PERMIT_ADDRESS` + `MERKLE_ROOT`
   - `paymentToken` = 第 2 步 MyTokenPermit 地址
   - `merkleRoot` 由 proof 后端 `GET /root` 提供；若后端未运行，脚本会自动启动 `wagmi-front/test/airdrop-merkle/server.mjs`

### 依赖

- [Foundry](https://book.getfoundry.sh/) 工具链：`forge` / `cast`（脚本会自动检查）
- `jq`（macOS 可 `brew install jq`）
- `curl`（系统自带，用于调用 proof 后端）
- `node`（用于启动 proof 后端，脚本会自动检查）
- 已启动的 EVM 节点（本地用 `anvil`，另开终端运行）

### 快速开始

```bash
# 1. 另开终端启动本地 anvil
anvil

# 2. 在 viem-front 下执行
cd viem-front
./scripts/deploy-contracts.sh
```

成功后会在 `.env.local` 中更新以下 7 个合约地址变量 + proof API base：

```
NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL                = MyERC20                合约地址
NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS_LOCAL      = MyTokenPermit          合约地址
NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL            = TokenBank              合约地址
NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL           = NFTMarket              合约地址
NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_LOCAL    = NFTMarketPermit        合约地址
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL           = SimpleNft              合约地址
NEXT_PUBLIC_AIRDROP_MERKLE_MARKET_ADDRESS_LOCAL= AirdropMerkleNFTMarket 合约地址
NEXT_PUBLIC_AIRDROP_PROOF_API_BASE             = proof 后端地址（默认 http://localhost:4001）
```

> 写入后会提示重启 `npm run dev` 使新地址生效。
>
> 注意：`AirdropMerkleNFTMarket` 的 `paymentToken` 为 `MyTokenPermit`（独立变量 `NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS_LOCAL`），**不覆盖** `NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL`。但 airdrop-merkle 前端页面通过 `NEXT_PUBLIC_TOKEN_ADDRESS_*` 读取支付代币地址，演示该页面时需手动将 `NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL` 改为 `MyTokenPermit` 地址（会让 `/nft-market`、`/nft-market-white` 改用 MyTokenPermit，可手动切换回来）。

### 环境变量

优先级：**当前 shell 已导出的环境变量** > `contracts/.env` > **内置默认值**

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `PRIVATE_KEY` | 部署私钥 | anvil 账户 #0 的私钥（仅本地测试） |
| `RPC_URL` | 链 RPC 端点 | `http://127.0.0.1:8545` |
| `TOKEN_NAME` | MyERC20 名称 | `MyToken` |
| `TOKEN_SYMBOL` | MyERC20 符号 | `MTK` |
| `SIGNER_ADDRESS` | NFTMarketPermit 白名单签名地址 | anvil 账户 #0 的地址 |
| `TOKEN_INITIAL_SUPPLY` | MyTokenPermit 初始供应量（whole tokens，构造函数内部会乘以 1e18） | `1000000` |
| `PROOF_API_BASE` | airdrop-merkle proof 后端地址；若未运行脚本会自动启动 | `http://localhost:4001` |

> ⚠️ `PRIVATE_KEY` 默认值仅供本地 anvil 测试。部署到 Sepolia 等公网测试链/主网时，请务必通过环境变量或 `contracts/.env` 覆盖为自己的私钥，切勿把真实私钥提交到版本控制。

#### 覆盖示例

```bash
# 换部署私钥
PRIVATE_KEY=0x... ./scripts/deploy-contracts.sh

# 部署到 Sepolia
RPC_URL=https://sepolia.infura.io/v3/<KEY> \
PRIVATE_KEY=0x... \
./scripts/deploy-contracts.sh

# 自定义代币名称 / 符号
TOKEN_NAME="Prac Token" TOKEN_SYMBOL=FEP ./scripts/deploy-contracts.sh

# 自定义 MyTokenPermit 初始供应量 + proof 后端端口
TOKEN_INITIAL_SUPPLY=5000000 PROOF_API_BASE=http://localhost:5001 \
./scripts/deploy-contracts.sh
```

### 脚本流程

1. **前置检查** — 确认 `forge` / `cast` / `jq` / `curl` / `node` 已安装、`contracts/` 目录与 `foundry.toml` 存在
2. **加载配置** — 按上述优先级读取 7 个环境变量
3. **探测 RPC** — `cast chain-id` 确认节点在线并动态获取 chainId（避免硬编码 31337）
4. **依次部署 7 个合约** — 每个 `forge script ... --broadcast --slow`，失败时打印 `/tmp/deploy-*.log` 日志并退出
   - 第 7 步（AirdropMerkleNFTMarket）前，脚本会检测 proof 后端是否运行（`curl $PROOF_API_BASE/health`）；未运行则自动 `nohup node server.mjs &` 后台启动并轮询等待就绪（最多 10 秒），再 `curl $PROOF_API_BASE/root` 获取 merkleRoot 作为构造参数
5. **提取地址** — 用 `jq` 从 `contracts/broadcast/<Script>.s.sol/<chainId>/run-latest.json` 读取 `.receipts[0].contractAddress`
6. **链上回读校验**（warn-only，失败不阻断）
   - `cast call TokenBank.token()` 应回等于 MyERC20 地址
   - `cast call NFTMarket.paymentToken()` 应回等于 MyERC20 地址
   - `cast call NFTMarketPermit.paymentToken()` 应回等于 MyERC20 地址
   - `cast call NFTMarketPermit.signer()` 应回等于 SIGNER_ADDRESS
   - `cast call AirdropMerkleNFTMarket.paymentToken()` 应回等于 MyTokenPermit 地址
   - `cast call AirdropMerkleNFTMarket.merkleRoot()` 应回等于后端 `/root` 返回值
7. **更新 `.env.local`**
   - 文件不存在 → 从 `.env.local.example` 复制一份
   - 文件已存在 → 先备份为 `.env.local.bak.YYYYMMDD-HHMMSS`
   - 用 `awk` 替换 7 行合约地址 `KEY=value` + `NEXT_PUBLIC_AIRDROP_PROOF_API_BASE`，保留其他注释与配置；若某 key 不存在则追加
8. **打印汇总表** 与重启提示
   - 若 proof 后端由本脚本自动启动，会额外打印其 PID、端口、停止命令（`kill $PID`）与日志路径（`/tmp/airdrop-merkle-proof-*.log`）；后端**不会自动停止**，继续运行供前端调用

### .env.local 写入效果

更新前后对比示例：

```diff
  # MyERC20 代币合约地址
- NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL=0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E
+ NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL=0x4C4a2f8c81640e47606d3fd77B353E87Ba015584

  # TokenBank 合约地址
- NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL=0xc5a5C42992dECbae36851359345FE25997F5C42d
+ NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL=0x21dF544947ba3E8b3c32561399E88B52Dc8b2823
```

其他配置（`NEXT_PUBLIC_RPC_URL`、`NEXT_PUBLIC_WS_URL`、注释等）保持不变。

### 验证

```bash
# 1. 检查 .env.local 已更新
cat .env.local

# 2. 重启前端
npm run dev

# 3. 访问页面确认合约调用正常
#    http://localhost:3000/tokenbank    读取余额 / 存款 / 授权额度
#    http://localhost:3000/nftmarket    读取 listings
```

### 故障排查

| 现象 | 原因 / 解决 |
| --- | --- |
| `无法连接 RPC 节点` | anvil 未启动；另开终端运行 `anvil`，或检查 `RPC_URL` |
| `缺少依赖命令: forge` | 未安装 Foundry，参考 https://book.getfoundry.sh/getting-started/installation |
| `缺少依赖命令: curl` / `node` | 部署 AirdropMerkleNFTMarket 需要 curl 调用后端、node 启动后端；macOS 自带 curl，node 可 `brew install node` |
| `找不到 broadcast 文件` | `forge script` 没真正广播上链；检查日志 `/tmp/deploy-<Script>-*.log`，常见原因是私钥余额不足 |
| `TokenBank.token() 与 MyERC20 地址不一致` | 极少见，通常是手动改过 `.env.local` 或重跑了部分合约。重新跑一遍脚本即可 |
| `proof 后端启动超时` | 检查 `/tmp/airdrop-merkle-proof-*.log`；常见原因是 `whitelist.json` 格式错误或端口 4001 被占用。可手动 `cd wagmi-front/test/airdrop-merkle && npm start` 排查 |
| `AirdropMerkleNFTMarket 未部署` | proof 后端未就绪导致 merkleRoot 获取失败；脚本会跳过该合约部署，其他 6 个合约地址仍会写入 `.env.local`。启动后端后重跑脚本即可 |
| `AirdropMerkleNFTMarket.merkleRoot() 不一致` | 部署后修改了 `whitelist.json` 导致后端 root 变化；调用合约 `setMerkleRoot(newRoot)` 更新，或重跑部署 |
| 部署到 Sepolia 失败 | 确认 `PRIVATE_KEY` 对应账户有测试币、`RPC_URL` 可用 |

### 相关文件

- 部署脚本：[`deploy-contracts.sh`](./deploy-contracts.sh)
- 合约 Forge 脚本：[`contracts/script/*.s.sol`](../../contracts/script/)（含 `MyTokenPermit.s.sol`、`AirdropMerkleNFTMarket.s.sol`）
- proof 后端：[`test/airdrop-merkle/server.mjs`](../test/airdrop-merkle/server.mjs) + [`whitelist.json`](../test/airdrop-merkle/whitelist.json)
- 前端配置入口：[`src/config/shared.ts`](../src/config/shared.ts) / [`tokenbank.ts`](../src/config/tokenbank.ts) / [`nftmarket.ts`](../src/config/nftmarket.ts) / [`airdropMerkle.ts`](../src/config/airdropMerkle.ts)
- 环境变量模板：[`.env.local.example`](../.env.local.example)
