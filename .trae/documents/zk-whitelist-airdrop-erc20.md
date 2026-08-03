# 零知识证明白名单空投 ERC20 代币 — 实施计划

## 摘要

在 `contracts/` 目录下，使用 **zk-SNARKs (Groth16)** 实现白名单空投 ERC20 代币功能。用户通过零知识证明证明自己属于白名单（Merkle 树叶子节点），无需暴露具体地址即可领取 ERC20 代币，且每个白名单地址只能领取一次。

## 当前状态分析

- 项目使用 **Foundry** 框架，Solidity `^0.8.30`
- 已有 Merkle 白名单空投实现（`src/airdrop-merkle/`），使用传统 MerkleProof 验证
- 已有 ERC20 代币实现（`MyERC20.sol`、`MyTokenPermit.sol`）
- 依赖：`@openzeppelin/contracts`、`forge-std`
- 测试风格：Foundry `Test`，使用 `vm.prank`、`vm.sign` 等 cheatcode

## 技术方案

### 整体架构

```
circom 电路 → snarkjs 生成证明 → Solidity Verifier 合约 → ZKAirdrop 空投合约
```

1. **Circom 电路**：证明"我知道一个地址，它是某个 Merkle 树的叶子节点"
2. **Verifier 合约**：由 snarkjs 自动生成的 Groth16 验证器
3. **ZKAirdrop 合约**：调用 Verifier 验证证明，发放 ERC20 代币，记录已领取状态

### 电路设计

```circom
// 公共输入：merkleRoot, nullifierHash
// 私有输入：address (叶子), pathElements[], pathIndices[] (Merkle proof)
// 额外私有输入：secret (用于生成 nullifier，防止双花)
```

- `nullifier = hash(secret, address)` — 用于防止同一地址重复领取
- 电路验证 Merkle proof 的正确性
- 输出 `nullifierHash` 作为公共信号，链上用于去重

## 实施步骤

### 步骤 1：安装 circom 和 snarkjs 工具链

- 确认 `circom` 和 `snarkjs` 是否已安装
- 在 `contracts/` 下创建 `circuits/` 目录存放电路文件

### 步骤 2：编写 Circom 电路

- 文件：`contracts/circuits/whitelist.circom`
- 功能：验证 Merkle proof，输出 nullifier hash
- 使用 `circomlib` 的 `Poseidon` hash（gas 友好，适合 Solidity 验证）

### 步骤 3：生成 Verifier 合约

- 使用 `snarkjs` 完成 trusted setup
- 导出 Solidity verifier 合约到 `contracts/src/zk-airdrop/Groth16Verifier.sol`

### 步骤 4：编写 ZKAirdrop 合约

- 文件：`contracts/src/zk-airdrop/ZKAirdrop.sol`
- 功能：
  - 存储 ERC20 代币地址、merkle root、Verifier 地址
  - `claim(amount, nullifierHash, proof[8])` — 验证证明并发放代币
  - `mapping(uint256 => bool) nullifierUsed` — 防止重复领取
  - `setMerkleRoot()` — owner 更新 Merkle 根

### 步骤 5：编写部署脚本

- 文件：`contracts/script/ZKAirdrop.s.sol`
- 部署 Verifier + ZKAirdrop，关联已有的 ERC20 代币

### 步骤 6：编写测试

- 文件：`contracts/test/zk-airdrop/ZKAirdrop.t.sol`
- 测试：成功领取、重复领取失败、无效证明失败、非白名单失败

### 步骤 7：生成测试用的 ZK 证明

- 编写 JS 脚本（`contracts/scripts/generate_proof.js`）用 snarkjs 生成测试证明
- 在 Foundry 测试中通过 `vm.ffi` 或直接使用预计算的证明数据

## 文件清单

| 操作 | 文件路径 |
|------|----------|
| 新建 | `contracts/circuits/whitelist.circom` |
| 新建 | `contracts/src/zk-airdrop/ZKAirdrop.sol` |
| 新建 | `contracts/src/zk-airdrop/Groth16Verifier.sol`（snarkjs 生成） |
| 新建 | `contracts/script/ZKAirdrop.s.sol` |
| 新建 | `contracts/test/zk-airdrop/ZKAirdrop.t.sol` |
| 新建 | `contracts/scripts/generate_proof.js` |

## 关键决策

1. **Hash 函数选择**：使用 Poseidon（而非 keccak256），因为 Poseidon 在 zk 电路中约束数更少，且 snarkjs 可直接生成对应的 Solidity verifier
2. **防双花机制**：使用 nullifier（`hash(secret, address)`）而非直接记录地址，保持隐私性
3. **Merkle 树深度**：固定为 20 层（支持约 100 万白名单地址）
4. **Groth16 vs Plonk**：选择 Groth16，因为证明更紧凑（192 bytes），验证 gas 更低

## 验证步骤

1. `forge build` — 编译通过
2. `forge test` — 所有测试通过
3. 验证场景：
   - 白名单用户成功领取 ERC20
   - 同一 nullifier 无法重复领取
   - 无效 ZK 证明被拒绝
   - 非白名单用户无法领取
