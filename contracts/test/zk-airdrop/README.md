# ZKAirdrop 测试说明

## 概述

本目录包含 `ZKAirdrop` 合约的 Foundry 测试套件，覆盖基于零知识证明的 ERC20 白名单空投合约的核心功能。

测试文件：`ZKAirdrop.t.sol`

## 测试架构

```
ZKAirdropTest (Foundry Test)
├── 依赖合约
│   ├── ZKAirdrop       - 空投主合约
│   ├── Groth16Verifier - ZK 证明验证器（由 snarkjs 生成）
│   └── MyERC20         - 测试用 ERC20 代币
└── 测试账户
    ├── owner  (address(0x1)) - 合约所有者
    ├── user1  (address(0x2)) - 白名单用户
    └── user2  (address(0x3)) - 其他用户
```

## 测试常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `AIRDROP_AMOUNT` | `100 * 10^18` | 每次空投数量（100 代币） |
| `MERKLE_ROOT` | `180864253473...6355709` | 由 `generate_proof.js` 生成的真实 Merkle 根 |

## 测试用例

### 1. 初始状态测试

| 测试函数 | 说明 |
|---------|------|
| `test_initial_state` | 验证部署后 token、verifier、merkleRoot、airdropAmount、owner 等状态正确 |
| `test_constructor_validates_inputs` | 验证构造函数对零地址和无效参数的检查 |

### 2. 权限控制测试

| 测试函数 | 说明 |
|---------|------|
| `test_set_merkle_root` | owner 可以更新 Merkle 根 |
| `test_set_merkle_root_only_owner` | 非 owner 无法更新 Merkle 根 |
| `test_set_airdrop_amount` | owner 可以更新空投数量 |
| `test_set_airdrop_amount_only_owner` | 非 owner 无法更新空投数量 |
| `test_withdraw_tokens` | owner 可以提取合约代币 |
| `test_withdraw_tokens_only_owner` | 非 owner 无法提取代币 |

### 3. 核心领取逻辑测试

| 测试函数 | 说明 |
|---------|------|
| `test_claim_with_valid_proof` | 使用真实 ZK 证明成功领取代币，验证余额增加和 nullifier 标记 |
| `test_claim_with_invalid_proof` | 无效证明被拒绝，交易回滚 |
| `test_nullifier_prevents_double_claim` | 无效证明无法通过 nullifier 检查 |
| `test_claim_prevents_double_claim_with_same_nullifier` | 同一 nullifier 不可重复领取 |

## 运行测试

```bash
# 运行所有测试
forge test --match-path test/zk-airdrop/ZKAirdrop.t.sol

# 显示详细输出
forge test --match-path test/zk-airdrop/ZKAirdrop.t.sol -vv

# 仅运行特定测试
forge test --match-test test_claim_with_valid_proof -vv
```

## 前置条件

运行测试前，需要先生成 ZK 证明数据：

```bash
# 1. 编译电路并生成验证密钥
bash scripts/compile_circuit.sh

# 2. 生成证明和 calldata
node scripts/generate_proof.js
```

生成的 `calldata.json` 中的证明数据已硬编码在测试文件中。若重新生成证明，需同步更新测试中的常量值（`MERKLE_ROOT`、`nullifierHash`、`pA`、`pB`、`pC`）。

## 测试流程

```
setUp()
  ├── 部署 MyERC20 代币
  ├── 部署 Groth16Verifier
  ├── 部署 ZKAirdrop（传入 verifier、token、merkleRoot、airdropAmount）
  └── 向 airdrop 合约转入 10000 代币

test_claim_with_valid_proof()
  ├── 使用预生成的真实证明数据构造 claim 参数
  ├── 以 user1 身份调用 claim()
  ├── 验证 user1 余额增加 AIRDROP_AMOUNT
  └── 验证 nullifierUsed[nullifierHash] == true

test_claim_prevents_double_claim_with_same_nullifier()
  ├── 第一次 claim 成功
  └── 第二次使用相同 nullifier 被拒绝（revert: "nullifier already used"）
```
