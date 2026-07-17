# 添加 Optimism 网络支持计划

## 概述

为 wagmi-front 项目添加 Optimism 主网 (OP Mainnet, Chain ID: 10) 支持，保持现有的 Foundry 本地链为默认网络。

## 当前状态分析

项目当前支持以下 3 条链：

1. **Foundry (本地链)** - Chain ID: 31337
2. **Sepolia (测试网)** - Chain ID: 11155111
3. **Polygon (主网)** - Chain ID: 137

网络配置分散在以下文件中：

- `src/lib/appkit.ts` - AppKit 网络定义和初始化
- `src/config/shared.ts` - 链列表导出和通用配置
- `src/config/nftmarket.ts` - NFT Market 合约地址配置
- `src/config/tokenbank.ts` - TokenBank 合约地址配置
- `.env.local.example` - 环境变量模板

## Optimism 主网关键信息

- **Chain ID**: 10
- **名称**: OP Mainnet
- **原生货币**: ETH (18 decimals)
- **RPC URL**: https://mainnet.optimism.io
- **区块浏览器**: https://optimistic.etherscan.io
- **网络类型**: 主网 (testnet: false)

## 实施方案

### 1. 修改 `src/lib/appkit.ts`

**目标**: 添加 Optimism 主网的 AppKit 网络定义

**变更内容**:

```typescript
// 在文件顶部导入 viem 的 optimism 链定义（如果需要）
// 或者手动定义 appKitOptimism

// 在 appKitPolygon 定义之后，添加：
const appKitOptimism = defineChain({
  id: 10,
  caipNetworkId: "eip155:10",
  chainNamespace: "eip155",
  name: "OP Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.optimism.io"] },
    public: { http: ["https://mainnet.optimism.io"] },
  },
  blockExplorers: {
    default: { name: "Optimistic Etherscan", url: "https://optimistic.etherscan.io" },
  },
  testnet: false,
});

// 更新 networks 数组：
export const networks = [appKitFoundry, appKitSepolia, appKitPolygon, appKitOptimism] as [
  AppKitNetwork,
  ...AppKitNetwork[],
];
```

### 2. 修改 `src/config/shared.ts`

**目标**: 在支持的链列表中添加 Optimism

**变更内容**:

```typescript
// 导入 viem 的 optimism 链定义
import { foundry, sepolia, polygon, optimism } from "viem/chains";

// 更新 chains 数组
export const chains = [foundry, sepolia, polygon, optimism] as const;
```

**注意**: viem 库已经内置了 optimism 链定义，可以直接导入使用。

### 3. 修改 `src/config/nftmarket.ts`

**目标**: 添加 Optimism 链的合约地址环境变量读取

**变更内容**:

在三个函数中添加 Optimism 的 case：

```typescript
// getEnvNftMarketAddress 函数
function getEnvNftMarketAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_POLYGON;
    case optimism.id:  // 新增
      return process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS_OPTIMISM;
    default:
      return undefined;
  }
}

// getEnvSimpleNftAddress 函数
function getEnvSimpleNftAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_POLYGON;
    case optimism.id:  // 新增
      return process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_OPTIMISM;
    default:
      return undefined;
  }
}

// getChainName 函数
function getChainName(chainId: number): string {
  switch (chainId) {
    case foundry.id:
      return "Local (31337)";
    case sepolia.id:
      return "Sepolia (11155111)";
    case polygon.id:
      return "Polygon (137)";
    case optimism.id:  // 新增
      return "Optimism (10)";
    default:
      return `未知链 (${chainId})`;
  }
}

// getChainEnvSuffix 函数
function getChainEnvSuffix(chainId: number): string | null {
  switch (chainId) {
    case foundry.id:
      return "LOCAL";
    case sepolia.id:
      return "SEPOLIA";
    case polygon.id:
      return "POLYGON";
    case optimism.id:  // 新增
      return "OPTIMISM";
    default:
      return null;
  }
}

// getConfigError 函数的错误提示也需要更新（第 73 行）
return `当前链 ${getChainName(chainId)} 不受支持。请切换到 Local (31337)、Sepolia (11155111)、Polygon (137) 或 Optimism (10)。`;
```

### 4. 修改 `src/config/tokenbank.ts`

**目标**: 添加 Optimism 链的 TokenBank 合约地址环境变量读取

**变更内容**:

```typescript
// 在文件顶部导入中添加 optimism
import { foundry, sepolia, polygon, optimism } from "viem/chains";

// getEnvTokenBankAddress 函数
function getEnvTokenBankAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_POLYGON;
    case optimism.id:  // 新增
      return process.env.NEXT_PUBLIC_TOKENBANK_ADDRESS_OPTIMISM;
    default:
      return undefined;
  }
}

// getChainName 函数（与 nftmarket.ts 保持一致）
function getChainName(chainId: number): string {
  switch (chainId) {
    case foundry.id:
      return "Local (31337)";
    case sepolia.id:
      return "Sepolia (11155111)";
    case polygon.id:
      return "Polygon (137)";
    case optimism.id:  // 新增
      return "Optimism (10)";
    default:
      return `未知链 (${chainId})`;
  }
}

// getChainEnvSuffix 函数
function getChainEnvSuffix(chainId: number): string | null {
  switch (chainId) {
    case foundry.id:
      return "LOCAL";
    case sepolia.id:
      return "SEPOLIA";
    case polygon.id:
      return "POLYGON";
    case optimism.id:  // 新增
      return "OPTIMISM";
    default:
      return null;
  }
}

// getConfigError 函数中的错误提示（第 56 行）
return `当前链 ${getChainName(chainId)} 不受支持。请切换到 Local (31337)、Sepolia (11155111)、Polygon (137) 或 Optimism (10)。`;

// getConfigError 函数中的 switch 语句（第 65-67 行）
const tokenRaw = chainId === foundry.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL
  : chainId === sepolia.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA
  : chainId === polygon.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_POLYGON
  : chainId === optimism.id ? process.env.NEXT_PUBLIC_TOKEN_ADDRESS_OPTIMISM  // 新增
  : undefined;
```

同时需要修改 `src/config/shared.ts` 中的 `getEnvTokenAddress` 函数：

```typescript
function getEnvTokenAddress(chainId: number): string | undefined {
  switch (chainId) {
    case foundry.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL;
    case sepolia.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_SEPOLIA;
    case polygon.id:
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_POLYGON;
    case optimism.id:  // 新增
      return process.env.NEXT_PUBLIC_TOKEN_ADDRESS_OPTIMISM;
    default:
      return undefined;
  }
}
```

### 5. 修改 `.env.local.example`

**目标**: 添加 Optimism 主网的合约地址配置模板

**变更内容**:

在 Polygon 配置之后添加：

```bash
# ============================================================
# Optimism 主网配置 (chainId: 10)
# ============================================================

# MyERC20 代币合约地址
NEXT_PUBLIC_TOKEN_ADDRESS_OPTIMISM=

# TokenBank 合约地址
NEXT_PUBLIC_TOKENBANK_ADDRESS_OPTIMISM=

# NFTMarket 合约地址
NEXT_PUBLIC_NFT_MARKET_ADDRESS_OPTIMISM=

# SimpleNft 合约地址
NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_OPTIMISM=
```

### 6. 更新测试文档

**目标**: 更新 `test/nftmarket-appkit/README.md` 中的支持链列表

**变更内容**:

在"切换网络"部分添加 Optimism 的说明：

```markdown
### 2. 切换网络

连接钱包后，确保切换到正确的网络：

- **Foundry (31337)** - 本地测试链（默认）
- **Sepolia (11155111)** - 以太坊测试网
- **Polygon (137)** - Polygon 主网
- **Optimism (10)** - Optimism 主网（新增）
```

## 假设与决策

### 假设

1. viem 库已包含 optimism 链的定义（通过 `import { optimism } from "viem/chains"` 导入）
2. 用户在 Optimism 主网上需要自己部署合约或使用已有的合约地址
3. 项目使用 Reown AppKit 作为钱包连接方案，需要在其网络配置中添加 Optimism

### 决策

1. **不修改默认网络**: 保持 Foundry 本地链为默认网络，不影响现有的开发流程
2. **环境变量命名**: 使用 `OPTIMISM` 作为环境变量后缀，与其他主网（如 POLYGON）保持一致的命名风格
3. **RPC URL**: 使用官方推荐的公共 RPC `https://mainnet.optimism.io`
4. **不添加 Optimism Sepolia**: 用户选择只添加主网，不添加测试网

## 验证步骤

### 1. 代码验证

```bash
# 检查 TypeScript 编译
npm run build

# 检查 lint
npm run lint
```

### 2. 功能验证

1. 启动开发服务器：
   ```bash
   cd wagmi-front
   npm run dev
   ```

2. 访问应用并测试：
   - 打开 http://localhost:3000
   - 连接钱包（MetaMask 或 WalletConnect）
   - 检查网络选择器中是否显示 "OP Mainnet" 或 "Optimism (10)"
   - 尝试切换到 Optimism 网络
   - 检查是否正确显示配置缺失提示（因为合约地址为空）

3. 配置合约地址测试：
   - 在 `.env.local` 中填写 Optimism 的合约地址
   - 重启开发服务器
   - 切换到 Optimism 网络
   - 检查是否能正确读取合约地址并在页面上显示

### 3. 兼容性验证

- 确认其他链（Foundry、Sepolia、Polygon）的功能不受影响
- 确认钱包连接、网络切换等核心功能正常工作

## 实施顺序

按照依赖关系，实施顺序为：

1. 修改 `src/config/shared.ts` - 添加 optimism 导入和链定义
2. 修改 `src/lib/appkit.ts` - 添加 AppKit 网络配置
3. 修改 `src/config/tokenbank.ts` - 添加合约地址读取逻辑
4. 修改 `src/config/nftmarket.ts` - 添加合约地址读取逻辑
5. 修改 `.env.local.example` - 添加环境变量模板
6. 更新测试文档 `test/nftmarket-appkit/README.md`

## 风险与注意事项

1. **viem 版本兼容性**: 确认当前使用的 viem 版本（v2.55.0）已包含 optimism 链定义
2. **AppKit 网络 ID**: Reown AppKit 使用 CAIP Network ID 格式（eip155:10），需确保格式正确
3. **合约部署**: 用户需要在 Optimism 上部署合约才能完整测试功能
4. **RPC 可用性**: 公共 RPC 可能有速率限制，生产环境建议使用付费 RPC 提供商

## 参考资源

- [Optimism 官方文档](https://docs.optimism.io/)
- [Optimistic Etherscan](https://optimistic.etherscan.io/)
- [viem chains 文档](https://viem.sh/chains.html)
- [Reown AppKit 文档](https://docs.reown.com/appkit)