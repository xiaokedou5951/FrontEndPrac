// SimpleNft 铸造脚本 —— 为 NFTMarket 测试准备 NFT 资产
//
// 运行：
//   node test/nftmarket/mint-nfts.mjs
//
// 通过环境变量覆盖默认值（见文末 README）：
//   MINT_COUNT=10 MINT_TO=0x... node test/nftmarket/mint-nfts.mjs

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  getAddress,
  formatEther,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ---------- 加载 .env.local（与前端共用一份配置） ----------
// Node 不会自动加载 .env.local（那是 Next.js 的能力），这里手动解析。
// 已存在的 process.env 优先（CLI 覆盖文件）。

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envLocalPath = path.resolve(__dirname, "../../.env.local");

function loadEnvLocal(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return; // 文件不存在则跳过，回退到代码内默认值
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 去掉两端配对的引号
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

// ---------- 配置（环境变量 -> 默认值） ----------

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);

// SimpleNft 合约地址：优先 NEXT_PUBLIC_SIMPLE_NFT_ADDRESS（与前端共用）
const SIMPLE_NFT_ADDRESS = getAddress(
  process.env.SIMPLE_NFT_ADDRESS ??
    process.env.NEXT_PUBLIC_SIMPLE_NFT_ADDRESS ??
    "0x95401dc811bb5740090279Ba06cfA8fcF6113778",
);

// NFTMarket 合约地址：优先 NEXT_PUBLIC_NFT_MARKET_ADDRESS（与前端共用）
const NFT_MARKET_ADDRESS = getAddress(
  process.env.NFT_MARKET_ADDRESS ??
    process.env.NEXT_PUBLIC_NFT_MARKET_ADDRESS ??
    "0xf5059a5D33d5853360D16C683c16e67980206f36",
);

// 铸造者私钥（默认 anvil 账户 #0）
const MINTER_PRIVATE_KEY =
  process.env.MINTER_PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// NFT 接收地址（默认 = 铸造者自己）
const MINT_TO = process.env.MINT_TO
  ? getAddress(process.env.MINT_TO)
  : undefined; // 留空则在运行时从私钥推导

// 铸造数量与起始 tokenId
const MINT_COUNT = Number(process.env.MINT_COUNT ?? 5);
const MINT_START_ID = Number(process.env.MINT_START_ID ?? 1);

// 是否顺便给 NFTMarket 做 setApprovalForAll（默认开启，便于后续 list）
const APPROVE_MARKET = (process.env.APPROVE_MARKET ?? "1") !== "0";

// ---------- ABI ----------

const simpleNftAbi = parseAbi([
  "function mint(address to, uint256 tokenId) external",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) external view returns (bool)",
  "function getApproved(uint256 tokenId) external view returns (address)",
]);

// ---------- 客户端 ----------

const chain =
  CHAIN_ID === 31337
    ? foundry
    : defineChain({
        id: CHAIN_ID,
        name: "Custom Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
        testnet: true,
      });

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  chain,
  transport: http(RPC_URL),
  account: privateKeyToAccount(MINTER_PRIVATE_KEY),
});

const minter = walletClient.account.address;
const recipient = MINT_TO ?? minter;

// ---------- 工具 ----------

function short(addr) {
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function log(label, value) {
  console.log(`${"".padEnd(22)}${label.padEnd(20)}${value}`);
}

async function waitForTx(hash, label) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`交易 revert: ${label} (hash=${hash})`);
  }
  return receipt;
}

// ---------- 主流程 ----------

async function main() {
  console.log("\n========================================");
  console.log(" SimpleNft 铸造脚本 (用于 NFTMarket 测试)");
  console.log("========================================");

  const minterBalance = await publicClient.getBalance({ address: minter });

  console.log("\n— 配置 —");
  log("RPC", RPC_URL);
  log("Chain ID", String(chain.id));
  log("SimpleNft", SIMPLE_NFT_ADDRESS);
  if (NFT_MARKET_ADDRESS) log("NFTMarket", NFT_MARKET_ADDRESS);
  log("Minter", `${short(minter)}`);
  log("Minter ETH", formatEther(minterBalance));
  log("Recipient", `${short(recipient)}${recipient === minter ? "  (= minter)" : ""}`);
  log("Mint count", String(MINT_COUNT));
  log("Start tokenId", String(MINT_START_ID));
  log("Approve market", APPROVE_MARKET ? "yes (setApprovalForAll)" : "no");

  if (recipient === minter && MINTER_PRIVATE_KEY.startsWith("0xac09")) {
    console.log("\n  ⚠️  使用 anvil 默认私钥，仅供本地测试。切勿用于主网。");
  }

  const tokenIds = Array.from(
    { length: MINT_COUNT },
    (_, i) => BigInt(MINT_START_ID + i),
  );

  // ---- 铸造 ----
  console.log("\n— 铸造 NFT —");
  const minted = [];
  for (const tokenId of tokenIds) {
    const hash = await walletClient.writeContract({
      address: SIMPLE_NFT_ADDRESS,
      abi: simpleNftAbi,
      functionName: "mint",
      args: [recipient, tokenId],
    });
    await waitForTx(hash, `mint(#${tokenId})`);

    // 链上回读校验
    const ownerOnChain = await publicClient.readContract({
      address: SIMPLE_NFT_ADDRESS,
      abi: simpleNftAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });

    const ok = ownerOnChain.toLowerCase() === recipient.toLowerCase();
    minted.push({ tokenId, owner: ownerOnChain, ok });
    console.log(
      `  #${String(tokenId).padStart(4)}  tx=${short(hash)}  owner=${short(ownerOnChain)}  ${ok ? "✓" : "✗ OWNER MISMATCH"}`,
    );
  }

  // ---- 授权 NFTMarket ----
  let approved = false;
  if (APPROVE_MARKET && NFT_MARKET_ADDRESS) {
    console.log("\n— 给 NFTMarket 授权 (setApprovalForAll) —");

    const before = await publicClient.readContract({
      address: SIMPLE_NFT_ADDRESS,
      abi: simpleNftAbi,
      functionName: "isApprovedForAll",
      args: [recipient, NFT_MARKET_ADDRESS],
    });

    if (before) {
      console.log(`  已授权，跳过。operator=${short(NFT_MARKET_ADDRESS)}`);
      approved = true;
    } else {
      // 如果 recipient 不是 minter，需要用 recipient 的私钥来授权；
      // 这里默认 recipient === minter，否则提示用户单独执行。
      if (recipient.toLowerCase() !== minter.toLowerCase()) {
        console.log(
          `  ⚠️  recipient (${short(recipient)}) ≠ minter (${short(minter)})，跳过授权。`,
        );
        console.log(`     请用 recipient 的私钥单独调用 setApprovalForAll。`);
      } else {
        const hash = await walletClient.writeContract({
          address: SIMPLE_NFT_ADDRESS,
          abi: simpleNftAbi,
          functionName: "setApprovalForAll",
          args: [NFT_MARKET_ADDRESS, true],
        });
        await waitForTx(hash, "setApprovalForAll");

        const after = await publicClient.readContract({
          address: SIMPLE_NFT_ADDRESS,
          abi: simpleNftAbi,
          functionName: "isApprovedForAll",
          args: [recipient, NFT_MARKET_ADDRESS],
        });
        approved = after;
        console.log(
          `  tx=${short(hash)}  isApprovedForAll=${after}  ${after ? "✓" : "✗ FAILED"}`,
        );
      }
    }
  }

  // ---- 汇总 ----
  const successCount = minted.filter((m) => m.ok).length;
  console.log("\n— 汇总 —");
  log("Minted", `${successCount}/${minted.length} 成功`);
  log("Token IDs", `${MINT_START_ID}..${MINT_START_ID + MINT_COUNT - 1}`);
  log("Owner", short(recipient));
  if (APPROVE_MARKET && NFT_MARKET_ADDRESS) {
    log("Market approved", approved ? "yes ✓" : "no ✗");
  }

  console.log("\n下一步：");
  console.log(`  1. 在 NFTMarket 页面用 ${short(recipient)} 连接钱包`);
  console.log(`     (若用 MetaMask，需先导入对应私钥)`);
  console.log(`  2. 调用 NFTMarket.list(SimpleNft, tokenId, price) 上架`);
  console.log(`  3. 用另一个账户调用 buyNFT(listingId) 购买`);
  console.log("     (购买前买家需先 approve MyERC20 给 NFTMarket)\n");

  if (successCount !== minted.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("\n✗ 脚本失败:");
  console.error(err);
  process.exit(1);
});
