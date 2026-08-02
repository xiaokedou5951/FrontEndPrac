// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AirdropMerkleNFTMarket} from "../src/airdrop-merkle/AirdropMerkleNFTMarket.sol";

contract AirdropMerkleNFTMarketScript is Script {
    AirdropMerkleNFTMarket public market;

    function run() public returns (AirdropMerkleNFTMarket) {
        // 从环境变量读取部署私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        // 支付代币地址（须为支持 EIP-2612 permit 的 MyTokenPermit）
        address paymentToken = vm.envAddress("MY_TOKEN_PERMIT_ADDRESS");
        // Merkle 树根（须等于 proof 后端 GET /root 返回值）
        bytes32 merkleRoot = vm.envBytes32("MERKLE_ROOT");

        require(paymentToken != address(0), "AirdropMerkleNFTMarketScript: payment token cannot be zero");
        require(merkleRoot != bytes32(0), "AirdropMerkleNFTMarketScript: merkle root cannot be zero");

        vm.startBroadcast(privateKey);

        market = new AirdropMerkleNFTMarket(paymentToken, merkleRoot);

        vm.stopBroadcast();

        console.log("AirdropMerkleNFTMarket deployed at:", address(market));
        console.log("Payment token (MyTokenPermit):", paymentToken);
        console.log("Merkle root                  :", vm.toString(merkleRoot));
        console.log("Deployer                     :", deployer);

        return market;
    }
}
