// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {NFTMarketPermit} from "../src/NFTMarketPermit.sol";

contract NFTMarketPermitScript is Script {
    NFTMarketPermit public nftMarketPermit;

    function run() public returns (NFTMarketPermit) {
        // 从环境变量读取部署私钥、支付代币地址和签名地址
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address paymentToken = vm.envAddress("TOKEN_ADDRESS");
        address signerAddress = vm.envAddress("SIGNER_ADDRESS");
        address deployer = vm.addr(privateKey);

        require(paymentToken != address(0), "NFTMarketPermitScript: payment token cannot be zero");
        require(signerAddress != address(0), "NFTMarketPermitScript: signer cannot be zero");

        vm.startBroadcast(privateKey);

        nftMarketPermit = new NFTMarketPermit(paymentToken, signerAddress);

        vm.stopBroadcast();

        console.log("NFTMarketPermit deployed at:", address(nftMarketPermit));
        console.log("Payment token           :", paymentToken);
        console.log("Signer address          :", signerAddress);
        console.log("Deployer                :", deployer);

        return nftMarketPermit;
    }
}
