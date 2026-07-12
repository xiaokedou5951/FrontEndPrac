# ADR-0001：选择 Viem v2 而非 wagmi/RainbowKit

- 状态：已接受
- 日期：2026-07-12
- 决策者：项目作者

## 背景

PRD 明确指定技术栈为 Next.js + TypeScript + Tailwind CSS 4 + Viem v2，目标是"学习与链上合约交互"。

wagmi 是 React 生态中最流行的链上交互库，提供 `useAccount`、`useReadContract`、`useWriteContract` 等 hooks，内置缓存、轮询、乐观更新。RainbowKit 在 wagmi 之上提供开箱即用的钱包连接 UI。

面临选择：
1. 直接用 Viem v2（自建 Context + Hooks）
2. 用 wagmi + Viem（复用成熟 hooks）
3. 用 wagmi + RainbowKit + Viem（连钱包 UI 也复用）

## 决策

直接使用 Viem v2，自建 React Context + Hooks，不引入 wagmi / RainbowKit。

## 备选方案

### wagmi + RainbowKit

**优点**：
- 开箱即用的钱包连接 UI（多钱包支持）
- hooks 内置缓存、轮询、乐观更新
- 社区活跃，文档完善

**为什么不选**：
- PRD 显式指定 Viem v2，未提 wagmi
- 学习目标要求理解底层机制（EIP-1193、writeContract、readContract），wagmi 抽象掉了这些
- wagmi 引入额外的 React Query 依赖，增加心智负担
- 本项目仅连 MetaMask（单一钱包），RainbowKit 的多钱包 UI 是过度能力

### wagmi（不用 RainbowKit）

**为什么不选**：
- 仍引入 React Query 依赖
- hooks 的缓存/轮询与自建 hooks 功能重叠
- 学习项目更需要手写而非复用

## 后果

**正面**：
- 依赖最小化（仅 viem 一个链交互库）
- 完整理解 EIP-1193 → walletClient → writeContract 的全链路
- 轮询/刷新逻辑可控，便于调试和学习

**负面**：
- 需自行实现钱包连接、事件监听、静默重连
- 无缓存层，重复请求同一数据需靠页面层 hook 单次调用规避
- 如未来需多链/多钱包，迁移到 wagmi 有成本

**后续工作**：
- 自建 `WalletContext` 管理连接状态
- 自建 4 个数据 hooks 实现轮询 + 手动刷新
- 如项目扩展到 3+ 合约 Demo，重新评估是否提取通用 `useContractRead`

## 相关文档

- [03-模块设计/链交互层](../03-模块设计/链交互层.md) — 自建 WalletContext 的实现
- [07-演进路线](../07-演进路线.md) — 何时重新评估 wagmi
