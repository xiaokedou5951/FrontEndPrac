# 系统全貌

## 项目定位

Web3 前端实战项目，核心目标是学习链上合约交互。包含两套独立的 Next.js 前端（viem 直连 / wagmi+AppKit），共用同一组 Solidity 合约。

## 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 合约 | Solidity + Foundry | ^0.8.30 |
| 合约库 | OpenZeppelin | 4.x |
| 前端框架 | Next.js + React + TypeScript | Next 15 / React 19 |
| 样式 | Tailwind CSS | 4.x |
| 链上交互 A | viem | 2.21+ |
| 链上交互 B | wagmi + @reown/appkit | wagmi 3.7+ / appkit 1.8+ |

## 模块关系

```
┌─────────────────────────────────────────────────────────┐
│                     用户浏览器                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐ │
│  │   viem-front         │  │   wagmi-front             │ │
│  │  (viem 直连)         │  │  (wagmi + AppKit)         │ │
│  │  单链 (环境变量)     │  │  多链 (Foundry/Sepolia/   │ │
│  │                      │  │        Polygon/Optimism)   │ │
│  └────────┬─────────────┘  └────────────┬─────────────┘ │
└───────────┼─────────────────────────────┼───────────────┘
            │  EIP-1193 / WalletConnect   │
            ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│                    钱包 (MetaMask 等)                     │
└──────────────────────────┬──────────────────────────────┘
                           │ 签名交易
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  EVM 兼容链                               │
│                                                          │
│  MyERC20 ◄───── TokenBank                                │
│     │                                                  │
│     └─────── NFTMarket / NFTMarketPermit ◄── SimpleNft  │
└─────────────────────────────────────────────────────────┘
```

## 合约一览

| 合约 | 文件 | 职责 |
|------|------|------|
| MyERC20 | `contracts/src/MyERC20.sol` | ERC20 代币，含 `transferWithCallbackAndData` 回调转账 |
| TokenBank | `contracts/src/TokenBank.sol` | 代币银行，存取款 + SafeERC20 |
| SimpleNft | `contracts/src/SimpleNft.sol` | 最小 ERC721 实现，仅用于 NFTMarket 交互 |
| NFTMarket | `contracts/src/NFTMarket.sol` | NFT 市场：上架 / 取消 / 购买 / 回调购买 |
| NFTMarketPermit | `contracts/src/NFTMarketPermit.sol` | NFT 市场 + EIP-712 白名单许可购买 |
| Counter | `contracts/src/Counter.sol` | Foundry 脚手架默认合约，无业务意义 |

## 前端目录结构

两套前端结构高度对齐：

```
{viem,wagmi}-front/src/
├── app/                  # Next.js App Router 页面
│   ├── tokenbank/        # TokenBank 页面
│   └── nft-market/       # NFTMarket 页面
├── components/
│   ├── tokenbank/        # TokenBank 组件 (DepositCard, WithdrawCard...)
│   ├── nftmarket/        # NFTMarket 组件 (ListCard, BuyCard...)
│   ├── shared/           # WalletBar
│   └── ui/               # 通用 UI (Button, Card, Input)
├── config/               # 合约地址、链配置
├── context/              # WalletContext
├── contracts/            # ABI 定义 (手写 TypeScript)
├── hooks/                # 自定义 Hooks (数据读取、事件监听)
└── lib/                  # viem 客户端 / AppKit 初始化 / 工具函数
```

## 关键设计决策

1. **为什么两套前端**：分别学习 viem 底层 API 和 wagmi React Hooks 两种链上交互范式
2. **ABI 手写而非自动生成**：合约规模小，手写 `as const` ABI 更直观，避免引入代码生成依赖
3. **viem-front 单链 vs wagmi-front 多链**：前者专注最小实现，后者探索多链切换场景
4. **NFTMarketPermit 独立合约而非继承**：避免修改已部署的 NFTMarket，同时演示 EIP-712 签名机制
