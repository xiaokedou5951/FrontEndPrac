// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./Groth16Verifier.sol";

/**
 * @title ZKAirdrop
 * @dev 基于零知识证明的白名单空投 ERC20 代币合约
 *
 * 用户通过 ZK 证明自己在白名单 Merkle 树中，无需暴露具体地址即可领取代币。
 * 使用 nullifier 机制防止同一地址重复领取。
 */
contract ZKAirdrop is Ownable {
    /// @notice ZK 证明验证器合约
    Groth16Verifier public verifier;

    /// @notice 空投的 ERC20 代币地址
    IERC20 public token;

    /// @notice Merkle 树根，用于白名单验证
    uint256 public merkleRoot;

    /// @notice 每个地址可领取的代币数量
    uint256 public airdropAmount;

    /// @notice 已使用的 nullifier，防止重复领取
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice 已领取的总代币数量
    uint256 public totalClaimed;

    /// @notice 事件：代币领取
    event TokensClaimed(address indexed recipient, uint256 amount, uint256 nullifierHash);

    /// @notice 事件：Merkle 根更新
    event MerkleRootUpdated(uint256 newRoot);

    /// @notice 事件：空投数量更新
    event AirdropAmountUpdated(uint256 newAmount);

    constructor(
        address _verifier,
        address _token,
        uint256 _merkleRoot,
        uint256 _airdropAmount
    ) Ownable(msg.sender) {
        require(_verifier != address(0), "ZKAirdrop: verifier cannot be zero address");
        require(_token != address(0), "ZKAirdrop: token cannot be zero address");
        require(_merkleRoot != 0, "ZKAirdrop: merkle root cannot be zero");
        require(_airdropAmount > 0, "ZKAirdrop: airdrop amount must be greater than zero");

        verifier = Groth16Verifier(_verifier);
        token = IERC20(_token);
        merkleRoot = _merkleRoot;
        airdropAmount = _airdropAmount;
    }

    /**
     * @dev 使用零知识证明领取空投代币
     * @param nullifierHash nullifier 哈希（公共信号，用于防重放）
     * @param pA ZK 证明 pA 部分 [2]
     * @param pB ZK 证明 pB 部分 [2][2]
     * @param pC ZK 证明 pC 部分 [2]
     */
    function claim(
        uint256 nullifierHash,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC
    ) external {
        // 1. 检查 nullifier 是否已被使用
        require(!nullifierUsed[nullifierHash], "ZKAirdrop: nullifier already used");

        // 2. 验证 ZK 证明
        //    公共信号: [merkleRoot, nullifierHash]
        uint256[2] memory publicSignals = [merkleRoot, nullifierHash];
        require(
            verifier.verifyProof(pA, pB, pC, publicSignals),
            "ZKAirdrop: invalid proof"
        );

        // 3. 标记 nullifier 为已使用
        nullifierUsed[nullifierHash] = true;

        // 4. 更新总领取数量
        totalClaimed += airdropAmount;

        // 5. 转移代币给领取者
        require(
            token.transfer(msg.sender, airdropAmount),
            "ZKAirdrop: transfer failed"
        );

        emit TokensClaimed(msg.sender, airdropAmount, nullifierHash);
    }

    /**
     * @dev 更新 Merkle 树根（仅 owner）
     */
    function setMerkleRoot(uint256 _merkleRoot) external onlyOwner {
        require(_merkleRoot != 0, "ZKAirdrop: merkle root cannot be zero");
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }

    /**
     * @dev 更新空投数量（仅 owner）
     */
    function setAirdropAmount(uint256 _airdropAmount) external onlyOwner {
        require(_airdropAmount > 0, "ZKAirdrop: airdrop amount must be greater than zero");
        airdropAmount = _airdropAmount;
        emit AirdropAmountUpdated(_airdropAmount);
    }

    /**
     * @dev 提取合约中剩余的代币（仅 owner，用于紧急恢复）
     */
    function withdrawTokens(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ZKAirdrop: cannot withdraw to zero address");
        require(
            token.transfer(to, amount),
            "ZKAirdrop: withdraw transfer failed"
        );
    }
}
