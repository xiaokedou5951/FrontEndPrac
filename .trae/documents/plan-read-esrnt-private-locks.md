# 计划：用 Viem `getStorageAt` 读取 EsRNT 合约 `_locks` 数组

## 目标

使用 Viem 的 `getStorageAt`，绕过合约没有公开 getter 的限制，直接从链上存储槽读取 `esRNT._locks` 数组的全部元素，并打印如下格式：

```
locks[0]: user:0x... ,startTime:...,amount:...
locks[1]: user:0x... ,startTime:...,amount:...
...
```

合约源码：[contracts/src/EsRNT.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/src/EsRNT.sol)
脚本目录：[viem-front/test/read-private-data/](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/test/read-private-data)

## 当前状态分析

### 合约存储布局（关键）

`esRNT` 合约只有一个状态变量 `_locks`（动态数组），位于 **slot 0**：

```solidity
struct LockInfo {
    address user;       // 20 bytes
    uint64  startTime;  // 8  bytes — 与 user 在同一 slot 内打包
    uint256 amount;     // 32 bytes — 单独占一个 slot
}
LockInfo[] private _locks;  // slot 0
```

按 Solidity 存储打包规则，每个 `LockInfo` 占 **2 个 slot**：

| 内容 | 大小 | 在 slot 中的字节位置 |
| --- | --- | --- |
| `user` (address) | 20 B | 高位 20 字节（slot 字节序 0..19） |
| `startTime` (uint64) | 8 B | 紧跟其后的 8 字节（字节序 20..27） |
| `amount` (uint256) | 32 B | 占用下一个完整 slot |

动态数组 `_locks` 的存储规则：
- **slot 0** 存数组长度（构造函数 push 了 11 次，应为 11）
- **数据起始 slot** = `keccak256(abi.encode(0))` = `0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563`（这是个公开常数）
- **元素 i** 的两个 slot：
  - `user/startTime` packed slot = `baseSlot + i * 2`
  - `amount` slot            = `baseSlot + i * 2 + 1`
- slot 算术在 256 位整数域上进行（mod 2²⁵⁶）

### 解码 packed slot

`getStorageAt` 返回 32 字节 hex 字符串。对 `user/startTime` packed slot：

- `user`      = `0x${data.slice(2, 42)}`              （前 20 字节）
- `startTime` = BigInt(`0x${data.slice(42, 58)}`)      （接下来 8 字节）

`amount` slot：整 32 字节直接 `BigInt(data)`。

### 项目现状

- `EsRNT` **不在** [deploy-contracts.sh](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/scripts/deploy-contracts.sh) 中（它只部署 MyERC20/TokenBank/NFTMarket/SimpleNft）。
- `.env.local.example` 中没有 `ESRNT_ADDRESS` 变量。
- 现有脚本风格（参考 [mint-nfts.mjs](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/test/nftmarket/mint-nfts.mjs) / [watch-events.mjs](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/test/nftmarket/watch-events.mjs)）：
  - 顶部 `loadEnvLocal()` 手动解析 `viem-front/.env.local`
  - 配置优先级：CLI 环境变量 > `.env.local` > 代码默认值
  - `createPublicClient` + `foundry` 链（chainId=31337 时）
  - 不需要 walletClient（只读，不签名）
- 现有 Foundry 部署脚本风格（参考 [SimpleNft.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/SimpleNft.s.sol)）：
  - `vm.envUint("PRIVATE_KEY")` + `vm.startBroadcast` + `new Contract()` + `console.log` 地址

## 决策（用户已确认）

1. **部署方式**：新增 `contracts/script/EsRNT.s.sol` 部署脚本，**并把 EsRNT 集成进现有的 [deploy-contracts.sh](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/scripts/deploy-contracts.sh)**（作为第 5 个合约），通过运行 `./scripts/deploy-contracts.sh` 一键完成部署并把地址写入 `viem-front/.env.local` 的 `NEXT_PUBLIC_ESRNT_ADDRESS`。
2. **配置加载**：沿用 `mint-nfts.mjs` 的 `loadEnvLocal` 风格，从 `viem-front/.env.local` 读取 RPC 与合约地址。

## 实施步骤

### 步骤 1：创建 Foundry 部署脚本

**新建文件**：[contracts/script/EsRNT.s.sol](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/contracts/script/EsRNT.s.sol)

完全照搬 `SimpleNft.s.sol` 的模板：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {esRNT} from "../src/EsRNT.sol";

contract EsRNTScript is Script {
    esRNT public esRNT_;

    function run() public returns (esRNT) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        esRNT_ = new esRNT();

        vm.stopBroadcast();

        console.log("esRNT deployed at:", address(esRNT_));
        console.log("Deployer           :", deployer);

        return esRNT_;
    }
}
```

> 注：合约名 `esRNT`（大小写如此，源码即如此），脚本合约用 `EsRNTScript` 避免命名冲突，实例变量用 `esRNT_` 加下划线。

### 步骤 2：把 EsRNT 集成进 deploy-contracts.sh 并一键部署

#### 2.1 修改 [viem-front/scripts/deploy-contracts.sh](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/scripts/deploy-contracts.sh)

复用脚本里现有的 `deploy()` 与 `update_env_var()` 工具函数，做 3 处增量改动：

**(a) 头部注释**：把"一键部署 4 个合约"改为"5 个合约"，在部署顺序列表追加：

```
#   5. esRNT     — 无前置依赖，构造时向 _locks 数组写入 11 条 LockInfo
```

并把用法示例下方说明里"4 个合约"改为"5 个合约"。

**(b) 部署段**（在 `SIMPLE_NFT_ADDRESS=$(deploy SimpleNft)` 之后追加）：

```bash
# 5. esRNT（无构造参数；构造函数内 push 11 条 _locks 数据，供 read-private-data 脚本读取）
ESRNT_ADDRESS=$(deploy EsRNT)
```

> `deploy EsRNT` 会自动跑 `forge script script/EsRNT.s.sol`，并从 `broadcast/EsRNT.s.sol/<chainId>/run-latest.json` 提取地址。EsRNT 无前置依赖，放在最后只是顺序，不影响其他合约。

**(c) 写入 .env.local 段**（在 `update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_SIMPLE_NFT_ADDRESS" ...` 之后追加）：

```bash
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_ESRNT_ADDRESS"  "$ESRNT_ADDRESS"
```

并把汇总段里的 `ok "已写入 4 个合约地址"` 改为 `5 个`，在汇总 printf 表格末尾追加：

```bash
printf  '  %-30s %s\n' "esRNT      (NEXT_PUBLIC_ESRNT_ADDRESS)"     "$ESRNT_ADDRESS"
```

#### 2.2 同步更新 .env.local.example

在 [viem-front/.env.local.example](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/.env.local.example) 的 NFTMarket 相关段之后追加一段（与现有风格一致，含说明注释）：

```
# ----- esRNT 相关 -----

# esRNT 合约地址（用于 read-private-data 测试脚本读取 _locks 私有数组）
NEXT_PUBLIC_ESRNT_ADDRESS=
```

#### 2.3 运行部署

前置：本地 anvil 已启动（`http://127.0.0.1:8545`）。

```bash
cd viem-front
./scripts/deploy-contracts.sh
```

脚本会依次部署 MyERC20 → TokenBank → NFTMarket → SimpleNft → esRNT，自动把 5 个地址写入 `.env.local`，并备份原 `.env.local` 到 `.env.local.bak.<timestamp>`。

> ⚠️ 该脚本会重新部署所有 5 个合约（包括已有的 4 个），导致 MyERC20 / TokenBank 等地址变化，前端需重启 `npm run dev` 才能生效。如果用户只想单独部署 EsRNT 而不动其他合约，可改用 `cd contracts && forge script script/EsRNT.s.sol --rpc-url local --broadcast`，再手动把地址写入 `.env.local`（但默认按本步骤走完整流程）。

### 步骤 3：创建读取脚本

**新建文件**：[viem-front/test/read-private-data/read-locks.mjs](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/viem-front/test/read-private-data/read-locks.mjs)

结构（照搬 `mint-nfts.mjs` 顶部样板）：

```js
// esRNT._locks 私有数据读取脚本 —— 用 viem getStorageAt 直接读存储槽
//
// 运行：
//   node test/read-private-data/read-locks.mjs

import {
  createPublicClient,
  http,
  defineChain,
  keccak256,
  toHex,
} from "viem";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------- loadEnvLocal（与 mint-nfts.mjs 一致，省略） ----------
// ...

// ---------- 配置 ----------
const RPC_URL  = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);
const ESRNT_ADDRESS = (
  process.env.ESRNT_ADDRESS ??
  process.env.NEXT_PUBLIC_ESRNT_ADDRESS ??
  "0x0000000000000000000000000000000000000000" // 占位，无地址时报错退出
);

// ---------- 客户端 ----------
const chain = CHAIN_ID === 31337 ? foundry : defineChain({ /* ... */ });
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

// ---------- 关键：存储槽计算 ----------
const LOCKS_SLOT = 0n;                              // _locks 在合约中的 slot index
const STRUCT_SLOTS_PER_ELEMENT = 2n;                // 每个 LockInfo 占 2 个 slot

// 动态数组数据起始 slot = keccak256(abi.encode(LOCKS_SLOT))
const ARRAY_BASE_SLOT = keccak256(toHex(LOCKS_SLOT, { size: 32 }));

function slotForElement(i) {
  // 返回 32 字节 hex slot（BigInt 算术 mod 2^256）
  const offset = BigInt(i) * STRUCT_SLOTS_PER_ELEMENT;
  const packedSlot    = BigInt(ARRAY_BASE_SLOT) + offset;       // user + startTime
  const amountSlot    = packedSlot + 1n;                        // amount
  return {
    packedSlot:  toHex(packedSlot, { size: 32 }),
    amountSlot:  toHex(amountSlot, { size: 32 }),
  };
}

// ---------- 主流程 ----------
async function main() {
  // 1) 读 slot 0 拿到数组长度
  const lengthHex = await publicClient.getStorageAt({
    address: ESRNT_ADDRESS,
    slot: toHex(LOCKS_SLOT, { size: 32 }),
  });
  const length = BigInt(lengthHex);

  // 2) 逐元素读取并解码
  for (let i = 0n; i < length; i++) {
    const { packedSlot, amountSlot } = slotForElement(i);

    const packedData  = await publicClient.getStorageAt({ address: ESRNT_ADDRESS, slot: packedSlot });
    const amountData  = await publicClient.getStorageAt({ address: ESRNT_ADDRESS, slot: amountSlot });

    // 解码 packed slot：user(20B) + startTime(8B)
    const userHex     = packedData.slice(2, 42);                  // 20 bytes
    const startTimeHex = packedData.slice(42, 58);                // 8 bytes
    const user         = (`0x${userHex}`);                         // address checksum 可选
    const startTime    = BigInt(`0x${startTimeHex}`);
    const amount       = BigInt(amountData);

    console.log(`locks[${i}]: user:${user} ,startTime:${startTime},amount:${amount}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

实现要点：
- `getStorageAt` 的 `slot` 参数接受 hex 字符串，必须是 32 字节定长（用 `toHex(n, { size: 32 })` 生成）。
- `keccak256(toHex(0n, { size: 32 }))` 返回 hex 字符串；转成 `BigInt` 后做加法得到后续 slot，再 `toHex(..., { size: 32 })` 转回。
- `user` 取 packed slot 的前 20 字节（高位在前），`startTime` 取后续 8 字节，这与 Solidity 的存储打包规则一致。
- 数组长度从 slot 0 动态读取（不写死 11），保证脚本在数组变化后仍可用。

### 步骤 4：运行与验证

前置：本地 anvil 已启动（`http://127.0.0.1:8545`），步骤 2 已完成部署。

```bash
cd viem-front
node test/read-private-data/read-locks.mjs
```

预期输出（11 行，user 与构造函数 `address(uint160(i+1))` 一一对应，amount = `1e18*(i+1)`）：

```
locks[0]: user:0x0000000000000000000000000000000000000001 ,startTime:...,amount:1000000000000000000
locks[1]: user:0x0000000000000000000000000000000000000002 ,startTime:...,amount:2000000000000000000
...
locks[10]: user:0x000000000000000000000000000000000000000b ,startTime:...,amount:11000000000000000000
```

校验点：
- `user` 地址依次为 `0x...01` ~ `0x...0b`
- `amount` 依次为 `1e18 * (i+1)`
- `startTime` 满足 `block.timestamp*2 - i` 的递减关系（相邻元素差 1）
- 数组长度 = 11

交叉验证（可选）：用 `cast storage $ESRNT_ADDR 0 --rpc-url local` 应返回 `0x...0b`（=11），与脚本读取的长度一致。

## 假设与决策

- **修改 `deploy-contracts.sh`**：把 EsRNT 作为第 5 个合约集成进现有部署脚本，复用其 `deploy()` / `update_env_var()` / 备份逻辑，避免再造一套并行流程。代价是该脚本会重新部署全部 5 个合约（含已有的 4 个），前端需重启；这是用户明确指定的方式。
- **不创建 README.md**：根据系统约束，除非用户明确要求，不主动创建文档文件。其他 test 子目录虽有 README，但本任务不强制对齐。
- **数组长度动态读取**：不写死 11，从 slot 0 读取长度后再迭代。鲁棒性更好且代码量相当。
- **不使用 walletClient**：只读操作，不需要私钥/签名。
- **金额以 wei 原始值打印**：用户示例即用原始数值（`1e18 * (i+1)`），不格式化为 ether，便于直接对照合约构造逻辑。
- **`startTime` 以原始 uint64 数值打印**：不做日期格式化，便于核对 `block.timestamp*2-i` 的递减关系。

## 验证步骤

1. `cd viem-front && ./scripts/deploy-contracts.sh` 成功部署 5 个合约，末尾汇总表格包含 `esRNT (NEXT_PUBLIC_ESRNT_ADDRESS) 0x...`。
2. `viem-front/.env.local` 中出现 `NEXT_PUBLIC_ESRNT_ADDRESS=0x...`。
3. `cd viem-front && node test/read-private-data/read-locks.mjs` 打印 11 行，格式为 `locks[i]: user:0x... ,startTime:...,amount:...`，且字段值与合约构造函数写入的值一致。
4. `cast storage $ESRNT_ADDR 0 --rpc-url local` 返回 `0x...0b`（=11），与脚本读取的长度一致。
