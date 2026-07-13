# 模块设计

> 一句话定位：本文档回答「前端有哪些模块、各自边界在哪、谁依赖谁」，受众是开发者。

## 模块清单

资源按功能拆分为 `shared/`、`tokenbank/`、`nftmarket/` 三组。

| 模块 | 目录 | 核心文件 | 详细文档 |
|---|---|---|---|
| 共享配置 | `src/config/` | `shared.ts` | [链交互层](./链交互层.md) |
| TokenBank 配置 | `src/config/` | `tokenbank.ts` | [链交互层](./链交互层.md) |
| NFTMarket 配置 | `src/config/` | `nftmarket.ts` | [链交互层](./链交互层.md) |
| 共享 ABI | `src/contracts/` | `erc20Abi.ts` | [链交互层](./链交互层.md) |
| TokenBank ABI | `src/contracts/` | `tokenBankAbi.ts` | [链交互层](./链交互层.md) |
| NFTMarket ABI | `src/contracts/` | `nftMarketAbi.ts`（含 `erc721Abi`、`nftMarketEvents`） | [链交互层](./链交互层.md) |
| 客户端工厂 | `src/lib/` | `viem.ts` | [链交互层](./链交互层.md) |
| 钱包状态 | `src/context/` | `WalletContext.tsx` | [链交互层](./链交互层.md) |
| 共享 Hook | `src/hooks/` | `useTokenMetadata.ts` | [Hooks与数据流](./Hooks与数据流.md) |
| TokenBank Hooks | `src/hooks/tokenbank/` | `useTokenBalance`、`useAllowance`、`useDepositBalance` | [Hooks与数据流](./Hooks与数据流.md) |
| NFTMarket Hooks | `src/hooks/nftmarket/` | `useListings`、`useNFTMarketEvents` | [Hooks与数据流](./Hooks与数据流.md) |
| 通用 UI | `src/components/ui/` | Button, Card, AmountInput, AddressInput | [UI与页面层](./UI与页面层.md) |
| 共享业务组件 | `src/components/shared/` | `WalletBar` | [UI与页面层](./UI与页面层.md) |
| TokenBank 组件 | `src/components/tokenbank/` | 6 组件 + types | [UI与页面层](./UI与页面层.md) |
| NFTMarket 组件 | `src/components/nftmarket/` | 6 组件 + types | [UI与页面层](./UI与页面层.md) |
| 页面 | `src/app/` | layout, page, tokenbank/page, nft-market/page | [UI与页面层](./UI与页面层.md) |

## 依赖矩阵

```
                      shared  tokenbank  nftmarket  lib   context  hooks/*  ui    shared  tokenbank  nftmarket  app
                      config  config     config     viem  Wallet   (含子目录)  comp  comp    comp       comp       
config/shared.ts        —       ✗          ✗         ✗      ✗        ✗       ✗      ✗        ✗          ✗       ✗
config/tokenbank.ts     ✓       —          ✗         ✗      ✗        ✗       ✗      ✗        ✗          ✗       ✗
config/nftmarket.ts     ✗       ✗          —         ✗      ✗        ✗       ✗      ✗        ✗          ✗       ✗
contracts/*             ✗       ✗          ✗         —      ✗        ✗       ✗      ✗        ✗          ✗       ✗
lib/viem.ts             ✓       ✗          ✗         —      ✗        ✗       ✗      ✗        ✗          ✗       ✗
context/WalletContext   ✓       ✗          ✗         ✓      —        ✗       ✗      ✗        ✗          ✗       ✗
hooks/useTokenMetadata  ✓       ✗          ✗         ✗      ✓        —       ✗      ✗        ✗          ✗       ✗
hooks/tokenbank/*       ✓       ✓          ✗         ✗      ✓        —       ✗      ✗        ✗          ✗       ✗
hooks/nftmarket/*       ✓       ✗          ✓         ✗      ✓        —       ✗      ✗        ✗          ✗       ✗
components/ui/*         ✗       ✗          ✗         ✗      ✗        ✗       —      ✗        ✗          ✗       ✗
components/shared/*     ✗       ✗          ✗         ✗      ✓        ✗       ✗      —        ✗          ✗       ✗
components/tokenbank/*  ✓       ✓          ✗         ✓      ✓        ✗       ✓      ✗        —          ✗       ✗
components/nftmarket/*  ✓       ✗          ✓         ✓      ✓        ✗       ✓      ✗        ✗          —       ✗
app/tokenbank/page      ✓       ✓          ✗         ✗      ✓        ✓       ✗      ✓        ✓          ✗       —
app/nft-market/page     ✓       ✗          ✓         ✗      ✓        ✓       ✗      ✓        ✗          ✓       —

✓ = 依赖    ✗ = 不依赖    — = 自身
```

**关键观察**：
- `config/shared.ts`、`contracts/*` 是最底层，不依赖任何其他模块
- `config/tokenbank.ts` 依赖 `config/shared.ts`（需 `tokenAddress`）；`config/nftmarket.ts` 独立
- `components/ui/` 完全独立，无业务依赖
- `hooks/tokenbank/*` 与 `hooks/nftmarket/*` 互不依赖，隔离彻底
- `components/tokenbank/*` 与 `components/nftmarket/*` 互不依赖
- `app/*` 是唯一跨功能依赖的模块（页面组装点）

## 模块边界规则

1. **shared 层只放跨功能复用**：`erc20Abi`、`tokenAddress`、`chain`、`WalletBar`、`useTokenMetadata`、UI 基础组件
2. **功能层互不依赖**：`tokenbank/` 不引用 `nftmarket/`，反之亦然；共享内容上浮到 `shared/`
3. **config 层只做读取和校验**：不创建客户端、不调用 viem 方法
4. **lib 层只做工厂和工具**：不持有 React 状态
5. **context 层管理连接状态**：不关心具体合约业务
6. **hooks 层只读不写**：只调 `readContract` / `getContractEvents` / `watchEvent`，写操作在组件层通过 `walletClient.writeContract`
7. **ui 层无业务语义**：不知道 Token、TokenBank、NFT 的存在
8. **功能组件层组合一切**：调 hooks/useWallet、写合约、触发刷新
9. **页面层只组装不实现**：调 hooks、传 props、不直接写合约

## 扩展点

新增第三个合约 Demo（如 StakePool）时，按既定模式扩展：

```
新增 src/contracts/stakePoolAbi.ts        # 功能专属 ABI
新增 src/config/stakepool.ts              # 功能专属地址 + configOk/configError
新增 src/hooks/stakepool/                 # 功能专属 hooks
新增 src/components/stakepool/            # 功能专属组件
新增 src/app/stake-pool/page.tsx          # 页面
复用 src/contracts/erc20Abi.ts            # 如需操作 ERC20
复用 src/config/shared.ts                 # 如需 tokenAddress/chain
复用 src/context/WalletContext            # 钱包状态
复用 src/components/ui/、shared/          # 通用 UI 与 WalletBar
复用 src/lib/viem                         # 客户端工厂
```

> 资源按功能拆分是有意为之的约束，详见 [ADR-0004](../decisions/0004-按功能拆分资源.md)。

## 相关文档

- [02-架构总览](../02-架构总览.md) — 系统级视角
- [05-接口契约](../05-接口契约.md) — 模块间契约细节
- [ADR-0004](../decisions/0004-按功能拆分资源.md) — 按功能拆分资源的决策

## 变更记录

| 日期 | 变更 | 作者 |
|---|---|---|
| 2026-07-12 | 初始创建（仅 TokenBank） | — |
| 2026-07-13 | 更新为按功能拆分结构，新增 NFTMarket 模块 | — |
