#!/usr/bin/env node

// ERC20 转账事件索引服务
//
// 用法：
//   node test/erc20-index-tx/start-indexer.cjs
//
// 功能：
//   - 监听 MyERC20 合约的 Transfer 事件
//   - 将转账记录存储到 SQLite 数据库
//   - 支持从指定区块开始回放历史事件

const { createPublicClient, http } = require("viem");
const { foundry } = require("viem/chains");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ========== 加载环境变量 ==========

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  console.log("加载配置:", envPath);
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ========== 配置 ==========

const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 31337);
const FROM_BLOCK = BigInt(process.env.FROM_BLOCK || 0);
const POLLING_INTERVAL = Number(process.env.POLLING_INTERVAL || 2000);

// ========== 检查配置 ==========

if (!TOKEN_ADDRESS) {
  console.error("✗ 错误: 未配置 TOKEN_ADDRESS");
  console.error("  请在 .env.local 中设置 NEXT_PUBLIC_TOKEN_ADDRESS");
  process.exit(1);
}

// ========== 数据库初始化 ==========

const dbPath = path.join(process.cwd(), "transfers.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    value TEXT NOT NULL,
    timestamp INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tx_hash, log_index)
  );

  CREATE INDEX IF NOT EXISTS idx_from_address ON transfers(from_address);
  CREATE INDEX IF NOT EXISTS idx_to_address ON transfers(to_address);
  CREATE INDEX IF NOT EXISTS idx_block_number ON transfers(block_number);

  CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_block_number INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO indexer_state (id, last_block_number) VALUES (1, 0);
`);

// ========== 查询索引进度 ==========

function getLastIndexedBlock() {
  const row = db.prepare("SELECT last_block_number FROM indexer_state WHERE id = 1").get();
  return row?.last_block_number ?? 0;
}

function updateLastIndexedBlock(blockNumber) {
  db.prepare(`
    UPDATE indexer_state
    SET last_block_number = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(blockNumber);
}

// ========== 插入转账记录 ==========

function insertTransfer(transfer) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transfers
      (tx_hash, block_number, log_index, from_address, to_address, value, timestamp)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    transfer.txHash,
    transfer.blockNumber,
    transfer.logIndex,
    transfer.fromAddress,
    transfer.toAddress,
    transfer.value,
    transfer.timestamp
  );
}

// ========== ERC20 ABI ==========

const erc20Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { type: "address", name: "from", indexed: true },
      { type: "address", name: "to", indexed: true },
      { type: "uint256", name: "value", indexed: false },
    ],
    anonymous: false,
  },
];

// ========== 启动索引服务 ==========

console.log("\n========================================");
console.log(" ERC20 转账事件索引服务");
console.log("========================================\n");

console.log("配置信息:");
console.log(`  RPC URL:        ${RPC_URL}`);
console.log(`  Token Address:  ${TOKEN_ADDRESS}`);
console.log(`  Chain ID:       ${CHAIN_ID}`);
console.log(`  Poll Interval:  ${POLLING_INTERVAL}ms\n`);

// 创建 Viem 客户端
const publicClient = createPublicClient({
  chain: CHAIN_ID === 31337 ? foundry : {
    id: CHAIN_ID,
    name: "Custom Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  },
  transport: http(RPC_URL),
  pollingInterval: POLLING_INTERVAL,
});

// 获取上次索引的区块
const lastIndexedBlock = getLastIndexedBlock();
const startBlock = lastIndexedBlock > 0 ? BigInt(lastIndexedBlock) : FROM_BLOCK;

console.log(`索引起始区块: ${startBlock}\n`);

// 统计信息
let stats = {
  total: 0,
  startTime: Date.now(),
};

// 启动事件监听
console.log("✓ 启动事件监听...");
console.log("✓ 索引服务运行中，按 Ctrl+C 停止\n");

const unwatch = publicClient.watchEvent({
  address: TOKEN_ADDRESS,
  events: erc20Abi,
  fromBlock: startBlock,
  pollingInterval: POLLING_INTERVAL,
  onLogs: (logs) => {
    try {
      for (const log of logs) {
        if (log.eventName === "Transfer") {
          insertTransfer({
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
            logIndex: log.logIndex,
            fromAddress: log.args.from,
            toAddress: log.args.to,
            value: log.args.value.toString(),
            timestamp: null,
          });

          stats.total++;
          console.log(
            `[${new Date().toISOString().slice(11, 19)}] Transfer #${stats.total}: ` +
            `block=${log.blockNumber} ` +
            `from=${log.args.from.slice(0, 10)}... ` +
            `to=${log.args.to.slice(0, 10)}...`
          );
        }
      }

      // 更新索引进度
      if (logs.length > 0) {
        const maxBlock = Math.max(...logs.map((l) => Number(l.blockNumber)));
        updateLastIndexedBlock(maxBlock);
      }
    } catch (error) {
      console.error("处理日志时出错:", error);
    }
  },
  onError: (error) => {
    console.error("索引服务错误:", error);
  },
});

// 优雅退出
process.on("SIGINT", () => {
  console.log("\n\n正在停止索引服务...");
  unwatch();
  db.close();

  const elapsed = Math.floor((Date.now() - stats.startTime) / 1000);
  console.log("\n========================================");
  console.log(" 索引服务已停止");
  console.log("========================================");
  console.log(`  运行时间:       ${elapsed}秒`);
  console.log(`  索引记录数:     ${stats.total}条`);
  console.log(`  最后索引区块:   ${getLastIndexedBlock()}\n`);

  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n收到终止信号，正在停止...");
  unwatch();
  db.close();
  process.exit(0);
});