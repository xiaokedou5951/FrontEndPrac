// esRNT._locks 私有数据读取脚本 —— 用 viem getStorageAt 直接读存储槽
//
// 运行：
//   node test/read-private-data/read-locks.mjs
//
// 通过环境变量覆盖默认值（见文末 README）：
//   ESRNT_ADDRESS=0x... node test/read-private-data/read-locks.mjs

import {
  createPublicClient,
  http,
  defineChain,
  keccak256,
  toHex,
  getAddress,
} from "viem";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------- 加载 .env.local（与前端共用一份配置） ----------
// Node 不会自动加载 .env.local（那是 Next.js 的能力），这里手动解析。
// 已存在的 process.env 优先（CLI 覆盖文件）。

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envLocalPath = path.resolve(__dirname, "../../.env.local");

function loadEnvLocal(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return; // 文件不存在则跳过，回退到代码内默认值
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去掉两端配对的引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal(envLocalPath);

// ---------- 配置（环境变量 -> 默认值） ----------

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

// esRNT 合约地址：优先 NEXT_PUBLIC_ESRNT_ADDRESS（与前端共用）
const ESRNT_ADDRESS_RAW =
  process.env.ESRNT_ADDRESS ??
  process.env.NEXT_PUBLIC_ESRNT_ADDRESS ??
  "";

// ---------- 客户端 ----------

const chain =
  CHAIN_ID === 31337
    ? foundry
    : defineChain({
        id: CHAIN_ID,
        name: "Custom Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
        testnet: true,
      });

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

// ---------- 关键：存储槽计算 ----------
// esRNT 合约存储布局：
//   slot 0: _locks 数组长度（动态数组本身存长度）
//   数据起始 slot = keccak256(abi.encode(0))（动态数组元素存放处）
//   每个 LockInfo 占 2 个 slot：
//     slot 0 (packed): address user (20B) + uint64 startTime (8B)
//     slot 1         : uint256 amount (32B, 独占)
//
// Solidity 打包规则：第一项「低位对齐」（slot 的最右侧/低地址端），
// 后续项向左排列。因此 packed slot 的 32 字节布局为：
//   bytes  0..3   (4 B)  : 未使用
//   bytes  4..11  (8 B)  : uint64 startTime
//   bytes 12..31  (20 B) : address user
// 元素 i 的 slot = baseSlot + i * 2 (+0 是 packed, +1 是 amount)

const LOCKS_SLOT = 0n;                   // _locks 在合约中的 slot index
const SLOTS_PER_ELEMENT = 2n;            // 每个 LockInfo 占 2 个 slot

// 动态数组数据起始 slot = keccak256(abi.encode(LOCKS_SLOT))
const ARRAY_BASE_SLOT = BigInt(
  keccak256(toHex(LOCKS_SLOT, { size: 32 })),
);

function slotToHex(slotBigInt) {
  return toHex(slotBigInt, { size: 32 });
}

function slotForElement(i) {
  const offset = BigInt(i) * SLOTS_PER_ELEMENT;
  const packedSlot = ARRAY_BASE_SLOT + offset;        // user + startTime
  const amountSlot = packedSlot + 1n;                 // amount
  return {
    packedSlot: slotToHex(packedSlot),
    amountSlot: slotToHex(amountSlot),
  };
}

// ---------- 主流程 ----------

async function main() {
  if (!ESRNT_ADDRESS_RAW) {
    console.error(
      "✗ 未配置 esRNT 合约地址。请在 .env.local 中设置 NEXT_PUBLIC_ESRNT_ADDRESS，\n" +
        "  或通过环境变量传入：ESRNT_ADDRESS=0x... node test/read-private-data/read-locks.mjs",
    );
    process.exit(1);
  }

  const ESRNT_ADDRESS = getAddress(ESRNT_ADDRESS_RAW);

  console.log("\n========================================");
  console.log(" esRNT._locks 私有数据读取 (getStorageAt)");
  console.log("========================================");

  console.log("\n— 配置 —");
  console.log(`  RPC           ${RPC_URL}`);
  console.log(`  Chain ID      ${chain.id}`);
  console.log(`  esRNT         ${ESRNT_ADDRESS}`);
  console.log(`  _locks slot   ${LOCKS_SLOT}`);
  console.log(`  base slot     ${slotToHex(ARRAY_BASE_SLOT)}`);

  // 1) 读 slot 0 拿到数组长度
  const lengthHex = await publicClient.getStorageAt({
    address: ESRNT_ADDRESS,
    slot: slotToHex(LOCKS_SLOT),
  });
  const length = BigInt(lengthHex);
  console.log(`  array length  ${length}`);

  if (length === 0n) {
    console.log("\n  ⚠️  数组为空，没有可读取的元素。");
    return;
  }

  // 2) 逐元素读取并解码
  console.log("\n— _locks 元素 —");
  for (let i = 0n; i < length; i++) {
    const { packedSlot, amountSlot } = slotForElement(i);

    const packedData = await publicClient.getStorageAt({
      address: ESRNT_ADDRESS,
      slot: packedSlot,
    });
    const amountData = await publicClient.getStorageAt({
      address: ESRNT_ADDRESS,
      slot: amountSlot,
    });

    // 解码 packed slot（32 字节，低位对齐打包）：
    //   bytes  0..3   (4 B)  : 未使用
    //   bytes  4..11  (8 B)  : uint64 startTime
    //   bytes 12..31  (20 B) : address user
    // packedData 形如 0x<64 hex chars>，按字符索引（含 "0x" 前缀）：
    //   user      = chars 26..66 (最后 40 hex = 20 B)
    //   startTime = chars 10..26 (中间 16 hex = 8 B)
    const userHex = packedData.slice(26, 66); // 20 bytes (rightmost)
    const startTimeHex = packedData.slice(10, 26); // 8 bytes
    const user = getAddress(`0x${userHex}`);
    const startTime = BigInt(`0x${startTimeHex}`);
    const amount = BigInt(amountData);

    console.log(
      `locks[${i}]: user:${user} ,startTime:${startTime},amount:${amount}`,
    );
  }
}

main().catch((err) => {
  console.error("\n✗ 脚本失败:");
  console.error(err);
  process.exit(1);
});
