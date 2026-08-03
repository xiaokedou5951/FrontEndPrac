pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * @title MerkleTreeChecker
 * @dev 验证叶子节点是否在 Merkle 树中
 * @param nLevels Merkle 树深度
 */
template MerkleTreeChecker(nLevels) {
    signal input leaf;
    signal input root;
    signal input siblings[nLevels];
    signal input pathIndices[nLevels];

    signal hashes[nLevels + 1];
    signal diff[nLevels];
    signal sel[nLevels];   // pathIndices[i] * diff[i]
    signal leftInput[nLevels];
    signal rightInput[nLevels];
    hashes[0] <== leaf;

    component hasher[nLevels];

    for (var i = 0; i < nLevels; i++) {
        // 根据 pathIndices[i] 决定左右子节点顺序
        // pathIndices[i] == 0: 当前节点在左，兄弟在右
        // pathIndices[i] == 1: 兄弟在左，当前节点在右
        //
        // 使用中间信号确保约束是二次的
        diff[i] <== siblings[i] - hashes[i];
        sel[i] <== pathIndices[i] * diff[i];
        leftInput[i] <== hashes[i] + sel[i];
        rightInput[i] <== siblings[i] - sel[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== leftInput[i];
        hasher[i].inputs[1] <== rightInput[i];
        hashes[i + 1] <== hasher[i].out;
    }

    root === hashes[nLevels];
}

/**
 * @title WhitelistProof
 * @dev 零知识证明：证明某个地址在白名单 Merkle 树中
 * 公共输入：merkleRoot, nullifierHash
 * 私有输入：address, secret, pathElements[], pathIndices[]
 */
template WhitelistProof(nLevels) {
    signal input merkleRoot;
    signal input nullifierHash;

    signal input address;
    signal input secret;
    signal input pathElements[nLevels];
    signal input pathIndices[nLevels];

    // 1. 验证 Merkle 树证明
    component merkleChecker = MerkleTreeChecker(nLevels);
    merkleChecker.leaf <== address;
    merkleChecker.root <== merkleRoot;
    for (var i = 0; i < nLevels; i++) {
        merkleChecker.siblings[i] <== pathElements[i];
        merkleChecker.pathIndices[i] <== pathIndices[i];
    }

    // 2. 计算 nullifier = Poseidon(secret, address)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== address;

    nullifierHash === nullifierHasher.out;
}

// 主电路：20 层 Merkle 树（支持约 100 万地址）
component main {public [merkleRoot, nullifierHash]} = WhitelistProof(20);
