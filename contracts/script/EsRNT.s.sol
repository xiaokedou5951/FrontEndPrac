// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {esRNT} from "../src/EsRNT.sol";

contract EsRNTScript is Script {
    esRNT public esRNT_;

    function run() public returns (esRNT) {
        // 从环境变量读取部署私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        // 构造函数内会向 _locks 数组 push 11 条 LockInfo
        esRNT_ = new esRNT();

        vm.stopBroadcast();

        console.log("esRNT deployed at:", address(esRNT_));
        console.log("Deployer           :", deployer);

        return esRNT_;
    }
}
