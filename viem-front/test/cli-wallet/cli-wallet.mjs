/**
 * CLI 钱包脚本 —— 基于 Viem.js
 *
 * 功能：
 *   1. 生成私钥 / 查询余额（ETH + ERC20）
 *   2. 构建 ERC20 transfer 的 EIP-1559 交易
 *   3. 用本地私钥对交易签名
 *   4. 发送交易到 Sepolia 网络
 *
 * 用法：
 *   node test/cli-wallet/cli-wallet.mjs
 *
 * 环境变量（可选）：
 *   SEPOLIA_RPC_URL   — Sepolia RPC 端点（默认 Alchemy 公共 RPC）
 *   ERC20_ADDRESS     — ERC20 代币合约地址
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const readline = require("readline");

import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  recoverAddress,
  hexToBytes,
  keccak256,
  concat,
  numberToHex,
  toHex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { sepolia } from "viem/chains";

// ============================================================
// 配置
// ============================================================

const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const ERC20_ADDRESS_DEFAULT = "0x86e03d015bFB9E9af17E76667FBf659bFfbD81F5"; // WETH 示例

const erc20Abi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ type: "string", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address", name: "account" }],
    outputs: [{ type: "uint256", name: "" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
    ],
    outputs: [{ type: "bool", name: "" }],
    stateMutability: "nonpayable",
  },
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

// ============================================================
// 工具函数
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function logDivider() {
  console.log("─".repeat(60));
}

// ============================================================
// 钱包状态
// ============================================================

let currentPrivateKey = null;
let currentAccount = null;

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// ============================================================
// 功能 1：生成私钥 & 查询余额
// ============================================================

async function generateKey() {
  logDivider();
  const choice = await ask("选择操作: [1] 生成新私钥  [2] 导入已有私钥: ");

  if (choice.trim() === "2") {
    let pk = await ask("请输入私钥（hex，可带或不带 0x 前缀）: ");
    pk = pk.trim();
    if (!pk.startsWith("0x")) pk = "0x" + pk;
    currentPrivateKey = pk;
  } else {
    currentPrivateKey = generatePrivateKey();
  }

  currentAccount = privateKeyToAccount(currentPrivateKey);

  console.log("\n✅ 账户已就绪");
  console.log(`   私钥: ${currentPrivateKey}`);
  console.log(`   地址: ${currentAccount.address}`);
  logDivider();
}

async function checkBalance() {
  if (!currentAccount) {
    console.log("❌ 请先生成或导入私钥（选项 1）");
    return;
  }

  logDivider();
  // ETH 余额
  const ethBalance = await publicClient.getBalance({
    address: currentAccount.address,
  });
  console.log(`📍 地址: ${currentAccount.address}`);
  console.log(`💰 ETH 余额: ${formatEther(ethBalance)} ETH`);

  // ERC20 余额
  const erc20Addr = await ask("输入 ERC20 合约地址（回车使用默认）: ");
  const tokenAddress = erc20Addr.trim() || ERC20_ADDRESS_DEFAULT;

  try {
    const [symbol, decimals, tokenBalance] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [currentAccount.address],
      }),
    ]);
    console.log(
      `🪙  ${symbol} 余额: ${formatUnits(tokenBalance, decimals)} ${symbol} (合约: ${tokenAddress})`
    );
  } catch (err) {
    console.log(`⚠️  读取 ERC20 余额失败: ${err.shortMessage || err.message}`);
  }
  logDivider();
}

// ============================================================
// 功能 2 & 3 & 4：构建 + 签名 + 发送 ERC20 EIP-1559 交易
// ============================================================

async function buildSignSendErc20Transfer() {
  if (!currentAccount) {
    console.log("❌ 请先生成或导入私钥（选项 1）");
    return;
  }

  logDivider();
  console.log("🏗️  构建 ERC20 Transfer EIP-1559 交易\n");

  // 收集参数
  const tokenAddressInput = await ask("ERC20 合约地址（回车使用默认）: ");
  const tokenAddress = tokenAddressInput.trim() || ERC20_ADDRESS_DEFAULT;

  const toAddress = await ask("转账目标地址: ");
  if (!toAddress.trim()) {
    console.log("❌ 目标地址不能为空");
    return;
  }

  const amountInput = await ask("转账金额（人类可读，如 1.5）: ");
  if (!amountInput.trim()) {
    console.log("❌ 金额不能为空");
    return;
  }

  // 读取 token decimals
  let decimals = 18;
  let symbol = "TOKEN";
  try {
    [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "symbol",
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
  } catch {
    console.log("⚠️  无法读取 token 信息，使用默认 decimals=18");
  }

  const value = parseUnits(amountInput.trim(), decimals);

  console.log(`\n📋 交易摘要:`);
  console.log(`   代币: ${symbol} (${tokenAddress})`);
  console.log(`   转出: ${currentAccount.address}`);
  console.log(`   转入: ${toAddress.trim()}`);
  console.log(`   金额: ${amountInput.trim()} ${symbol}`);

  // ── 步骤 2：构建 EIP-1559 交易 ──

  // 编码 transfer(to, value) 的 calldata
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [toAddress.trim(), value],
  });

  console.log(`\n📦 编码后的 calldata:`);
  console.log(`   ${data}`);

  // 估算 gas
  let gasEstimate;
  try {
    gasEstimate = await publicClient.estimateContractGas({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "transfer",
      args: [toAddress.trim(), value],
      account: currentAccount.address,
    });
  } catch (err) {
    console.log(`\n⚠️  Gas 估算失败（可能余额不足）: ${err.shortMessage || err.message}`);
    const manualGas = await ask("手动输入 gas limit（回车使用 100000）: ");
    gasEstimate = BigInt(manualGas.trim() || "100000");
  }

  // 获取 EIP-1559 fee 参数
  const block = await publicClient.getBlock();
  const feeHistory = await publicClient.getFeeHistory({
    blockCount: 5,
    rewardPercentiles: [25],
    newestBlock: "latest",
  });

  // 计算 baseFee 和 priorityFee
  const baseFee = block.baseFeePerGas ?? 1n;
  const priorityFees = feeHistory.reward.flat().filter((v) => v !== null);
  const maxPriorityFeePerGas =
    priorityFees.length > 0 ? priorityFees.reduce((a, b) => a + b, 0n) / BigInt(priorityFees.length) : 1_000_000_000n;
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  // 获取 nonce
  const nonce = await publicClient.getTransactionCount({
    address: currentAccount.address,
  });

  // 构建完整的 EIP-1559 交易对象
  const eip1559Tx = {
    type: "eip1559",
    chainId: sepolia.id,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: gasEstimate,
    to: tokenAddress,
    value: 0n,
    data,
  };

  console.log(`\n📝 EIP-1559 交易详情:`);
  console.log(`   type:            eip1559`);
  console.log(`   chainId:         ${eip1559Tx.chainId}`);
  console.log(`   nonce:           ${eip1559Tx.nonce}`);
  console.log(`   maxFeePerGas:    ${eip1559Tx.maxFeePerGas.toString()} (${Number(eip1559Tx.maxFeePerGas) / 1e9} Gwei)`);
  console.log(`   maxPriorityFee:  ${eip1559Tx.maxPriorityFeePerGas.toString()} (${Number(eip1559Tx.maxPriorityFeePerGas) / 1e9} Gwei)`);
  console.log(`   gasLimit:        ${eip1559Tx.gas.toString()}`);
  console.log(`   to:              ${eip1559Tx.to}`);
  console.log(`   value:           0 (ERC20 转账，ETH value=0)`);
  console.log(`   data:            ${eip1559Tx.data.slice(0, 40)}...`);

  // ── 步骤 3：签名 ──

  const confirmSign = await ask("\n✍️  是否对该交易签名？(y/n): ");
  if (confirmSign.trim().toLowerCase() !== "y") {
    console.log("🚫 已取消签名");
    return;
  }

  const walletClient = createWalletClient({
    account: currentAccount,
    chain: sepolia,
    transport: http(RPC_URL),
  });

  // 使用 viem 的 signTransaction 对 EIP-1559 交易签名
  const signedTx = await walletClient.signTransaction(eip1559Tx);

  console.log(`\n🔐 已签名的交易（raw hex）:`);
  console.log(`   ${signedTx.slice(0, 80)}...`);
  console.log(`   (全长 ${signedTx.length} 字符)`);

  // ── 步骤 4：发送到 Sepolia ──

  const confirmSend = await ask("\n📤 是否发送交易到 Sepolia？(y/n): ");
  if (confirmSend.trim().toLowerCase() !== "y") {
    console.log("🚫 已取消发送，签名交易已保存到内存");
    return;
  }

  // 使用 sendRawTransaction 发送已签名的交易
  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx,
  });

  console.log(`\n✅ 交易已发送！`);
  console.log(`   Tx Hash: ${txHash}`);
  console.log(`   Sepolia Etherscan: https://sepolia.etherscan.io/tx/${txHash}`);

  // 等待交易确认
  console.log(`\n⏳ 等待交易确认...`);
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });
    console.log(`\n🎉 交易已确认！`);
    console.log(`   区块号:   ${receipt.blockNumber.toString()}`);
    console.log(`   Gas 使用: ${receipt.gasUsed.toString()}`);
    console.log(`   状态:     ${receipt.status === "success" ? "✅ 成功" : "❌ 失败"}`);
  } catch (err) {
    console.log(`⚠️  等待确认超时或出错: ${err.shortMessage || err.message}`);
    console.log(`   可手动查看: https://sepolia.etherscan.io/tx/${txHash}`);
  }
  logDivider();
}

// ============================================================
// 主菜单
// ============================================================

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          CLI Wallet — Viem.js × Sepolia              ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Chain: Sepolia (ID: ${sepolia.id})\n`);

  while (true) {
    console.log("请选择操作:");
    console.log("  1 — 生成私钥 / 导入私钥");
    console.log("  2 — 查询余额（ETH + ERC20）");
    console.log("  3 — 构建 & 签名 & 发送 ERC20 Transfer (EIP-1559)");
    console.log("  0 — 退出\n");

    const choice = await ask("输入选项: ");

    switch (choice.trim()) {
      case "1":
        await generateKey();
        break;
      case "2":
        await checkBalance();
        break;
      case "3":
        await buildSignSendErc20Transfer();
        break;
      case "0":
        console.log("\n👋 再见！");
        rl.close();
        return;
      default:
        console.log("❌ 无效选项，请重新输入\n");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  rl.close();
  process.exit(1);
});
