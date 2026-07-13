# 一键部署合约 Shell 脚本

## Context

`viem-front` 是一个 Next.js + Viem 前端，依赖 4 个已部署的合约地址（写在 `.env.local`）：
- `NEXT_PUBLIC_TOKEN_ADDRESS`（MyERC20）
- `NEXT_PUBLIC_TOKENBANK_ADDRESS`（TokenBank）
- `NEXT_PUBLIC_NFT_MARKET_ADDRESS`（NFTMarket）
- `NEXT_PUBLIC_SIMPLE_NFT_ADDRESS`（SimpleNft）

合约源码与 Forge 部署脚本位于相邻的 `../contracts/` Foundry 项目里（`script/{MyERC20,TokenBank,NFTMarket,SimpleNft}.s.sol`）。当前每次重新部署需要：手动跑 4 条 `forge script` → 从 `broadcast/<Script>.s.sol/<chainId>/run-latest.json` 抠地址 → 手动改 `.env.local`，繁琐且易错。

目标：写一个 `viem-front/scripts/deploy-contracts.sh`，一条命令完成「部署 4 个合约 → 提取地址 → 写回 `.env.local` → 链上回读校验」。

## 设计要点

### 部署顺序（存在依赖关系）
1. `MyERC20` — 无前置依赖，构造时向部署者铸造 1,000,000 * 1e18
2. `TokenBank` — 构造参数 `TOKEN_ADDRESS` = 上一步 MyERC20 地址
3. `NFTMarket` — 构造参数 `TOKEN_ADDRESS` = MyERC20 地址（作为支付代币）
4. `SimpleNft` — 无构造参数

### 环境变量优先级
`用户已导出的环境变量` > `contracts/.env` > `内置默认值`（anvil 账户 #0 私钥 + `http://127.0.0.1:8545` + `MyToken/MTK`）

涉及的变量：
- `PRIVATE_KEY` — 部署私钥
- `RPC_URL` — 链 RPC
- `TOKEN_NAME` / `TOKEN_SYMBOL` — MyERC20 构造参数
- `TOKEN_ADDRESS` — 由脚本在 MyERC20 部署后自动设置，传递给后续 Forge 脚本

### 地址提取
从 `contracts/broadcast/<Script>.s.sol/<chainId>/run-latest.json` 用 `jq` 读取 `.receipts[0].contractAddress`。chainId 通过 `cast chain-id --rpc-url $RPC_URL` 动态获取，避免硬编码 31337。

### `.env.local` 更新策略
- 文件不存在：从 `.env.local.example` 复制一份（保留注释与默认 RPC/WS 配置）
- 文件已存在：先做时间戳备份（`.env.local.bak.YYYYMMDD-HHMMSS`），再原地更新
- 用 `awk` 替换 4 行 `KEY=value`，保留其他注释和配置不变；若某 key 不存在则追加

### 链上回读校验（warn-only，失败不阻断）
- `cast call $TOKENBANK_ADDRESS "token()(address)"` 应等于 MyERC20 地址
- `cast call $NFT_MARKET_ADDRESS "paymentToken()(address)"` 应等于 MyERC20 地址

## 实施步骤

### 1. 新建文件 `viem-front/scripts/deploy-contracts.sh`

结构：
```bash
#!/usr/bin/env bash
set -euo pipefail

# 路径常量：SCRIPT_DIR / VIEM_FRONT_DIR / CONTRACTS_DIR / ENV_LOCAL / ENV_LOCAL_EXAMPLE
# 默认值：anvil #0 私钥 / http://127.0.0.1:8545 / MyToken / MTK

# 工具函数：log / ok / err / die / load_var / require_cmd / extract_address / deploy / update_env_var

# 1. 前置检查：forge / cast / jq / contracts 目录 / foundry.toml
# 2. load_var 加载 PRIVATE_KEY / RPC_URL / TOKEN_NAME / TOKEN_SYMBOL
# 3. cast chain-id 探测 RPC 在线 + 取 chainId
# 4. 依次部署 4 个合约，每个都 extract_address
# 5. cast call 校验 TokenBank.token() / NFTMarket.paymentToken()（warn-only）
# 6. 处理 .env.local：不存在则从 example 复制；存在则备份
# 7. awk 更新 4 行地址
# 8. 打印汇总表 + 重启 npm run dev 提示
```

关键实现细节：

- **`load_var`**：用 `grep` 从 `contracts/.env` 提取，避免 `source` 引入污染；用户已 export 的变量优先
  ```bash
  load_var() {
    local key=$1 default=$2
    [ -n "${!key:-}" ] && return
    if [ -f "$CONTRACTS_DIR/.env" ]; then
      local val
      val=$(grep -E "^${key}=" "$CONTRACTS_DIR/.env" | head -1 | cut -d= -f2- | tr -d '\r')
      [ -n "$val" ] && export "$key=$val" && return
    fi
    export "$key=$default"
  }
  ```

- **`extract_address`**：`jq -r '.receipts[0].contractAddress'`

- **`deploy`**：`forge script script/<X>.s.sol --rpc-url $RPC_URL --broadcast --slow`，失败时打印日志并退出。`--slow` 等待 receipt，确保 broadcast 文件写入

- **`update_env_var`**：awk 行替换，避免 macOS / GNU sed `-i` 差异
  ```bash
  awk -v k="$key" -v v="$value" '
    $0 ~ "^" k "=" { print k "=" v; found=1; next }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
  ```

- **校验**：`cast call <addr> "token()(address)"` 直接返回解码后的地址，小写化后对比

### 2. 设置可执行权限
`chmod +x viem-front/scripts/deploy-contracts.sh`

## 关键文件

- 新建：[viem-front/scripts/deploy-contracts.sh](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/scripts/deploy-contracts.sh)
- 参考（不修改）：
  - [contracts/script/MyERC20.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/MyERC20.s.sol) — 读取 PRIVATE_KEY/TOKEN_NAME/TOKEN_SYMBOL
  - [contracts/script/TokenBank.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/TokenBank.s.sol) — 读取 PRIVATE_KEY/TOKEN_ADDRESS
  - [contracts/script/NFTMarket.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/NFTMarket.s.sol) — 读取 PRIVATE_KEY/TOKEN_ADDRESS
  - [contracts/script/SimpleNft.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/SimpleNft.s.sol) — 读取 PRIVATE_KEY
  - [viem-front/.env.local.example](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/.env.local.example) — 4 个地址 key 的格式参考

## 验证

```bash
# 1. 启动 anvil（另开终端）
anvil

# 2. 在 viem-front 下运行脚本
cd viem-front
./scripts/deploy-contracts.sh

# 期望输出：
#   - 4 个合约依次部署成功，打印地址
#   - TokenBank.token() / NFTMarket.paymentToken() 校验通过
#   - .env.local 中 4 个 NEXT_PUBLIC_*_ADDRESS 被更新为新地址
#   - 末尾汇总表 + "请重启 npm run dev" 提示

# 3. 验证 .env.local 内容
cat .env.local

# 4. 启动前端确认配置生效
npm run dev
# 访问 http://localhost:3000/tokenbank 和 /nftmarket，能正常读取合约状态
```

边界场景测试：
- 私钥覆盖：`PRIVATE_KEY=0x... ./scripts/deploy-contracts.sh` 应使用用户私钥
- RPC 覆盖：`RPC_URL=http://... ./scripts/deploy-contracts.sh` 应部署到指定链
- RPC 离线：脚本应在 `cast chain-id` 处友好报错退出，不进入部署流程
- 已有 `.env.local`：应创建 `.env.local.bak.<时间戳>` 备份后再更新
