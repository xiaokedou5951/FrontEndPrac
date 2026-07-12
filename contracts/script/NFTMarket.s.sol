// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {NFTMarket} from "../src/NFTMarket.sol";

contract NFTMarketScript is Script {
    NFTMarket public nftMarket;

    function run() public returns (NFTMarket) {
        // 从环境变量读取部署私钥与支付代币地址
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address paymentToken = vm.envAddress("TOKEN_ADDRESS");
        address deployer = vm.addr(privateKey);

        require(paymentToken != address(0), "NFTMarketScript: payment token cannot be zero");

        vm.startBroadcast(privateKey);

        nftMarket = new NFTMarket(paymentToken);

        vm.stopBroadcast();

        console.log("NFTMarket deployed at:", address(nftMarket));
        console.log("Payment token       :", paymentToken);
        console.log("Deployer            :", deployer);

        return nftMarket;
    }
}
