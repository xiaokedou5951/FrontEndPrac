const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");

async function main() {
    console.log("🔧 生成零知识证明...");

    // 1. 构建 Poseidon hash 函数
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // 2. 配置参数
    const MERKLE_TREE_DEPTH = 20;
    const whitelistAddresses = [
        "0x1234567890123456789012345678901234567890",
        "0x2345678901234567890123456789012345678901",
        "0x3456789012345678901234567890123456789012",
        "0x4567890123456789012345678901234567890123",
    ];

    // 3. 生成稀疏 Merkle 树（只存储非零节点）
    console.log("🌳 构建稀疏 Merkle 树...");
    const leaves = whitelistAddresses.map(addr => BigInt(addr));
    const tree = buildSparseMerkleTree(leaves, MERKLE_TREE_DEPTH, poseidon, F);

    // 4. 选择第一个地址作为证明者
    const proverIndex = 0;
    const proverAddress = whitelistAddresses[proverIndex];
    const proverAddressBigInt = BigInt(proverAddress);

    // 5. 生成 secret 和 nullifier
    const secret = BigInt("0x" + crypto.randomBytes(16).toString("hex"));
    const nullifier = poseidon([F.e(secret.toString()), F.e(proverAddressBigInt.toString())]);
    const nullifierHash = F.toString(nullifier);

    console.log("🔑 证明者地址:", proverAddress);
    console.log("🔐 Nullifier Hash:", nullifierHash);

    // 6. 获取 Merkle 路径
    const { siblings, pathIndices } = getMerklePath(tree, proverIndex, MERKLE_TREE_DEPTH, poseidon, F);

    // 7. 准备电路输入（所有值转为字符串）
    const input = {
        merkleRoot: F.toString(tree.root),
        nullifierHash: nullifierHash,
        address: proverAddressBigInt.toString(),
        secret: secret.toString(),
        pathElements: siblings.map(s => F.toString(s)),
        pathIndices: pathIndices.map(i => i.toString()),
    };

    console.log("📝 电路输入已准备");
    console.log("🌳 Merkle Root:", input.merkleRoot);

    // 8. 加载电路和证明密钥
    const wasmPath = path.join(__dirname, "../circuits/build/whitelist_js/whitelist.wasm");
    const zkeyPath = path.join(__dirname, "../circuits/build/whitelist_0001.zkey");

    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        console.error("❌ 错误: 请先运行 compile_circuit.sh 编译电路");
        process.exit(1);
    }

    // 9. 生成证明
    console.log("⚡ 生成 ZK 证明...");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath,
        zkeyPath
    );

    console.log("✅ 证明生成成功!");

    // 10. 保存证明和公共信号
    const outputDir = path.join(__dirname, "../circuits/build");
    fs.writeFileSync(
        path.join(outputDir, "proof.json"),
        JSON.stringify(proof, null, 2)
    );
    fs.writeFileSync(
        path.join(outputDir, "public.json"),
        JSON.stringify(publicSignals, null, 2)
    );

    console.log("💾 证明已保存到 circuits/build/proof.json");
    console.log("💾 公共信号已保存到 circuits/build/public.json");

    // 11. 验证证明
    console.log("🔍 验证证明...");
    const vKeyPath = path.join(__dirname, "../circuits/build/verification_key.json");
    const vKey = JSON.parse(fs.readFileSync(vKeyPath, "utf8"));

    const valid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (valid) {
        console.log("✅ 证明验证成功!");
    } else {
        console.error("❌ 证明验证失败!");
        process.exit(1);
    }

    // 12. 生成 Solidity calldata
    console.log("📜 生成 Solidity calldata...");
    const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

    // 直接从 proof 和 publicSignals 对象构建 calldata
    const solidityCalldata = {
        nullifierHash: publicSignals[1],
        pA: [proof.pi_a[0], proof.pi_a[1]],
        pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
        pC: [proof.pi_c[0], proof.pi_c[1]],
        merkleRoot: publicSignals[0],
    };

    fs.writeFileSync(
        path.join(outputDir, "calldata.json"),
        JSON.stringify(solidityCalldata, null, 2)
    );
    fs.writeFileSync(
        path.join(outputDir, "calldata.txt"),
        calldataStr
    );
    console.log("💾 Calldata 已保存到 circuits/build/calldata.json");
    console.log("💾 原始 Calldata 已保存到 circuits/build/calldata.txt");

    // 13. 输出合约部署信息
    console.log("\n📋 合约部署信息:");
    console.log("Merkle Root:", solidityCalldata.merkleRoot);
    console.log("Nullifier Hash:", solidityCalldata.nullifierHash);
    console.log("\n📋 调用 claim 函数的参数:");
    console.log("  nullifierHash:", solidityCalldata.nullifierHash);
    console.log("  pA:", JSON.stringify(solidityCalldata.pA));
    console.log("  pB:", JSON.stringify(solidityCalldata.pB));
    console.log("  pC:", JSON.stringify(solidityCalldata.pC));
}

/**
 * 构建稀疏 Merkle 树
 * 只存储非零节点，使用默认空哈希填充未使用的叶子
 */
function buildSparseMerkleTree(leaves, depth, poseidon, F) {
    // 计算每层的默认空哈希
    const defaultHashes = [];
    defaultHashes[0] = F.e(0); // 空叶子
    for (let i = 1; i <= depth; i++) {
        defaultHashes[i] = poseidon([defaultHashes[i - 1], defaultHashes[i - 1]]);
    }

    // 使用 Map 存储每层的节点 (key: index, value: hash)
    const layers = [];
    const leafLayer = new Map();
    for (let i = 0; i < leaves.length; i++) {
        leafLayer.set(i, F.e(leaves[i].toString()));
    }
    layers[0] = leafLayer;

    // 逐层向上构建
    for (let level = 0; level < depth; level++) {
        const currentLayer = layers[level];
        const nextLayer = new Map();
        const parentCount = Math.ceil((currentLayer.size > 0 ? Math.max(...currentLayer.keys()) + 1 : 0) / 2);

        // 只计算有非默认子节点的父节点
        const processedParents = new Set();
        for (const [idx] of currentLayer) {
            const parentIdx = Math.floor(idx / 2);
            if (processedParents.has(parentIdx)) continue;
            processedParents.add(parentIdx);

            const leftIdx = parentIdx * 2;
            const rightIdx = leftIdx + 1;
            const left = currentLayer.get(leftIdx) || defaultHashes[level];
            const right = currentLayer.get(rightIdx) || defaultHashes[level];
            const parent = poseidon([left, right]);
            nextLayer.set(parentIdx, parent);
        }

        layers[level + 1] = nextLayer;
    }

    const root = layers[depth].get(0) || defaultHashes[depth];

    return { layers, root, defaultHashes };
}

/**
 * 获取 Merkle 路径
 */
function getMerklePath(tree, leafIndex, depth, poseidon, F) {
    const siblings = [];
    const pathIndices = [];

    let currentIndex = leafIndex;

    for (let level = 0; level < depth; level++) {
        const layer = tree.layers[level];
        const isRight = currentIndex % 2 === 1;
        const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

        const sibling = layer.get(siblingIndex) || tree.defaultHashes[level];
        siblings.push(sibling);
        pathIndices.push(isRight ? 1 : 0);

        currentIndex = Math.floor(currentIndex / 2);
    }

    return { siblings, pathIndices };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
