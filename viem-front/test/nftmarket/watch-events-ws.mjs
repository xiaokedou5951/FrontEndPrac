// NFTMarket 事件监听脚本 (WebSocket 版) —— 通过 eth_subscribe 实时推送上架 / 购买 / 取消事件
//
// 运行：
//   node test/nftmarket/watch-events-ws.mjs
//
// 与 watch-events.mjs (HTTP 轮询版) 的区别：
//   - transport 用 webSocket()，watchEvent 自动走 eth_subscribe 推送，无轮询延迟
//   - 无 pollingInterval，事件入块即到达
//   - 内置心跳检测，仅在连接状态变化时打印日志
//   - fromBlock 仍用于回放历史（viem 会先 eth_getLogs 回放，再 eth_subscribe 实时订阅）
//
// 按 Ctrl+C 退出并打印汇总。

import {
  createPublicClient,
  webSocket,
  parseAbi,
  formatUnits,
  defineChain,
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

const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

// WebSocket 端点：优先 NEXT_PUBLIC_WS_URL（与前端共用）
const WS_URL =
  process.env.WS_URL ??
  process.env.NEXT_PUBLIC_WS_URL ??
  "ws://127.0.0.1:8545";

const NFT_MARKET_ADDRESS =
  process.env.NFT_MARKET_ADDRESS ??
  process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS ??
  "0xf5059a5D33d5853360D16C683c16e67980206f36";

// 从哪个块开始回放历史事件（0 = 从创世块回放全部）
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK ?? 0);

// 心跳间隔（ms），仅用于检测连接状态变化
const HEARTBEAT_INTERVAL = Number(process.env.HEARTBEAT_INTERVAL ?? 15_000);

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
        rpcUrls: { default: { http: [WS_URL] } },
        testnet: true,
      });

const publicClient = createPublicClient({
  chain,
  transport: webSocket(WS_URL, {
    reconnect: true,
    retryCount: 5,
    retryDelay: 2000,
  }),
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
  return new Date().toISOString().slice(11, 19);
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

// ---------- 心跳：仅在连接状态变化时打印 ----------

let connState = "connecting";
let heartbeatTimer = null;

function setConnState(state) {
  if (state === connState) return;
  const prev = connState;
  connState = state;
  if (state === "connected") {
    console.log(`${C.green}✓ WebSocket 连接已建立${C.reset}`);
  } else if (state === "disconnected") {
    console.log(`${C.red}⚠️ WebSocket 连接异常，等待自动重连...${C.reset}`);
  } else if (state === "reconnected" && prev === "disconnected") {
    console.log(`${C.green}✓ WebSocket 连接已恢复${C.reset}`);
  }
}

function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    try {
      await publicClient.getBlockNumber();
      if (connState === "disconnected") setConnState("reconnected");
      else if (connState !== "reconnected") setConnState("connected");
    } catch {
      setConnState("disconnected");
    }
  }, HEARTBEAT_INTERVAL);
}

// ---------- 主流程 ----------

async function main() {
  console.log("\n========================================");
  console.log(" NFTMarket 事件监听 (WebSocket)");
  console.log("========================================");

  // 首次请求验证 WS 连接
  let currentBlock;
  try {
    currentBlock = await publicClient.getBlockNumber();
    setConnState("connected");
  } catch (err) {
    console.log(`${C.red}✗ WebSocket 连接失败: ${err.message}${C.reset}`);
    console.log(`  请确认 anvil 正在运行且 WS 端点可用: ${WS_URL}`);
    console.log(`  (anvil 默认在 8545 端口复用 HTTP+WS)`);
    process.exit(1);
  }

  console.log("\n— 配置 —");
  console.log(`  WebSocket        ${WS_URL}`);
  console.log(`  Chain ID         ${chain.id}`);
  console.log(`  NFTMarket        ${NFT_MARKET_ADDRESS}`);
  console.log(`  Transport        eth_subscribe (push)`);
  console.log(`  回放起始块       ${FROM_BLOCK}`);
  console.log(`  当前块高         ${currentBlock}`);
  console.log(`  心跳间隔         ${HEARTBEAT_INTERVAL}ms`);

  const range = currentBlock >= FROM_BLOCK ? Number(currentBlock - FROM_BLOCK) + 1 : 0;
  console.log(`  ${C.dim}即将回放 ${range} 个块的历史事件，然后通过 eth_subscribe 实时订阅...${C.reset}\n`);

  // watchEvent 在 webSocket transport 下：先 eth_getLogs 回放 [fromBlock, latest]，
  // 再 eth_subscribe "logs" 订阅新块事件，全程推送无轮询。
  const unwatch = publicClient.watchEvent({
    address: NFT_MARKET_ADDRESS,
    events: nftMarketAbi,
    fromBlock: FROM_BLOCK,
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
      console.error(`${C.red}订阅出错:${C.reset}`, err?.message ?? err);
    },
  });

  console.log(`${C.green}✓ 实时订阅已启动，按 Ctrl+C 退出${C.reset}\n`);

  startHeartbeat();

  process.on("SIGINT", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const elapsed = Math.floor((Date.now() - stats.startedAt) / 1000);
    console.log(`\n\n${C.bold}— 汇总 —${C.reset}`);
    console.log(`  运行时长          ${elapsed}s`);
    console.log(`  ${C.green}NFTListed${C.reset}           ${stats.NFTListed}`);
    console.log(`  ${C.magenta}NFTSold${C.reset}             ${stats.NFTSold}`);
    console.log(`  ${C.yellow}NFTListingCancelled${C.reset} ${stats.NFTListingCancelled}`);
    unwatch();
    console.log(`\n${C.dim}已取消订阅，退出。${C.reset}`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`${C.red}\n✗ 启动失败:${C.reset}`, err);
  process.exit(1);
});
