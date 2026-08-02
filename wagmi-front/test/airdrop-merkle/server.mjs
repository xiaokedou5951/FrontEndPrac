// 原生 Node http 服务：手写 Merkle 树（与 OpenZeppelin commutativeKeccak256 兼容），
// 为 airdrop-merkle 前端提供白名单 proof 接口。
//
// 运行：node server.mjs   （viem 从父级 wagmi-front/node_modules 解析）
// 端口：PORT 环境变量，默认 4001

import http from "node:http";
import { readFileSync } from "node:fs";
import { keccak256, concat, isAddress } from "viem";

// ---------- Merkle 树（手写，OZ 兼容） ----------

// 叶子 = keccak256(abi.encodePacked(addr)) = keccak256(20 字节地址)
function leafHash(addr) {
  return keccak256(addr);
}

// 配对哈希 = commutativeKeccak256(a, b)：排序后 keccak256(concat(a, b))
// a, b 为 bytes32 hex 字符串，字典序比较等价于字节序比较
function pairHash(a, b) {
  return a < b ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

// 构建树：每层节点数为奇数时复制末尾节点配对（OZ StandardMerkleTree 兼容）
function buildTree(addresses) {
  const leaves = addresses.map((a) => leafHash(a));
  if (leaves.length === 0) {
    return { root: "0x0000000000000000000000000000000000000000000000000000000000000000", layers: [], leaves };
  }
  const layers = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i];
      // 奇数层末尾节点与自身配对
      const b = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(pairHash(a, b));
    }
    layers.push(next);
    current = next;
  }
  return { root: current[0], layers, leaves };
}

// 取 index 处叶子的 proof（各层兄弟节点）
function getProof(layers, index) {
  const proof = [];
  for (let i = 0; i < layers.length - 1; i++) {
    const layer = layers[i];
    let siblingIndex;
    if (index % 2 === 0) {
      // 末尾且层为奇数长度时，兄弟即自身（已在 buildTree 处理为复制）
      siblingIndex = index + 1 < layer.length ? index + 1 : index;
    } else {
      siblingIndex = index - 1;
    }
    proof.push(layer[siblingIndex]);
    index = Math.floor(index / 2);
  }
  return proof;
}

// ---------- 加载白名单 ----------

const whitelistPath = new URL("./whitelist.json", import.meta.url);
const whitelistRaw = JSON.parse(readFileSync(whitelistPath, "utf-8"));
const addresses = Array.isArray(whitelistRaw?.addresses) ? whitelistRaw.addresses : [];

// 校验 + 去重（小写）
const seen = new Set();
const normalized = [];
for (const a of addresses) {
  if (!isAddress(a)) {
    console.warn(`[whitelist] 忽略非法地址: ${a}`);
    continue;
  }
  const lower = a.toLowerCase();
  if (seen.has(lower)) continue;
  seen.add(lower);
  normalized.push(lower);
}

const { root, layers, leaves } = buildTree(normalized);
const PORT = Number(process.env.PORT ?? 4001);

console.log(`[whitelist] 已加载 ${normalized.length} 个白名单地址`);
console.log(`[whitelist] merkleRoot = ${root}`);

// ---------- HTTP ----------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(json);
}

function notFound(res, body) {
  sendJson(res, 404, body);
}

const server = http.createServer((req, res) => {
  // CORS 预检
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }

  // GET /health
  if (pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /root
  if (pathname === "/root") {
    sendJson(res, 200, { root });
    return;
  }

  // GET /whitelist
  if (pathname === "/whitelist") {
    sendJson(res, 200, { addresses: normalized, root, count: normalized.length });
    return;
  }

  // GET /proof/:address
  if (pathname.startsWith("/proof/")) {
    const addr = decodeURIComponent(pathname.slice("/proof/".length)).toLowerCase();
    if (!isAddress(addr)) {
      sendJson(res, 400, { error: "invalid address" });
      return;
    }
    const index = normalized.indexOf(addr);
    if (index === -1) {
      notFound(res, { error: "not in whitelist", address: addr });
      return;
    }
    const proof = getProof(layers, index);
    sendJson(res, 200, {
      address: normalized[index],
      leaf: leaves[index],
      proof,
      root,
    });
    return;
  }

  notFound(res, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[airdrop-merkle proof api] listening on http://localhost:${PORT}`);
  console.log(`  GET /health | /root | /whitelist | /proof/:address`);
});
