# 读取私有数据测试 — esRNT._locks

本目录用于测试用 Viem 的 `getStorageAt` 直接读取合约的私有状态变量，绕过合约没有公开 getter 的限制。

## 测试目标

[esRNT](../../../contracts/src/EsRNT.sol) 合约的 `_locks` 数组是 `private` 的，外部无法通过 getter 访问：

```solidity
contract esRNT {
    struct LockInfo{
        address user;
        uint64 startTime; 
        uint256 amount;
    }
    LockInfo[] private _locks;   // ← private，但链上存储是公开的

    constructor() { 
        for (uint256 i = 0; i < 11; i++) {
            _locks.push(LockInfo(address(uint160(i+1)), uint64(block.timestamp*2-i), 1e18*(i+1)));
        }
    }
}
```

EVM 存储槽本身对所有读取者是公开的，`private` 只是编译器层面的访问控制。本脚本通过 `getStorageAt` 直接按存储槽读取，把 11 条 `LockInfo` 全部还原出来，并打印为：

```
locks[i]: user:0x... ,startTime:...,amount:...
```

## 测试环境

| 项目 | 值 |
| --- | --- |
| 前端项目 | `viem-front`（Next.js 15 + Viem v2） |
| 链 | 本地 Foundry / Anvil（Chain ID `31337`） |
| RPC | `http://127.0.0.1:8545` |
| 合约 | `esRNT`（[contracts/src/EsRNT.sol](../../../contracts/src/EsRNT.sol)） |
| 合约地址 | `NEXT_PUBLIC_ESRNT_ADDRESS`（见 [`viem-front/.env.local`](../../.env.local)） |
| 部署脚本 | [contracts/script/EsRNT.s.sol](../../../contracts/script/EsRNT.s.sol) |
| 部署入口 | [viem-front/scripts/deploy-contracts.sh](../../scripts/deploy-contracts.sh)（5 个合约一键部署） |

## 快速开始

```bash
cd viem-front

# 1. 启动本地 anvil（另开一个终端）
anvil

# 2. 部署合约（包含 esRNT，自动写入 .env.local）
./scripts/deploy-contracts.sh

# 3. 读取 _locks 数组
node test/read-private-data/read-locks.mjs
```

预期输出（11 行，`user` 依次为 `0x...01`~`0x...0b`，`startTime` 递减 1，`amount` = `1e18*(i+1)`）：

```
========================================
 esRNT._locks 私有数据读取 (getStorageAt)
========================================

— 配置 —
  RPC           http://127.0.0.1:8545
  Chain ID      31337
  esRNT         0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  _locks slot   0
  base slot     0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563
  array length  11

— _locks 元素 —
locks[0]: user:0x0000000000000000000000000000000000000001 ,startTime:3570997938,amount:1000000000000000000
locks[1]: user:0x0000000000000000000000000000000000000002 ,startTime:3570997937,amount:2000000000000000000
locks[2]: user:0x0000000000000000000000000000000000000003 ,startTime:3570997936,amount:3000000000000000000
...
locks[10]: user:0x000000000000000000000000000000000000000b ,startTime:3570997928,amount:11000000000000000000
```

## 配置来源

脚本会自动加载 [`viem-front/.env.local`](../../.env.local)（与前端共用同一份配置），优先级：

```
CLI 环境变量  >  .env.local  >  代码内默认值
```

| 变量 | `.env.local` 中的键 | 默认值（无文件时） |
| --- | --- | --- |
| `ESRNT_ADDRESS` | `NEXT_PUBLIC_ESRNT_ADDRESS` | 无（必须配置，否则报错退出） |
| `RPC_URL` | `NEXT_PUBLIC_RPC_URL` | `http://127.0.0.1:8545` |
| `CHAIN_ID` | `NEXT_PUBLIC_CHAIN_ID` | `31337` |

例如使用临时地址而不修改 `.env.local`：

```bash
ESRNT_ADDRESS=0x... node test/read-private-data/read-locks.mjs
```

## 技术细节：存储布局与槽计算

这是本测试的核心。要正确读取 `_locks`，需要算对三件事：数组长度所在槽、元素数据起始槽、每个元素的内部字段偏移。

### 1. 数组长度所在槽

`_locks` 是合约中第 0 个状态变量，所以它的「槽索引」是 `0`。Solidity 中，动态数组的**长度**直接存在这个槽里：

```
slot 0  →  _locks.length  (= 11)
```

### 2. 元素数据起始槽

动态数组的**元素数据**不跟长度存在一起，而是存在另一个地方：`keccak256(abi.encode(slotIndex))`。

对 `_locks`（slotIndex = 0）：

```
baseSlot = keccak256(0x0000...0000)  // 32 字节全 0
        = 0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563
```

这是个公开常数，所有 slot 0 上的动态数组都从这开始。

### 3. 每个元素占几个槽

`LockInfo` 结构体有 3 个字段，按 Solidity 打包规则：

| 字段 | 类型 | 大小 | 是否能跟前面打包 |
| --- | --- | --- | --- |
| `user` | `address` | 20 B | 第一个，无前驱 |
| `startTime` | `uint64` | 8 B | 20 + 8 = 28 ≤ 32，可与 `user` 同槽 |
| `amount` | `uint256` | 32 B | 28 + 32 > 32，必须新开一槽 |

所以每个 `LockInfo` 占 **2 个槽**：

- 槽 0（packed）：`user` + `startTime` 共占 28 B，剩 4 B 闲置
- 槽 1：`amount` 独占 32 B

### 4. 元素 i 的两个槽

```
element[i].packedSlot  = baseSlot + i * 2       // user + startTime
element[i].amountSlot  = baseSlot + i * 2 + 1   // amount
```

槽算术在 256 位整数域上进行（mod 2²⁵⁶）。

### 5. packed 槽内的字节布局（关键坑点）

Solidity 打包规则：**第一项低位对齐**（slot 的最右侧/低地址端），后续项向左排列。

所以 packed 槽的 32 字节布局是：

```
字节位置:  0 .. 3  |   4 .. 11    |  12 .. 31
内容:      未使用   |  startTime   |   user
字节数:     4 B    |     8 B      |    20 B
```

> ⚠️ 这是实现时最容易踩的坑：直觉上以为「声明顺序 = 高位到低位」，但实际上 Solidity 是「第一项在最右侧（低位）」。

### 6. 从 hex 字符串切片解码

`getStorageAt` 返回形如 `0x` + 64 个 hex 字符（32 字节）。每个字节 = 2 个 hex 字符。

```
packedData = "0x" + <8 hex 未使用> + <16 hex startTime> + <40 hex user>
              0x    chars 2..9        chars 10..25         chars 26..65
```

代码中的切片（[read-locks.mjs#L181-L182](./read-locks.mjs#L181-L182)）：

```js
const userHex      = packedData.slice(26, 66); // 最后 40 hex = 20 B
const startTimeHex = packedData.slice(10, 26); // 中间 16 hex = 8 B
```

## 用 cast storage 交叉验证

调试时用 `cast storage` 直接看原始 32 字节，是确认布局的最快方式：

```bash
ESRNT=$(grep NEXT_PUBLIC_ESRNT_ADDRESS ../../.env.local | cut -d= -f2)

# 1) 数组长度（slot 0）→ 0x...0b = 11
cast storage $ESRNT 0 --rpc-url http://127.0.0.1:8545

# 2) element 0 的 packed slot
cast storage $ESRNT 0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563 \
  --rpc-url http://127.0.0.1:8545
# 输出: 0x0000000000000000d4d91ab20000000000000000000000000000000000000001
#       ├──── 未使用 ────┤├──── startTime ────┤├──────── user ─────────────┤

# 3) element 0 的 amount slot
cast storage $ESRNT 0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e564 \
  --rpc-url http://127.0.0.1:8545
# 输出: 0x0000000000000000000000000000000000000000000000000de0b6b3a7640000  (= 1e18)
```

`cast storage` 与 `getStorageAt` 完全等价，都发 `eth_getStorageAt` JSON-RPC。前者是 CLI（调试用），后者是程序化（脚本用）。

## 涉及的 Viem API

| 模块 | API | 说明 |
| --- | --- | --- |
| 公共客户端 | `createPublicClient()` + `http()` | 只读客户端，不需要 walletClient |
| 链定义 | `foundry` / `defineChain()` | Chain ID 31337 时直接用内置 foundry |
| 读存储 | `publicClient.getStorageAt({ address, slot })` | 返回 32 字节 hex 字符串 |
| 哈希 | `keccak256(toHex(n, { size: 32 }))` | 计算动态数组数据起始槽 |
| 整数转换 | `toHex(n, { size: 32 })` / `BigInt(hex)` | slot 算术与解码 |
| 地址校验 | `getAddress(hex)` | 把裸 hex 转成 EIP-55 checksum 地址 |

## 验证要点

读取完成后，对照合约构造函数的写入逻辑核验：

| 字段 | 期望值 | 推导 |
| --- | --- | --- |
| `user` | `0x...01` ~ `0x...0b` | `address(uint160(i+1))` |
| `startTime` | 从 `block.timestamp*2` 开始，每次递减 1 | `uint64(block.timestamp*2 - i)` |
| `amount` | `1e18, 2e18, ..., 11e18` | `1e18 * (i+1)` |
| 数组长度 | `11` | 构造函数循环 11 次 |

## 常见问题

### 1. 报错：未配置 esRNT 合约地址

```
✗ 未配置 esRNT 合约地址。请在 .env.local 中设置 NEXT_PUBLIC_ESRNT_ADDRESS，...
```

**原因**：`.env.local` 里没有 `NEXT_PUBLIC_ESRNT_ADDRESS`。

**解决**：先跑 `./scripts/deploy-contracts.sh` 部署合约；或临时用环境变量传入：

```bash
ESRNT_ADDRESS=0x... node test/read-private-data/read-locks.mjs
```

### 2. 报错：无法连接 RPC 节点

**原因**：anvil 未启动。

**解决**：另开终端跑 `anvil`，确认 `cast chain-id --rpc-url http://127.0.0.1:8545` 能返回 `31337`。

### 3. 读出来的 user / startTime 是乱的

**原因**：packed 槽的字节切片位置算错了。Solidity 是「第一项低位对齐」，不是「第一项高位对齐」。

**对照**：用 `cast storage` 直接看原始 hex，对照 [技术细节第 5 节](#5-packed-槽内的字节布局关键坑点) 的字节布局图核验。

### 4. 读出来的全是 0

**可能原因**：

- 合约地址错了（指向了一个空合约 / EOA）
- slot 算错了（baseSlot 用了错的 slotIndex）
- 合约没部署成功（构造函数 revert 了）

**排查**：先 `cast storage $ESRNT 0` 看长度槽，如果不是 `0x...0b` 说明合约本身有问题。

## 相关文件

- 合约源码：[contracts/src/EsRNT.sol](../../../contracts/src/EsRNT.sol)
- 部署脚本：[contracts/script/EsRNT.s.sol](../../../contracts/script/EsRNT.s.sol)
- 一键部署入口：[viem-front/scripts/deploy-contracts.sh](../../scripts/deploy-contracts.sh)
- 读取脚本：[read-locks.mjs](./read-locks.mjs)
- 环境变量样例：[viem-front/.env.local.example](../../.env.local.example)

## 扩展阅读

- [Solidity Storage Layout 官方文档](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- [Viem `getStorageAt` API](https://viem.sh/docs/actions/public/getStorageAt)
- [Foundry Cast Storage 命令](https://book.getfoundry.sh/reference/cast/cast-storage)
- [EVM Storage 槽布局详解](https://programtheblockchain.com/posts/2018/03/09/understanding-ethereum-smart-contract-storage/)
