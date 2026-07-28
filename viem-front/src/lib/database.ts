import Database from "better-sqlite3";
import path from "node:path";

export type TransferRecord = {
  id: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  fromAddress: string;
  toAddress: string;
  value: string;
  timestamp: number | null;
  createdAt: string;
};

export type IndexerState = {
  id: number;
  lastBlockNumber: number;
  updatedAt: string;
};

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = path.join(process.cwd(), "transfers.db");
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  initDatabase(db);

  return db;
}

function initDatabase(db: Database.Database) {
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
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_block_number INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO indexer_state (id, last_block_number) VALUES (1, 0);
  `);
}

export function insertTransfer(transfer: Omit<TransferRecord, "id" | "createdAt">): void {
  const db = getDatabase();
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

export function getLastIndexedBlock(): number {
  const db = getDatabase();
  const stmt = db.prepare("SELECT last_block_number FROM indexer_state WHERE id = 1");
  const row = stmt.get() as { last_block_number: number } | undefined;
  return row?.last_block_number ?? 0;
}

export function updateLastIndexedBlock(blockNumber: number): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE indexer_state
    SET last_block_number = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `);
  stmt.run(blockNumber);
}

export function getTransfersByAddress(
  address: string,
  page: number = 1,
  limit: number = 20
): { transfers: TransferRecord[]; total: number; page: number; limit: number } {
  const db = getDatabase();
  const offset = (page - 1) * limit;

  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM transfers
    WHERE from_address = ? OR to_address = ?
  `);
  const countRow = countStmt.get(address, address) as { count: number };
  const total = countRow.count;

  const stmt = db.prepare(`
    SELECT
      id,
      tx_hash as txHash,
      block_number as blockNumber,
      log_index as logIndex,
      from_address as fromAddress,
      to_address as toAddress,
      value,
      timestamp,
      created_at as createdAt
    FROM transfers
    WHERE from_address = ? OR to_address = ?
    ORDER BY block_number DESC, log_index DESC
    LIMIT ? OFFSET ?
  `);

  const transfers = stmt.all(address, address, limit, offset) as TransferRecord[];

  return { transfers, total, page, limit };
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}