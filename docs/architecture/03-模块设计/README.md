# 模块设计

> 一句话定位：本文档回答「前端有哪些模块、各自边界在哪、谁依赖谁」，受众是开发者。

## 模块清单

| 模块 | 目录 | 核心文件 | 详细文档 |
|---|---|---|---|
| 配置层 | `src/config/` | `contracts.ts` | [链交互层](./链交互层.md) |
| ABI 层 | `src/contracts/` | `abis.ts` | [链交互层](./链交互层.md) |
| 客户端工厂 | `src/lib/` | `viem.ts` | [链交互层](./链交互层.md) |
| 钱包状态 | `src/context/` | `WalletContext.tsx` | [链交互层](./链交互层.md) |
| 数据 Hooks | `src/hooks/` | 4 个 hook 文件 | [Hooks与数据流](./Hooks与数据流.md) |
| 通用 UI | `src/components/ui/` | Button, Card, AmountInput | [UI与页面层](./UI与页面层.md) |
| 业务组件 | `src/components/tokenbank/` | 6 组件 + types | [UI与页面层](./UI与页面层.md) |
| 页面 | `src/app/` | layout, page, tokenbank/page | [UI与页面层](./UI与页面层.md) |

## 依赖矩阵

```
                    config  contracts  lib  context  hooks  ui  tokenbank  app
config/contracts.ts    —       ✗        ✗     ✗       ✗     ✗     ✗       ✗
contracts/abis.ts      ✗       —        ✗     ✗       ✗     ✗     ✗       ✗
lib/viem.ts            ✓       ✗        —     ✗       ✗     ✗     ✗       ✗
context/WalletContext  ✓       ✗        ✓     —       ✗     ✗     ✗       ✗
hooks/*                ✓       ✓        ✗     ✓       —     ✗     ✗       ✗
components/ui/*        ✗       ✗        ✗     ✗       ✗     —     ✗       ✗
components/tokenbank/* ✓       ✓        ✓     ✓       ✗     ✓     —       ✗
app/*                  ✓       ✗        ✗     ✓       ✓     ✗     ✓       —

✓ = 依赖    ✗ = 不依赖    — = 自身
```

**关键观察**：
- `config/` 和 `contracts/abis.ts` 是最底层，不依赖任何其他模块
- `components/ui/` 完全独立，无业务依赖
- `hooks/` 不依赖组件层，只依赖 context + config + contracts
- `app/` 是唯一依赖所有上层的模块（组装点）

## 模块边界规则

1. **config 层只做读取和校验**：不创建客户端、不调用 viem 方法
2. **lib 层只做工厂和工具**：不持有 React 状态
3. **context 层管理连接状态**：不关心具体合约业务
4. **hooks 层只读不写**：只调 `readContract`，写操作在组件层通过 `walletClient.writeContract`
5. **ui 层无业务语义**：不知道 Token、TokenBank 的存在
6. **tokenbank 组件层组合一切**：调 hooks/useWallet、写合约、触发刷新
7. **页面层只组装不实现**：调 hooks、传 props、不直接写合约

## 扩展点

新增一个合约 Demo（如 NFT Demo）时：

```
新增 src/app/nft/page.tsx          # 页面
新增 src/components/nft/           # 业务组件
新增 src/contracts/nft-abis.ts     # 或扩展 abis.ts
复用 src/context/WalletContext     # 钱包状态可复用
复用 src/components/ui/            # 通用 UI 可复用
复用 src/lib/viem                  # 客户端工厂可复用
```

> 不为"未来合约"提前建通用框架，仅通过目录结构预留扩展位 → [ADR-0001](../decisions/0001-选择Viem而非wagmi.md)

## 相关文档

- [02-架构总览](../02-架构总览.md) — 系统级视角
- [05-接口契约](../05-接口契约.md) — 模块间契约细节

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建 | — |
