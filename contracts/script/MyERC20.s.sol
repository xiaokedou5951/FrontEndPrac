// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {MyERC20} from "../src/MyERC20.sol";

contract MyERC20Script is Script {
    MyERC20 public myERC20;

    function run() public returns (MyERC20) {
        // 从环境变量读取部署私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        // 由私钥推导出部署者地址（即广播交易的 from）
        address deployer = vm.addr(privateKey);

        // 代币名称与符号，未设置时使用默认值
        string memory name = vm.envOr("TOKEN_NAME", string("MyToken"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("MTK"));

        vm.startBroadcast(privateKey);

        myERC20 = new MyERC20(name, symbol);

        vm.stopBroadcast();

        console.log("MyERC20 deployed at:", address(myERC20));
        console.log("Name  :", name);
        console.log("Symbol:", symbol);
        console.log("Deployer:", deployer);

        // 构造函数会把 1,000,000 * 1e18 个代币铸造给 msg.sender（即 deployer）
        console.log("Deployer minted balance:", myERC20.balanceOf(deployer));

        return myERC20;
    }
}
