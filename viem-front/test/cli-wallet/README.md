# CLI Wallet — 基于 Viem.js 的命令行钱包

模拟一个命令行钱包，连接 **Sepolia 测试网**，实现以下功能：

1. **生成私钥 / 导入私钥**，查询 ETH 和 ERC20 余额
2. **构建 ERC20 Transfer 的 EIP-1559 交易**
3. **用本地私钥对交易签名**
4. **发送已签名交易到 Sepolia 网络**

---

## 运行

```bash
node test/cli-wallet/cli-wallet.mjs
```

### 环境变量（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SEPOLIA_RPC_URL` | Sepolia RPC 端点 | `https://ethereum-sepolia-rpc.publicnode.com` |
| `ERC20_ADDRESS` | 默认 ERC20 代币合约地址 | `0x86e03d015bFB9E9af17E76667FBf659bFfbD81F5` (MTK) |

使用自定义 RPC 的示例：

```bash
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY node test/cli-wallet/cli-wallet.mjs
```

---

## 菜单说明

```
╔══════════════════════════════════════════════════════╗
║          CLI Wallet — Viem.js × Sepolia              ║
╚══════════════════════════════════════════════════════╝

请选择操作:
  1 — 生成私钥 / 导入私钥
  2 — 查询余额（ETH + ERC20）
  3 — 构建 & 签名 & 发送 ERC20 Transfer (EIP-1559)
  0 — 退出
```

### 选项 1：生成私钥 / 导入私钥

- 选择 `[1]` 自动生成新的随机私钥
- 选择 `[2]` 导入已有私钥（支持带或不带 `0x` 前缀）

输出示例：

```
✅ 账户已就绪
   私钥: 0x19834a7576cf06b25641f9f5c53a5c027af0303737ee41a3376795a7148096ca
   地址: 0xa8c3d01bD25Dd0fa66f392409fb4354bD00CDC80
```

> **注意**：生成的新地址在 Sepolia 上余额为 0，需要从水龙头获取测试 ETH。  
> 推荐水龙头：https://sepoliafaucet.com

### 选项 2：查询余额

- 显示当前账户的 ETH 余额
- 可输入 ERC20 合约地址查询代币余额（回车使用默认地址）

输出示例：

```
📍 地址: 0xa8c3d01bD25Dd0fa66f392409fb4354bD00CDC80
💰 ETH 余额: 0.01 ETH
🪙  MTK 余额: 0.01 MTK (合约: 0x86e03d015bFB9E9af17E76667FBf659bFfbD81F5)
```

### 选项 3：构建 & 签名 & 发送 ERC20 Transfer (EIP-1559)

完整流程分为 4 个步骤：

#### 步骤 1：收集交易参数

输入 ERC20 合约地址、转账目标地址和金额。

#### 步骤 2：构建 EIP-1559 交易

- 使用 `encodeFunctionData` 编码 `transfer(to, value)` 的 calldata
- 通过 `estimateContractGas` 估算 gas limit
- 通过 `getFeeHistory` + `baseFeePerGas` 计算 EIP-1559 fee 参数：
  - `maxPriorityFeePerGas` = 最近 5 个区块 reward 中位数的平均值
  - `maxFeePerGas` = baseFee × 2 + maxPriorityFeePerGas
- 获取当前 nonce

输出交易详情：

```
📝 EIP-1559 交易详情:
   type:            eip1559
   chainId:         11155111
   nonce:           0
   maxFeePerGas:    2008699619 (2.008699619 Gwei)
   maxPriorityFee:  32152813 (0.032152813 Gwei)
   gasLimit:        35077
   to:              0x86e03d015bFB9E9af17E76667FBf659bFfbD81F5
   value:           0 (ERC20 转账，ETH value=0)
   data:            0xa9059cbb0000000000000000000000009d4970...
```

#### 步骤 3：本地签名

使用 `walletClient.signTransaction()` 对构建好的 EIP-1559 交易进行签名，签名前需确认。

```
🔐 已签名的交易（raw hex）:
   0x02f8b283aa36a7808401ea9ced8477ba52e38289059486e03d015bfb9e9af17e76667fbf659bff...
```

#### 步骤 4：发送到 Sepolia

使用 `publicClient.sendRawTransaction()` 广播已签名的交易，并等待链上确认。

```
✅ 交易已发送！
   Tx Hash: 0xaefd786847c1595c2c69c4f9810663fa7d63880fba41ff7a20fdcf20df3df1e5
   Sepolia Etherscan: https://sepolia.etherscan.io/tx/0xaefd786847c1595c2c69c4f9810663fa7d63880fba41ff7a20fdcf20df3df1e5

🎉 交易已确认！
   区块号:   11299199
   Gas 使用: 30270
   状态:     ✅ 成功
```

---

## 技术细节

| 模块 | Viem API | 说明 |
|------|----------|------|
| 私钥生成 | `generatePrivateKey()` | 生成 32 字节随机私钥 |
| 账户派生 | `privateKeyToAccount()` | 从私钥推导出 EOA 地址 |
| 链上读取 | `createPublicClient()` + `http()` | 只读客户端，查询余额、估算 gas |
| 交易签名 | `createWalletClient()` + `signTransaction()` | 本地私钥签名 EIP-1559 交易 |
| 交易发送 | `sendRawTransaction()` | 广播已签名的原始交易 |
| calldata 编码 | `encodeFunctionData()` | 编码 ERC20 `transfer(to, value)` |
| Fee 估算 | `getFeeHistory()` + `getBlock()` | 计算 EIP-1559 的 maxFee / maxPriorityFee |
| Gas 估算 | `estimateContractGas()` | 估算合约调用的 gas limit |
| 交易确认 | `waitForTransactionReceipt()` | 轮询等待交易上链 |

---

## 典型操作流程

```
1. 选择选项 1 → 生成新私钥（或导入已有私钥）
2. 从 Sepolia 水龙头向生成的地址转入测试 ETH
3. 选择选项 2 → 确认 ETH 和 ERC20 余额
4. 选择选项 3 → 输入转账参数 → 确认签名 → 确认发送
5. 在 Sepolia Etherscan 查看交易详情
```
