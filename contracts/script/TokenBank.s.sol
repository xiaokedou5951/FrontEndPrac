// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {TokenBank} from "../src/TokenBank.sol";

contract TokenBankScript is Script {
    TokenBank public tokenBank;

    function run() public returns (TokenBank) {
        // 从环境变量读取部署私钥与代币地址
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");

        require(tokenAddress != address(0), "TokenBankScript: token address cannot be zero");

        vm.startBroadcast(privateKey);

        tokenBank = new TokenBank(tokenAddress);

        vm.stopBroadcast();

        console.log("TokenBank deployed at:", address(tokenBank));
        console.log("Underlying token    :", tokenAddress);

        return tokenBank;
    }
}
