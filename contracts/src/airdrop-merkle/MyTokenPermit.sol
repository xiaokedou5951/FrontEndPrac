// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// 定义接收代币回调的接口
interface ITokenReceiver {
    function tokensReceived(address from, uint256 amount, bytes calldata data) external returns (bool);
}

/**
 * @title MyTokenPermit
 * @dev ERC20 Token with EIP-2612 Permit support for gasless approvals
 *
 * Features:
 * - ERC20 standard token
 * - EIP-2612 Permit: Off-chain approval signatures
 * - Burnable: Tokens can be burned
 * - Ownable: Only owner can mint
 */
contract MyTokenPermit is ERC20, ERC20Permit, ERC20Burnable, Ownable {
    uint8 private _decimals;

    /**
     * @dev Constructor that gives msg.sender all of initial supply
     * @param initialSupply Initial token supply (in whole tokens, will be multiplied by 10^18)
     */
    constructor(uint256 initialSupply)
        ERC20("MyTokenPermit", "MTKP")
        ERC20Permit("MyTokenPermit")
        Ownable(msg.sender)
    {
        _decimals = 18;
        _mint(msg.sender, initialSupply * 10 ** decimals());
    }

    /**
     * @dev Returns the number of decimals used for token amounts
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Mint new tokens (only owner can call)
     * @param to Address to receive the minted tokens
     * @param amount Amount of tokens to mint (in wei units)
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    // 添加带有回调功能的转账函数，支持传递数据
    function transferWithCallbackAndData(address _to, uint256 _value, bytes calldata _data) external returns (bool){
        // 执行转账
        transfer(_to, _value);
        
        // 如果接收方是合约，调用其tokensReceived方法
        if (_to.code.length > 0) {
            // try-catch 结构：调用接收方合约的 tokensReceived 回调函数
            // 采用 EIP-223 风格的接收者回调模式，让合约接收方在收到代币时执行自定义逻辑
            try ITokenReceiver(_to).tokensReceived(msg.sender, _value, _data) returns (bool success) {
                // 回调成功返回，但必须验证返回值为 true
                // 防止恶意合约返回 false 绕过回调验证
                require(success, "ERC20: tokensReceived callback returned false");
            } catch Error(string memory reason) {
                // 捕获高级错误：当外部合约使用 revert("message") 抛出错误时
                // 将错误信息原样传递给调用者，保持错误链的完整性
                revert(reason);
            } catch (bytes memory lowLevelData) {
                // 捕获低级错误：当外部合约使用汇编 revert、assert 失败、或其他低级操作抛出错误时
                // lowLevelData 是原始的错误数据（bytes memory 类型）
                // bytes memory 在内存中的布局：前 32 字节存储长度，之后是实际数据
                assembly {
                    // add(lowLevelData, 0x20): 跳过前 32 字节的长度字段，指向实际错误信息的起始地址
                    // mload(lowLevelData): 读取前 32 字节，获取错误信息的长度
                    // revert(p, s): 从地址 p 开始回滚，回滚数据长度为 s
                    // 作用：将原始的低级错误数据原样回滚给调用者
                    revert(add(lowLevelData, 0x20), mload(lowLevelData))
                }
            }
        }
        
        return true;
    }
}
