# viem-front/scripts

前端辅助脚本目录。当前包含：

| 脚本 | 用途 |
| --- | --- |
| [`deploy-contracts.sh`](./deploy-contracts.sh) | 一键部署 `contracts/` 下的 4 个合约，并把地址写回 `viem-front/.env.local` |

---

## deploy-contracts.sh

一条命令完成「部署合约 → 提取地址 → 写回 `.env.local` → 链上回读校验」全流程，避免手动跑 4 条 `forge script` 再抠地址改配置。

### 部署顺序（存在依赖关系）

1. **MyERC20** — 无前置依赖，构造时向部署者铸造 1,000,000 * 1e18
2. **TokenBank** — 构造参数 `TOKEN_ADDRESS` = 上一步 MyERC20 地址
3. **NFTMarket** — 构造参数 `TOKEN_ADDRESS` = MyERC20 地址（作为支付代币）
4. **SimpleNft** — 无构造参数

### 依赖

- [Foundry](https://book.getfoundry.sh/) 工具链：`forge` / `cast`（脚本会自动检查）
- `jq`（macOS 可 `brew install jq`）
- 已启动的 EVM 节点（本地用 `anvil`，另开终端运行）

### 快速开始

```bash
# 1. 另开终端启动本地 anvil
anvil

# 2. 在 viem-front 下执行
cd viem-front
./scripts/deploy-contracts.sh
```

成功后会在 `.env.local` 中更新以下 4 个变量：

```
NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL        = MyERC20    合约地址
NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL    = TokenBank  合约地址
NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL   = NFTMarket  合约地址
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL   = SimpleNft  合约地址
```

> 写入后会提示重启 `npm run dev` 使新地址生效。

### 环境变量

优先级：**当前 shell 已导出的环境变量** > `contracts/.env` > **内置默认值**

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `PRIVATE_KEY` | 部署私钥 | anvil 账户 #0 的私钥（仅本地测试） |
| `RPC_URL` | 链 RPC 端点 | `http://127.0.0.1:8545` |
| `TOKEN_NAME` | MyERC20 名称 | `MyToken` |
| `TOKEN_SYMBOL` | MyERC20 符号 | `MTK` |

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
```

### 脚本流程

1. **前置检查** — 确认 `forge` / `cast` / `jq` 已安装、`contracts/` 目录与 `foundry.toml` 存在
2. **加载配置** — 按上述优先级读取 4 个环境变量
3. **探测 RPC** — `cast chain-id` 确认节点在线并动态获取 chainId（避免硬编码 31337）
4. **依次部署 4 个合约** — 每个 `forge script ... --broadcast --slow`，失败时打印 `/tmp/deploy-*.log` 日志并退出
5. **提取地址** — 用 `jq` 从 `contracts/broadcast/<Script>.s.sol/<chainId>/run-latest.json` 读取 `.receipts[0].contractAddress`
6. **链上回读校验**（warn-only，失败不阻断）
   - `cast call TokenBank.token()` 应回等于 MyERC20 地址
   - `cast call NFTMarket.paymentToken()` 应回等于 MyERC20 地址
7. **更新 `.env.local`**
   - 文件不存在 → 从 `.env.local.example` 复制一份
   - 文件已存在 → 先备份为 `.env.local.bak.YYYYMMDD-HHMMSS`
   - 用 `awk` 替换 4 行 `KEY=value`，保留其他注释与配置；若某 key 不存在则追加
8. **打印汇总表** 与重启提示

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
| `找不到 broadcast 文件` | `forge script` 没真正广播上链；检查日志 `/tmp/deploy-<Script>-*.log`，常见原因是私钥余额不足 |
| `TokenBank.token() 与 MyERC20 地址不一致` | 极少见，通常是手动改过 `.env.local` 或重跑了部分合约。重新跑一遍脚本即可 |
| 部署到 Sepolia 失败 | 确认 `PRIVATE_KEY` 对应账户有测试币、`RPC_URL` 可用 |

### 相关文件

- 部署脚本：[`deploy-contracts.sh`](./deploy-contracts.sh)
- 合约 Forge 脚本：[`contracts/script/*.s.sol`](../../contracts/script/)
- 前端配置入口：[`src/config/shared.ts`](../src/config/shared.ts) / [`tokenbank.ts`](../src/config/tokenbank.ts) / [`nftmarket.ts`](../src/config/nftmarket.ts)
- 环境变量模板：[`.env.local.example`](../.env.local.example)
