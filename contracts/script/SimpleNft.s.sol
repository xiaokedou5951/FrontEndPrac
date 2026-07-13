// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SimpleNft} from "../src/SimpleNft.sol";

contract SimpleNftScript is Script {
    SimpleNft public simpleNft;

    function run() public returns (SimpleNft) {
        // 从环境变量读取部署私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);

        vm.startBroadcast(privateKey);

        simpleNft = new SimpleNft();

        vm.stopBroadcast();

        console.log("SimpleNft deployed at:", address(simpleNft));
        console.log("Deployer            :", deployer);

        return simpleNft;
    }
}
