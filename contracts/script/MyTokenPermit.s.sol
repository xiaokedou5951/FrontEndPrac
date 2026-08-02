// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {MyTokenPermit} from "../src/airdrop-merkle/MyTokenPermit.sol";

contract MyTokenPermitScript is Script {
    MyTokenPermit public myTokenPermit;

    function run() public returns (MyTokenPermit) {
        // 从环境变量读取部署私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        // 由私钥推导出部署者地址（即广播交易的 from）
        address deployer = vm.addr(privateKey);

        // 初始供应量（whole tokens，构造函数内部会乘以 10^18），默认 1,000,000
        uint256 initialSupply = vm.envOr("TOKEN_INITIAL_SUPPLY", uint256(1_000_000));

        vm.startBroadcast(privateKey);

        myTokenPermit = new MyTokenPermit(initialSupply);

        vm.stopBroadcast();

        console.log("MyTokenPermit deployed at:", address(myTokenPermit));
        console.log("Initial supply (whole tokens):", initialSupply);
        console.log("Deployer:", deployer);
        // 构造函数会把 initialSupply * 1e18 个代币铸造给 msg.sender（即 deployer）
        console.log("Deployer minted balance:", myTokenPermit.balanceOf(deployer));

        return myTokenPermit;
    }
}
