# ERC20 转账数据索引与展示方案

## 一、方案概述

在 viem-front 项目中实现一个完整的 ERC20 代币转账数据索引系统,包括:
- **后端索引服务**: 使用 Viem 监听 MyERC20 代币的 Transfer 事件,将数据存储到 SQLite 数据库,并提供 RESTful API 接口
- **前端展示页面**: 用户登录后展示其地址相关的转账记录

**技术栈选择**:
- 后端框架: Next.js API Routes
- 数据库: SQLite (轻量级嵌入式数据库)
- 区块链交互: Viem
- 索引范围: 所有 Transfer 事件

---

## 二、现状分析

### 2.1 项目结构
```
viem-front/
├── src/
│   ├── app/              # Next.js 页面路由
│   ├── components/       # React 组件
│   ├── hooks/            # 自定义 Hooks
│   ├── context/          # WalletContext (用户登录状态)
│   ├── contracts/        # 合约 ABI (erc20Abi.ts 已包含 Transfer 事件)
│   ├── config/           # 配置文件 (shared.ts 包含 tokenAddress)
│   └── lib/              # Viem 客户端配置
├── test/
│   └── nftmarket/
│       └── watch-events.mjs  # ✅ 已有事件监听参考实现
└── .env.local           # NEXT_PUBLIC_TOKEN_ADDRESS 等配置
```

### 2.2 已有基础设施

#### ✅ 合约层
- MyERC20 合约已部署,地址配置在 `NEXT_PUBLIC_TOKEN_ADDRESS`
- `src/contracts/erc20Abi.ts` 已包含 Transfer 事件定义:
  ```typescript
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { type: "address", name: "from", indexed: true },
      { type: "address", name: "to", indexed: true },
      { type: "uint256", name: "value", indexed: false }
    ]
  }
  ```

#### ✅ 前端层
- `WalletContext` 提供用户登录状态和钱包地址
- `src/lib/viem.ts` 提供公共客户端配置
- `src/config/shared.ts` 导出 `tokenAddress`

#### ✅ 参考实现
- `test/nftmarket/watch-events.mjs` 展示了完整的事件监听流程:
  - 使用 Viem 的 `publicClient.watchEvent()` 监听事件
  - 支持 `fromBlock` 参数回放历史事件
  - 事件日志解析与格式化

### 2.3 缺失部分

#### ❌ 后端层
- 没有数据库支持 (需要集成 SQLite)
- 没有 API Routes 结构
- 没有事件索引服务

#### ❌ 前端页面
- 没有 `/erc20-index-tx` 页面组件
- 没有转账记录查询的 Hook
- 没有转账记录展示的组件

---

## 三、实现方案

### 3.1 数据库设计

#### 表结构: `transfers`
```sql
CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,           -- 交易哈希
  block_number INTEGER NOT NULL,   -- 区块高度
  log_index INTEGER NOT NULL,      -- 日志索引
  from_address TEXT NOT NULL,      -- 发送方地址
  to_address TEXT NOT NULL,        -- 接收方地址
  value TEXT NOT NULL,             -- 转账金额 (bigint 字符串)
  timestamp INTEGER,               -- 区块时间戳 (可选)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tx_hash, log_index)       -- 防止重复索引
);

-- 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_from_address ON transfers(from_address);
CREATE INDEX IF NOT EXISTS idx_to_address ON transfers(to_address);
CREATE INDEX IF NOT EXISTS idx_block_number ON transfers(block_number);
```

### 3.2 后端实现

#### 3.2.1 数据库工具模块

**文件**: `src/lib/database.ts`

**功能**:
- 初始化 SQLite 数据库连接
- 创建表和索引
- 提供增删改查方法

**依赖**: `better-sqlite3` (同步 API,性能好) 或 `sql.js` (纯 JS 实现)

**关键方法**:
```typescript
export function initDatabase()
export function insertTransfer(transfer: TransferRecord)
export function getTransfersByAddress(address: string)
export function getLastIndexedBlock()
export function updateLastIndexedBlock(blockNumber: number)
```

#### 3.2.2 事件索引服务

**文件**: `src/lib/erc20-indexer.ts`

**功能**:
- 启动 Transfer 事件监听
- 从指定区块开始回放历史事件
- 将事件数据写入数据库
- 定期更新索引进度

**实现要点**:
- 使用 Viem 的 `publicClient.watchEvent()` API
- 参考 `test/nftmarket/watch-events.mjs` 的实现模式
- 首次运行时从创世块或配置的 `FROM_BLOCK` 开始索引
- 后续运行时从 `lastIndexedBlock + 1` 继续

**关键代码逻辑**:
```typescript
import { getPublicClient } from "@/lib/viem";
import { erc20Abi } from "@/contracts/erc20Abi";
import { tokenAddress } from "@/config/shared";
import { insertTransfer, getLastIndexedBlock, updateLastIndexedBlock } from "./database";

export async function startIndexing() {
  const publicClient = getPublicClient();
  const fromBlock = getLastIndexedBlock() || BigInt(process.env.INDEX_FROM_BLOCK || 0);

  publicClient.watchEvent({
    address: tokenAddress,
    events: erc20Abi,
    fromBlock,
    onLogs: (logs) => {
      for (const log of logs) {
        if (log.eventName === "Transfer") {
          insertTransfer({
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            fromAddress: log.args.from,
            toAddress: log.args.to,
            value: log.args.value.toString(),
            timestamp: null // 可选: 通过 getBlock 获取
          });
        }
      }
      // 更新最新索引的区块
      const maxBlock = Math.max(...logs.map(l => Number(l.blockNumber)));
      updateLastIndexedBlock(maxBlock);
    },
    onError: (error) => {
      console.error("Indexing error:", error);
    }
  });
}
```

#### 3.2.3 API Routes

**文件**: `src/app/api/transfers/[address]/route.ts`

**功能**: 根据地址查询转账记录

**接口规范**:
```
GET /api/transfers/[address]?page=1&limit=20
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "transfers": [
      {
        "id": 1,
        "txHash": "0x...",
        "blockNumber": 12345,
        "logIndex": 0,
        "fromAddress": "0x...",
        "toAddress": "0x...",
        "value": "1000000000000000000",
        "timestamp": 1690123456,
        "createdAt": "2026-07-28T10:00:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

**实现逻辑**:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTransfersByAddress } from "@/lib/database";

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    const transfers = getTransfersByAddress(address, page, limit);
    return NextResponse.json({ success: true, data: transfers });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch transfers" },
      { status: 500 }
    );
  }
}
```

#### 3.2.4 启动索引服务

**文件**: `instrumentation.ts` (Next.js 15 推荐方式)

**功能**: 在应用启动时自动启动索引服务

```typescript
import { startIndexing } from "@/lib/erc20-indexer";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("Starting ERC20 transfer indexing service...");
    startIndexing();
  }
}
```

**配置**: 需要在 `next.config.ts` 中启用:
```typescript
export default {
  experimental: {
    instrumentationHook: true
  }
}
```

### 3.3 前端实现

#### 3.3.1 自定义 Hook

**文件**: `src/hooks/erc20-index-tx/useTransfers.ts`

**功能**: 封装转账记录查询逻辑

**实现**:
```typescript
import { useWallet } from "@/context/WalletContext";
import { useState, useEffect } from "react";

type Transfer = {
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  value: string;
  timestamp: number;
};

export function useTransfers() {
  const { account } = useWallet();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;

    const fetchTransfers = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/transfers/${account}`);
        const result = await response.json();
        if (result.success) {
          setTransfers(result.data.transfers);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch transfers");
      } finally {
        setLoading(false);
      }
    };

    fetchTransfers();
    // 可选: 定时刷新
    const interval = setInterval(fetchTransfers, 30000);
    return () => clearInterval(interval);
  }, [account]);

  return { transfers, loading, error };
}
```

#### 3.3.2 页面组件

**文件**: `src/app/erc20-index-tx/page.tsx`

**功能**: 主页面,展示用户转账记录

**布局结构**:
```typescript
"use client";

import { useWallet } from "@/context/WalletContext";
import { useTransfers } from "@/hooks/erc20-index-tx/useTransfers";
import { TransfersTable } from "@/components/erc20-index-tx/TransfersTable";
import { WalletBar } from "@/components/shared/WalletBar";

export default function ERC20IndexTxPage() {
  const { account } = useWallet();
  const { transfers, loading, error } = useTransfers();

  if (!account) {
    return (
      <div className="min-h-screen p-8">
        <WalletBar />
        <div className="mt-8 text-center text-gray-500">
          请先连接钱包查看转账记录
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <WalletBar />
      <h1 className="text-3xl font-bold mt-8 mb-6">
        ERC20 转账记录
      </h1>
      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}
      <TransfersTable transfers={transfers} loading={loading} />
    </div>
  );
}
```

#### 3.3.3 展示组件

**文件**: `src/components/erc20-index-tx/TransfersTable.tsx`

**功能**: 表格展示转账记录

**实现要点**:
- 使用项目现有的 UI 组件风格 (参考 `components/tokenbank/*.tsx`)
- 显示交易哈希、区块高度、发送方、接收方、金额、时间
- 地址使用短格式显示 (参考 `test/nftmarket/watch-events.mjs` 的 `short()` 函数)
- 金额使用 `formatTokenAmount()` 格式化

**表格列设计**:
| 交易哈希 | 区块 | 发送方 | 接收方 | 金额 | 时间 |
|----------|------|--------|--------|------|------|

#### 3.3.4 类型定义

**文件**: `src/components/erc20-index-tx/types.ts`

```typescript
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
```

---

## 四、实施步骤

### 步骤 1: 安装依赖
```bash
cd viem-front
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

### 步骤 2: 创建数据库模块
- 创建 `src/lib/database.ts`
- 实现数据库初始化和 CRUD 方法
- 定义数据表结构

### 步骤 3: 实现事件索引服务
- 创建 `src/lib/erc20-indexer.ts`
- 参考 `test/nftmarket/watch-events.mjs` 实现事件监听
- 集成数据库写入逻辑

### 步骤 4: 配置启动钩子
- 创建 `instrumentation.ts`
- 更新 `next.config.ts` 启用 `instrumentationHook`

### 步骤 5: 实现 API Route
- 创建 `src/app/api/transfers/[address]/route.ts`
- 实现查询接口逻辑
- 添加分页参数支持

### 步骤 6: 创建前端组件
- 创建 `src/hooks/erc20-index-tx/useTransfers.ts`
- 创建 `src/components/erc20-index-tx/TransfersTable.tsx`
- 创建 `src/components/erc20-index-tx/types.ts`
- 创建 `src/app/erc20-index-tx/page.tsx`

### 步骤 7: 测试验证
- 启动本地 anvil 节点
- 执行一些代币转账交易 (使用 `cast` 或前端界面)
- 访问 `http://localhost:3000/erc20-index-tx` 查看记录

---

## 五、假设与决策

### 5.1 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 后端架构 | Next.js API Routes | 无需独立服务器,部署简单,与前端同源 |
| 数据库 | SQLite | 轻量级,无需独立服务,适合事件日志存储 |
| 索引方式 | watchEvent + fromBlock | 实时监听新事件 + 回放历史事件 |
| 启动方式 | instrumentation hook | Next.js 15 推荐的应用启动钩子 |
| 数据库驱动 | better-sqlite3 | 同步 API,性能好,广泛使用 |

### 5.2 设计假设

1. **索引起始块**: 默认从创世块开始索引,可通过 `INDEX_FROM_BLOCK` 环境变量配置
2. **时间戳获取**: 暂不获取区块时间戳 (需要额外 RPC 调用),优先保证索引性能
3. **分页大小**: 默认每页 20 条记录,可通过查询参数调整
4. **错误处理**: 索引失败时记录日志但不中断应用运行
5. **并发控制**: 不处理并发写入场景 (SQLite 的串行化写入已足够)

### 5.3 边界情况处理

1. **钱包未连接**: 显示提示信息,不发起 API 请求
2. **数据库连接失败**: 记录错误日志,API 返回 500 错误
3. **无转账记录**: 表格显示空状态提示
4. **重复事件**: 使用 `UNIQUE(tx_hash, log_index)` 约束防止重复插入

---

## 六、验证方案

### 6.1 功能验证

#### 后端验证
```bash
# 1. 启动开发服务器
npm run dev

# 2. 检查索引服务启动日志
# 预期看到: "Starting ERC20 transfer indexing service..."

# 3. 使用 cast 触发转账交易
cast send $TOKEN_ADDRESS "transfer(address,uint256)" $RECEIVER 1000000000000000000 --private-key $PRIVATE_KEY

# 4. 直接查询数据库
sqlite3 transfers.db "SELECT * FROM transfers ORDER BY block_number DESC LIMIT 5;"

# 5. 测试 API 接口
curl http://localhost:3000/api/transfers/0xYourAddress
```

#### 前端验证
```bash
# 1. 访问页面
# 打开 http://localhost:3000/erc20-index-tx

# 2. 未连接钱包时
# 预期看到: "请先连接钱包查看转账记录"

# 3. 连接钱包后
# 预期看到转账记录表格或空状态提示

# 4. 触发新转账
# 使用 cast 或 TokenBank 页面触发转账
# 刷新页面,预期看到新记录
```

### 6.2 性能验证

- 索引服务内存占用 < 100MB
- API 响应时间 < 100ms (1000 条记录以内)
- 前端页面加载时间 < 2s

### 6.3 错误场景验证

- 数据库文件权限问题
- RPC 节点连接失败
- 无效地址查询
- 分页参数异常

---

## 七、后续优化建议

1. **时间戳字段**: 通过 `publicClient.getBlock()` 补充区块时间戳
2. **索引进度持久化**: 单独存储 `lastIndexedBlock` 避免每次全量回放
3. **WebSocket 实时推送**: 使用 WebSocket 实现新转账实时推送到前端
4. **批量查询优化**: 支持查询多个地址的转账记录
5. **导出功能**: 添加 CSV 导出功能
6. **响应式设计**: 优化移动端展示效果

---

## 八、参考资源

- [Viem Events 文档](https://viem.sh/docs/actions/public/watchEvent)
- [Next.js API Routes 文档](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js Instrumentation 文档](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- 项目现有实现: `test/nftmarket/watch-events.mjs`