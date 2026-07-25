# 部署和运行手册

## 前置依赖

| 工具 | 用途 | 安装 |
|------|------|------|
| Foundry (forge / cast) | 编译部署合约 | https://book.getfoundry.sh |
| Node.js >= 18 | 前端运行 | nvm / fnm |
| jq | 部署脚本解析 broadcast JSON | `brew install jq` |
| MetaMask 或其他 EIP-1193 钱包 | 浏览器交互 | 浏览器扩展 |

## 本地开发（anvil）

### 1. 启动本地链

```bash
anvil
# 默认监听 http://127.0.0.1:8545，自动创建 10 个测试账户
```

### 2. 部署合约

#### 方式 A：一键部署脚本

**viem-front：**

```bash
cd viem-front
./scripts/deploy-contracts.sh
# 自动部署 MyERC20 → TokenBank → NFTMarket → SimpleNft
# 自动将地址写入 viem-front/.env.local
```

**wagmi-front：**

```bash
cd wagmi-front
./scripts/deploy-contracts.sh
# 同上，但写入 NEXT_PUBLIC_*_LOCAL 后缀的环境变量
```

脚本默认使用 anvil 账户 #0 私钥，仅用于本地测试。

#### 方式 B：手动 forge script

```bash
cd contracts

# 1. 部署 MyERC20
forge script script/MyERC20.s.sol --rpc-url local --broadcast

# 2. 部署 TokenBank（需先设置 TOKEN_ADDRESS）
export TOKEN_ADDRESS=<MyERC20 部署地址>
forge script script/TokenBank.s.sol --rpc-url local --broadcast

# 3. 部署 NFTMarket
forge script script/NFTMarket.s.sol --rpc-url local --broadcast

# 4. 部署 SimpleNft
forge script script/SimpleNft.s.sol --rpc-url local --broadcast

# 5. (可选) 部署 NFTMarketPermit
export SIGNER_ADDRESS=<项目方签名地址>
forge script script/NFTMarketPermit.s.sol --rpc-url local --broadcast
```

### 3. 配置前端环境变量

#### viem-front

```bash
cd viem-front
cp .env.local.example .env.local
# 编辑 .env.local，填入部署后的合约地址
```

必填项：

```
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_TOKENBANK_ADDRESS=0x...
NEXT_PUBLIC_NFT_MARKET_ADDRESS=0x...
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS=0x...
```

可选项：

```
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
```

#### wagmi-front

```bash
cd wagmi-front
cp .env.local.example .env.local
# 编辑 .env.local，填入 Reown Project ID 和各链合约地址
```

必填项：

```
NEXT_PUBLIC_REOWN_PROJECT_ID=<从 https://cloud.reown.com 获取>
NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL=0x...
NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL=0x...
NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL=0x...
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL=0x...
```

### 4. 启动前端

```bash
# viem-front
cd viem-front
npm install
npm run dev
# 访问 http://localhost:3000

# wagmi-front
cd wagmi-front
npm install
npm run dev
# 访问 http://localhost:3000（若 viem-front 也在运行，会使用 3001）
```

### 5. 验证

1. 浏览器打开前端，连接 MetaMask 钱包
2. 确保 MetaMask 连接到 `Localhost 8545` 网络（chainId 31337）
3. 导入 anvil 账户私钥到 MetaMask（用于本地测试代币）
4. TokenBank 页面：查看余额 → 授权 → 存款 → 查看存款 → 取款
5. NFTMarket 页面：Mint NFT → 授权 NFT → 上架 → 购买

## 部署到测试网（Sepolia）

### 1. 配置合约环境变量

```bash
cd contracts
cp .env.example .env
# 编辑 .env：
#   PRIVATE_KEY=0x...（你的 Sepolia 账户私钥）
#   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<KEY>
#   TOKEN_ADDRESS=（先部署 MyERC20 后填入）
```

### 2. 部署合约

```bash
cd contracts

# 按顺序部署
forge script script/MyERC20.s.sol --rpc-url sepolia --broadcast
# 记录 MyERC20 地址，写入 .env 的 TOKEN_ADDRESS

forge script script/TokenBank.s.sol --rpc-url sepolia --broadcast
forge script script/NFTMarket.s.sol --rpc-url sepolia --broadcast
forge script script/SimpleNft.s.sol --rpc-url sepolia --broadcast
```

### 3. 更新前端环境变量

**viem-front：**

```bash
# 编辑 viem-front/.env.local
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<KEY>
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_TOKEN_ADDRESS=<Sepolia 上的 MyERC20 地址>
NEXT_PUBLIC_TOKENBANK_ADDRESS=<Sepolia 上的 TokenBank 地址>
```

**wagmi-front：**

```bash
# 编辑 wagmi-front/.env.local
NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA=0x...
NEXT_PUBLIC_TOKENBANK_ADDRESS_SEPOLIA=0x...
NEXT_PUBLIC_NFT_MARKET_ADDRESS_SEPOLIA=0x...
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_SEPOLIA=0x...
```

### 4. 链上校验

```bash
# 验证 TokenBank 绑定的 token 地址
cast call <TokenBank地址> "token()(address)" --rpc-url sepolia

# 验证 NFTMarket 的 paymentToken
cast call <NFTMarket地址> "paymentToken()(address)" --rpc-url sepolia
```

## 合约运行测试

```bash
cd contracts

# 运行所有测试
forge test -vv

# 仅运行 NFTMarketPermit 测试（详细输出）
forge test --match-contract NFTMarketPermitTest -vvvv
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 前端显示"缺少环境变量" | .env.local 未配置或地址格式错误 | 检查 .env.local 中的地址是否为有效 0x 开头的 42 字符地址 |
| 存款失败 / 交易 revert | TokenBank.token() 与 NEXT_PUBLIC_TOKEN_ADDRESS 不一致 | 部署脚本会自动校验；手动部署需确保一致 |
| MetaMask 连接后链不匹配 | MetaMask 当前网络与前端配置的链不同 | 切换 MetaMask 到对应网络 |
| wagmi-front 启动报错 "NEXT_PUBLIC_REOWN_PROJECT_ID" | 未配置 Reown Cloud Project ID | 从 https://cloud.reown.com 获取并配置 |
| 事件监听不工作 | 本地 anvil 的 WS 支持有限 | viem-front 使用 HTTP 轮询模式（watchEvent with pollingInterval），无需 WS |
| 部署脚本报错 "找不到 broadcast 文件" | forge script 未成功执行 | 检查 RPC 连接、私钥、余额是否充足 |
