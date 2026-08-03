// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKAirdrop} from "../src/zk-airdrop/ZKAirdrop.sol";
import {Groth16Verifier} from "../src/zk-airdrop/Groth16Verifier.sol";

contract ZKAirdropScript is Script {
    function run() public returns (ZKAirdrop) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // 空投代币地址
        address tokenAddress = vm.envAddress("AIRDROP_TOKEN_ADDRESS");
        // Merkle 树根（由 generate_proof.js 输出）
        uint256 merkleRoot = vm.envUint("ZK_MERKLE_ROOT");
        // 每个地址空投数量（以 wei 为单位）
        uint256 airdropAmount = vm.envUint("AIRDROP_AMOUNT");

        require(tokenAddress != address(0), "ZKAirdropScript: token cannot be zero");
        require(merkleRoot != 0, "ZKAirdropScript: merkle root cannot be zero");
        require(airdropAmount > 0, "ZKAirdropScript: airdrop amount must be > 0");

        vm.startBroadcast(privateKey);

        // 1. 部署 Verifier 合约
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Groth16Verifier deployed at:", address(verifier));

        // 2. 部署 ZKAirdrop 合约
        ZKAirdrop airdrop = new ZKAirdrop(
            address(verifier),
            tokenAddress,
            merkleRoot,
            airdropAmount
        );
        console.log("ZKAirdrop deployed at:", address(airdrop));

        vm.stopBroadcast();

        console.log("Deployer:", deployer);
        console.log("Token:", tokenAddress);
        console.log("Merkle Root:", merkleRoot);
        console.log("Airdrop Amount:", airdropAmount);

        return airdrop;
    }
}
