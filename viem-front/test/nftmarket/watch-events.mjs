// NFTMarket 事件监听脚本 —— 后台监听上架 / 购买 / 取消事件并打印日志
//
// 运行：
//   node test/nftmarket/watch-events.mjs
//
// 按 Ctrl+C 退出并打印汇总。监听期间可在前端页面或用 cast 触发上架 / 购买，
// 脚本会实时打印对应事件。

import {
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  defineChain,
  getAbiItem,
  decodeEventLog,
} from "viem";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------- 加载 .env.local（与前端共用配置） ----------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envLocalPath = path.resolve(__dirname, "../../.env.local");

function loadEnvLocal(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
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

// ---------- 配置 ----------

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

const NFT_MARKET_ADDRESS = (
  process.env.NFT_MARKET_ADDRESS ??
  process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS ??
  "0xf5059a5D33d5853360D16C683c16e67980206f36"
);

// 从哪个块开始回放历史事件（0 = 从创世块回放全部）
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK ?? 0);

// 轮询间隔（ms），本地 anvil 可以快一点
const POLLING_INTERVAL = Number(process.env.POLLING_INTERVAL ?? 1000);

// 支付代币精度（MyERC20 = 18）
const PAYMENT_DECIMALS = Number(process.env.PAYMENT_DECIMALS ?? 18);

// ---------- 事件 ABI ----------

const nftMarketAbi = parseAbi([
  "event NFTListed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price)",
  "event NFTSold(uint256 indexed listingId, address indexed buyer, address indexed seller, address nftContract, uint256 tokenId, uint256 price)",
  "event NFTListingCancelled(uint256 indexed listingId)",
]);

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
  pollingInterval: POLLING_INTERVAL,
});

// ---------- 颜色与格式化 ----------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const EVENT_STYLE = {
  NFTListed: { color: C.green, tag: "LISTED", label: "上架" },
  NFTSold: { color: C.magenta, tag: "SOLD  ", label: "售出" },
  NFTListingCancelled: { color: C.yellow, tag: "CANCEL", label: "取消" },
};

function short(addr) {
  if (!addr) return "0x0000...0000";
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function fmtPrice(price) {
  return `${formatUnits(price, PAYMENT_DECIMALS)} TOKEN`;
}

function ts() {
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

// ---------- 事件计数 ----------

const stats = {
  NFTListed: 0,
  NFTSold: 0,
  NFTListingCancelled: 0,
  startedAt: Date.now(),
};

// ---------- 打印单条事件 ----------

function printLog(log) {
  const { eventName, args, blockNumber, transactionHash, logIndex } = log;
  const style = EVENT_STYLE[eventName] ?? { color: C.cyan, tag: "??????", label: "未知" };

  let detail = "";
  if (eventName === "NFTListed") {
    detail =
      `listingId=${args.listingId}  seller=${short(args.seller)}  ` +
      `nft=${short(args.nftContract)}  tokenId=${args.tokenId}  price=${fmtPrice(args.price)}`;
  } else if (eventName === "NFTSold") {
    detail =
      `listingId=${args.listingId}  buyer=${short(args.buyer)}  seller=${short(args.seller)}  ` +
      `nft=${short(args.nftContract)}  tokenId=${args.tokenId}  price=${fmtPrice(args.price)}`;
  } else if (eventName === "NFTListingCancelled") {
    detail = `listingId=${args.listingId}`;
  } else {
    detail = JSON.stringify(args, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  }

  stats[eventName] = (stats[eventName] ?? 0) + 1;

  console.log(
    `${C.dim}${ts()}${C.reset} ` +
      `${style.color}${C.bold}[${style.tag}]${C.reset} ` +
      `${C.dim}block=${blockNumber} logIdx=${logIndex}${C.reset}\n` +
      `         ${detail}\n` +
      `         ${C.dim}tx=${transactionHash}${C.reset}`,
  );
}

// ---------- 主流程 ----------

async function main() {
  console.log("\n========================================");
  console.log(" NFTMarket 事件监听");
  console.log("========================================");

  const currentBlock = await publicClient.getBlockNumber();

  console.log("\n— 配置 —");
  console.log(`  RPC              ${RPC_URL}`);
  console.log(`  Chain ID         ${chain.id}`);
  console.log(`  NFTMarket        ${NFT_MARKET_ADDRESS}`);
  console.log(`  回放起始块       ${FROM_BLOCK}`);
  console.log(`  当前块高         ${currentBlock}`);
  console.log(`  轮询间隔         ${POLLING_INTERVAL}ms`);
  console.log(`  代币精度         ${PAYMENT_DECIMALS}`);

  const range = currentBlock >= FROM_BLOCK ? Number(currentBlock - FROM_BLOCK) + 1 : 0;
  console.log(`  ${C.dim}即将回放 ${range} 个块的历史事件，然后进入实时监听...${C.reset}\n`);

  // watchEvent 设置 fromBlock 后，viem 会在首次轮询时回放 [fromBlock, latest] 的历史日志，
  // 之后自动切换为实时监听新模式下的块。onLogs 批量回调。
  const unwatch = publicClient.watchEvent({
    address: NFT_MARKET_ADDRESS,
    events: nftMarketAbi,
    fromBlock: FROM_BLOCK,
    pollingInterval: POLLING_INTERVAL,
    onLogs: (logs) => {
      for (const log of logs) {
        try {
          printLog(log);
        } catch (err) {
          console.error(`${C.red}解析日志失败:${C.reset}`, err, log);
        }
      }
    },
    onError: (err) => {
      console.error(`${C.red}监听出错:${C.reset}`, err);
    },
  });

  console.log(`${C.green}✓ 监听已启动，按 Ctrl+C 退出${C.reset}\n`);

  // 优雅退出
  process.on("SIGINT", () => {
    const elapsed = Math.floor((Date.now() - stats.startedAt) / 1000);
    console.log(`\n\n${C.bold}— 汇总 —${C.reset}`);
    console.log(`  运行时长          ${elapsed}s`);
    console.log(`  ${C.green}NFTListed${C.reset}           ${stats.NFTListed}`);
    console.log(`  ${C.magenta}NFTSold${C.reset}             ${stats.NFTSold}`);
    console.log(`  ${C.yellow}NFTListingCancelled${C.reset} ${stats.NFTListingCancelled}`);
    unwatch();
    console.log(`\n${C.dim}已停止监听。${C.reset}`);
    process.exit(0);
  });

  // watchEvent 内部有定时器，会保持事件循环活跃；这里无需额外 setInterval。
}

main().catch((err) => {
  console.error(`${C.red}\n✗ 启动失败:${C.reset}`, err);
  process.exit(1);
});
