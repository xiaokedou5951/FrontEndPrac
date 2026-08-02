# 白名单优惠购买 NFT 页面（airdrop-merkle）实现计划

## Summary

在 `wagmi-front/src/app/airdrop-merkle` 新增一个完整页面，让白名单用户基于 Merkle 验证 + EIP‑2612 permit + multicall(delegatecall)，以上架价 50% 优惠购买 NFT。Merkle proof 由 `wagmi-front/test/airdrop-merkle` 下的原生 Node http 后端（手写 Merkle 树，OZ `commutativeKeccak256` 兼容）通过 API 返回。页面镜像现有 `/nft-market-white` 的结构与组件约定，含卖家上架/授权/取消 + 买家一键优惠购买 + 事件日志。

合约侧 `AirdropMerkleNFTMarket.sol` 已实现（permitPrePay + claimNFT + multicall + merkleRoot + claimed），本计划只做前端 + proof 后端。

## Current State Analysis

- 目标页面目录 `wagmi-front/src/app/airdrop-merkle` 当前为空（已确认 LS 返回空）。
- 参考页面 [nft-market-white/page.tsx](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/app/nft-market-white/page.tsx)：用 `useWallet()`(account/walletClient/publicClient) + `useAccount().chainId` + `useListingsWagmi` + `useNFTMarketPermitEventsWagmi` + `useTokenMetadataWagmi`，按 `getConfigOk/getConfigError` 校验环境变量，卡片网格布局，`WalletBar` 在 header。
- 钱包上下文 [WalletContext.tsx](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/context/WalletContext.tsx)：暴露 `account/chainId/walletClient/publicClient`；`walletClient.signTypedData` 用于签名（见 [SignPermitCard.tsx](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/components/nftmarket-permit/SignPermitCard.tsx)）。
- 写合约范式 [PermitBuyCard.tsx](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/components/nftmarket-permit/PermitBuyCard.tsx)：`useWriteContract` + `useWaitForTransactionReceipt`，`publicClient.readContract` 读 allowance，`splitSignature` 拆 v/r/s。
- Listings 读取 [useListingsWagmi.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/hooks/nftmarket-permit/useListingsWagmi.ts)：先读 `nextListingId`，再 `useReadContracts` 批量读 `listings(i)`，过滤 `isActive`。
- 事件监听 [useNFTMarketPermitEventsWagmi.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/hooks/nftmarket-permit/useNFTMarketPermitEventsWagmi.ts)：`useContractEvents`(fromBlock 0n) + `useWatchContractEvent`(pollingInterval 2000)，去重并排序。
- 配置范式 [nftMarketPermit.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/config/nftMarketPermit.ts)：按 `foundry/sepolia/polygon/optimism` 读 `NEXT_PUBLIC_*` 环境变量，`isAddress` 校验，`getAddress/getConfigOk/getConfigError`。Token 地址在 [shared.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/config/shared.ts) `getTokenAddress`，链常量 `chains = [foundry, sepolia, polygon, optimism]`，`defaultChain = foundry`。
- ABI 范式 [nftMarketPermitAbi.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/contracts/nftMarketPermitAbi.ts)：导出 `erc721Abi`、`xxxAbi`(as const)、`xxxEvents`。`erc20Abi`([erc20Abi.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/contracts/erc20Abi.ts)) **不含** `nonces/DOMAIN_SEPARATOR/permit`，需补充。
- 工具 [lib/viem.ts](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/lib/viem.ts)：`formatTokenAmount/parseTokenAmount/safeParseTokenAmount`。UI 组件：`Card/Button/AddressInput/AmountInput`，`shared/WalletBar`。
- 首页 [app/page.tsx](file:///Users/mac/learn/web3/2026/07/FrontEndPrac/wagmi-front/src/app/page.tsx) 用卡片 Link 列出各演示页；providers = WagmiProvider + QueryClientProvider + WalletProvider。
- 依赖：next15/react19/wagmi3.7/viem2.55，无 merkletreejs（后端手写，用 viem 的 `keccak256/concat` 原语）。
- 环境变量模板：`wagmi-front/.env.local.example`（已存在，含 Token/TokenBank/NFTMarket/NFTMarketPermit/SimpleNft 各链变量），将在其中追加 airdrop-merkle 相关变量，不新建文件。

## Assumptions & Decisions

1. **后端位置**：`wagmi-front/test/airdrop-merkle/`（用户指定）。独立 Node 进程，原生 `http` 模块 + 手写 Merkle（用 viem 的 `keccak256/concat`，从父级 `wagmi-front/node_modules` 解析）。
2. **Merkle 算法（必须与合约 OZ `MerkleProof.verify` 一致）**：
   - `leaf(addr) = keccak256(addr)`（等价 `keccak256(abi.encodePacked(addr))`，addr 为 20 字节）。
   - `pairHash(a,b) = a < b ? keccak256(concat(a,b)) : keccak256(concat(b,a))`（a,b 为 bytes32 hex，字典序比较等价字节序，匹配 OZ `commutativeKeccak256`）。
   - 建树：每层若节点数为奇数则复制末尾节点配对（OZ StandardMerkleTree 兼容）。
   - `getProof(index)` 收集各层兄弟节点。
3. **Root 一致性**：后端从 `whitelist.json` 计算 root 并暴露 `GET /root`；**部署合约时 merkleRoot 必须用该值**（部署脚本/手动以此为准，本计划不改合约部署脚本，仅在文档说明）。
4. **proof 获取**：前端 `GET {PROOF_API_BASE}/proof/:address` → `{address, leaf, proof, root}` 或 404 `{error}`。`PROOF_API_BASE` 来自 `NEXT_PUBLIC_AIRDROP_PROOF_API_BASE`（默认 `http://localhost:4001`）。
5. **支付代币 = MyTokenPermit**：复用 `getTokenAddress`，需用户在 `.env.local` 指向 MyTokenPermit 部署地址。permit 签名 EIP‑2612 domain `name = token.name()`（读链上）、`version="1"`、`chainId`、`verifyingContract = tokenAddress`；types `Permit(owner,spender,value,nonce,deadline)`；nonce 读 `nonces(owner)`。
6. **multicall**：前端用 viem `encodeFunctionData` 编码 `permitPrePay(amount,deadline,v,r,s)` 与 `claimNFT(listingId,proof)`，调用合约 `multicall(bytes[] calldata)`（OZ Multicall，内部 delegatecall，`msg.sender` 在两子调用中均为买家 EOA）。`payAmount = price / 2`。
7. **限领一次**：前端读 `claimed(account)`，已领取则禁用按钮并提示。
8. **页面范围**：完整页面（卖家上架/授权/取消 + 买家优惠购买 + 白名单状态 + 事件日志），镜像 `/nft-market-white` 布局。
9. **组件复用策略**：新建 `components/airdrop-merkle/` 平行目录（与现有 `nftmarket`/`nftmarket-permit` 一致的风格，避免跨特性耦合），各组件替换 ABI 与地址 getter 为 airdrop 版。
10. **CORS**：后端响应头 `Access-Control-Allow-Origin: *`，处理 `OPTIONS` 预检。
11. **不改动**：现有合约、`nftmarket*` 代码、`shared.ts`、`erc20Abi.ts`（新增独立的 `erc20PermitAbi.ts`）。

## Proposed Changes

### Part A — 后端 proof API（`wagmi-front/test/airdrop-merkle/`）

**A1. `whitelist.json`**：白名单地址清单 + 备注。
```json
{ "addresses": ["0x...", "0x..."], "note": "部署合约时 merkleRoot 须等于 GET /root 返回值" }
```

**A2. `server.mjs`**（ESM，原生 http + 手写 Merkle）：
- 依赖：`import { keccak256, concat, isAddress } from "viem"`（父级 node_modules 解析）。
- Merkle 函数：`leafHash(addr)`、`pairHash(a,b)`、`buildTree(leaves)`→`{root, layers}`、`getProof(layers, index)`。
- 从 `whitelist.json` 加载地址，校验 `isAddress`，去重小写，建树。
- 路由（原生 http，手写路由解析）：
  - `GET /health` → `{ok:true}`
  - `GET /root` → `{root}`
  - `GET /whitelist` → `{addresses, root}`
  - `GET /proof/:address` → 命中返回 `{address, leaf, proof:[...], root}`；未命中 404 `{error:"not in whitelist"}`
  - `OPTIONS *` → 204（CORS 预检）
- 响应头：`Content-Type: application/json; charset=utf-8`、`Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods: GET,OPTIONS`、`Access-Control-Allow-Headers: Content-Type`。
- 端口：`process.env.PORT ?? 4001`；启动日志打印 root 与端口。

**A3. `package.json`**：`{ "name":"airdrop-merkle-proof-api","private":true,"type":"module","scripts":{"start":"node server.mjs"} }`（无需 install，viem 由父级提供；若独立运行可 `npm i viem`）。

### Part B — 前端 ABI / 配置 / lib

**B1. `src/contracts/airdropMerkleNftMarketAbi.ts`**（新建，as const）：
- `erc721Abi`（ownerOf/approve/setApprovalForAll/isApprovedForAll/getApproved + Approval/Transfer event，复制自 nftMarketPermitAbi）。
- `airdropMerkleNftMarketAbi`：`paymentToken`、`merkleRoot`、`owner`、`claimed(address)`、`nextListingId`、`listings(uint256)`(tuple)、`list`、`cancelListing`、`buyNFT`、`permitPrePay(uint256,uint256,uint8,bytes32,bytes32)`、`claimNFT(uint256,bytes32[])`、`setMerkleRoot(bytes32)`、`multicall(bytes[])→bytes[]`、events `NFTListed/NFTSold/NFTListingCancelled/NFTClaimed/MerkleRootUpdated`。
- `airdropMerkleEvents`：仅事件子集（watchEvent 用）。

**B2. `src/contracts/erc20PermitAbi.ts`**（新建）：erc20 标准字段 + `nonces(address)→uint256`、`DOMAIN_SEPARATOR()→bytes32`、`permit(address,address,uint256,uint256,uint8,bytes32,bytes32)`。

**B3. `src/config/airdropMerkle.ts`**（新建，镜像 nftMarketPermit.ts）：
- `getAirdropMerkleAddress(chainId)` 读 `NEXT_PUBLIC_AIRDROP_MERKLE_MARKET_ADDRESS_{LOCAL|SEPOLIA|POLYGON|OPTIMISM}`。
- `getConfigOk/getConfigError`（同范式）。
- `getProofApiBase()` 读 `NEXT_PUBLIC_AIRDROP_PROOF_API_BASE`，默认 `http://localhost:4001`。

**B4. `src/lib/merkleApi.ts`**（新建）：
- `fetchProof(address): Promise<{ proof: \`0x${string}\`[]; root: \`0x${string}\` } | null>`：调 `{base}/proof/{address}`，200 返回 proof，404 返回 null，其它抛错。

### Part C — 前端 hooks（`src/hooks/airdrop-merkle/`）

**C1. `useListingsWagmi.ts`**：复制 nftmarket-permit 版，替换为 `getAirdropMerkleAddress` + `airdropMerkleNftMarketAbi`，返回 `ListingInfo[]`（类型引自 `@/components/airdrop-merkle/types`）。

**C2. `useAirdropMerkleEventsWagmi.ts`**：复制 nftmarket-permit 版，替换 ABI/地址；`toMarketLog` 增加 `NFTClaimed` 分支（buyer/seller/nftContract/tokenId/paidAmount）与 `MerkleRootUpdated`（newRoot）。

### Part D — 前端组件（`src/components/airdrop-merkle/`）

**D1. `types.ts`**：`MarketEventName = "NFTListed"|"NFTSold"|"NFTListingCancelled"|"NFTClaimed"|"MerkleRootUpdated"`；`MarketLog`（增 `paidAmount?: bigint`、`newRoot?: \`0x${string}\``）；`ListingInfo`、`RefreshFn`（同范式）。

**D2. `ListingsTable.tsx`**：复制自 nftmarket-permit（泛型，仅 import 路径改本地 `./types`）。

**D3. `ApproveNFTCard.tsx`**：复制自 nftmarket-permit 版，`setApprovalForAll(market,true)`，地址改为 `getAirdropMerkleAddress`，ABI 用本地 `erc721Abi`（from airdropMerkleNftMarketAbi）。

**D4. `ListCard.tsx`**：复制，`list(nftContract,tokenId,price)` 调 airdrop 市场。

**D5. `CancelCard.tsx`**：复制，`cancelListing(listingId)`。

**D6. `EventLogCard.tsx`**：复制，渲染含 NFTClaimed。

**D7. `WhitelistInfoCard.tsx`**（新建）：
- `useReadContract` 读 `merkleRoot()`、`claimed(account)`。
- `useEffect` 调 `fetchProof(account)` → `inWhitelist` + `proof` + `root`。
- 展示：链上 root、后端 root（一致校验提示）、当前用户是否在白名单、是否已领取、proof 预览（截断）。
- 提供「刷新白名单状态」按钮。

**D8. `ClaimNFTCard.tsx`**（核心，新建）：
- Props: `{ metadata, listings, refresh }`。
- 状态：`listingId`、`proof`（从 WhitelistInfoCard 或内部 fetch）、`status`/`txError`/`result`。
- 读：`claimed(account)`、token `name()`、`nonces(account)`、balance（可选）。
- 选中 listing → `payAmount = price / 2`，展示优惠价对比。
- `handleClaim` 流程：
  1. `deadline = BigInt(Math.floor(Date.now()/1000) + 3600)`
  2. `nonce = readContract(token, nonces, [account])`
  3. `sig = await walletClient.signTypedData({ account, domain:{name:tokenName,version:"1",chainId,verifyingContract:tokenAddress}, primaryType:"Permit", types:{Permit:[...]}, message:{owner:account, spender:market, value:payAmount, nonce, deadline} })`
  4. `{v,r,s} = splitSignature(sig)`
  5. `permitData = encodeFunctionData({ abi: airdropMerkleNftMarketAbi, functionName:"permitPrePay", args:[payAmount, deadline, v, r, s] })`
  6. `claimData = encodeFunctionData({ abi: airdropMerkleNftMarketAbi, functionName:"claimNFT", args:[listingId, proof] })`
  7. `writeContract({ address: market, abi, functionName:"multicall", args:[[permitData, claimData]] })`
- `useWaitForTransactionReceipt` → 成功后 `refresh()`、清空、`fetchProof` 重读 claimed。
- 校验：未连接 / 非白名单 / 已领取 / 未选 listing / 余额不足 → 禁用并提示。
- 按钮：“一键优惠购买（permit + multicall）”；显示 `price → payAmount` 对比。

### Part E — 页面 / 导航 / env

**E1. `src/app/airdrop-merkle/page.tsx`**（新建，镜像 nft-market-white/page.tsx）：
- header：← 首页、标题“NFT Airdrop (Merkle 白名单 50% 优惠)”、合约地址、`WalletBar`。
- 配置缺失提示卡（`getConfigError`）。
- 网格：`ApproveNFTCard` / `ListCard` / `CancelCard` / `WhitelistInfoCard` / `ClaimNFTCard`（核心，跨 2 列）/ `ListingsTable`（跨 3 列，`onSelectListing` 填入 ClaimNFTCard 的 listingId）。
- 底部：`EventLogCard`。
- 通过 `useState<bigint|null>` + `useCallback` 把选中 listingId 传给 ClaimNFTCard。

**E2. `src/app/page.tsx`**（编辑）：新增第三张卡片 Link → `/airdrop-merkle`，标题“NFT Airdrop (Merkle)”，描述“Merkle 白名单 + permit + multicall 50% 优惠购买”。

**E3. `wagmi-front/.env.local.example`**（编辑现有文件，追加，不新建）：
- 现状：已含 Token/TokenBank/NFTMarket/NFTMarketPermit/SimpleNft 各链变量（LOCAL 默认填了 MyERC20/TokenBank/NFTMarket/SimpleNft，NFTMarketPermit 留空）。
- 在每个链区块追加：`NEXT_PUBLIC_AIRDROP_MERKLE_MARKET_ADDRESS_{LOCAL|SEPOLIA|POLYGON|OPTIMISM}`（LOCAL 留空待填，注释说明需与后端 `/root` 对齐部署）。
- 在文件末尾“重要说明”前新增一节“白名单空投（airdrop-merkle）配置”：
  - `NEXT_PUBLIC_AIRDROP_PROOF_API_BASE=http://localhost:4001`（proof 后端地址）
  - 说明：合约 `merkleRoot` 必须等于后端 `GET /root` 返回值；支付代币沿用 `NEXT_PUBLIC_TOKEN_ADDRESS_*`（须为 MyTokenPermit）。
- 重要说明补一条：airdrop-merkle 市场构造时 paymentToken 须与 `NEXT_PUBLIC_TOKEN_ADDRESS_XXX` 一致。
- 后端端口 `PORT` 由 `wagmi-front/test/airdrop-merkle/server.mjs` 默认 4001，无需进前端 env（如需可加该目录内注释说明）。

## Verification Steps

1. **后端**：`cd wagmi-front/test/airdrop-merkle && node server.mjs`；`curl /root`、`curl /whitelist`、`curl /proof/<addr>`（命中/未命中）、`curl -X OPTIONS`（CORS）。用 viem 在 node REPL 或脚本里 `MerkleProof` 等价校验 root 与 proof 自洽。
2. **合约 root 对齐**：确保部署 `AirdropMerkleNFTMarket` 时 `merkleRoot` = 后端 `/root` 值（foundry script 或手动；不改脚本，仅核对）。
3. **前端构建**：`cd wagmi-front && npm run build`（或 `npm run dev`）无类型错误。
4. **端到端**（本地 foundry 31337）：
   - 卖家：授权 NFT → 上架（得 listingId）。
   - 买家（在 whitelist.json 内）：连接钱包 → WhitelistInfoCard 显示在白名单 → 选 listing → 一键优惠购买 → 钱包先签 permit 再发 multicall 交易 → 成功后 NFT 归买家、卖家收到 `price/2`、`claimed[buyer]=true`、listing 失活、事件日志出现 NFTClaimed+NFTSold。
   - 非/已领取用户：按钮禁用并提示。
5. **回归**：`/nft-market`、`/nft-market-white` 页面不受影响（仅新增文件 + 首页加 Link + 编辑 `.env.local.example`）。

## Out of Scope

- 不修改 `AirdropMerkleNFTMarket.sol` 及其测试、不改 foundry 部署脚本（仅在文档/注释说明 root 对齐方式）。
- 不引入 Express / merkletreejs（按用户要求原生 http + 手写）。
- 不做后端持久化/鉴权（演示用，监听 4001、CORS 全开）。
- 不实现 `setMerkleRoot` 的管理 UI（合约已支持，前端仅展示 root；如需可后续扩展）。
- 不创建 README（仅编辑现有 `.env.local.example`，不新增文档文件）。
