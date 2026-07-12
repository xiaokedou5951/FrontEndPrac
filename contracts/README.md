## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Contracts

- `src/Counter.sol` — 示例合约
- `src/MyERC20.sol` — 带 `transferWithCallback` 回调的 ERC20，构造时向部署者铸造 1,000,000 * 1e18
- `src/TokenBank.sol` — 简单的 ERC20 存取款银行，构造时传入底层代币地址

## Environment

部署相关参数集中在 `.env`（已在 `.gitignore` 中，可放心填入私钥）。从 `.env.example` 复制：

```shell
cp .env.example .env
```

字段说明：

| 变量 | 用途 |
| --- | --- |
| `PRIVATE_KEY` | 部署/广播交易用的私钥 |
| `TOKEN_ADDRESS` | `TokenBank` 构造函数参数（底层 ERC20 地址） |
| `TOKEN_NAME` / `TOKEN_SYMBOL` | `MyERC20` 构造函数参数，未设置时回退为 `MyToken` / `MTK` |
| `RPC_URL` | 通用 RPC URL（本地默认 `http://127.0.0.1:8545`） |
| `SEPOLIA_RPC_URL` | Sepolia RPC，被 `foundry.toml` 中的 `sepolia` 别名引用 |

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

`forge script` 会自动加载当前目录的 `.env`，脚本中通过 `vm.envUint("PRIVATE_KEY")` 等读取配置，因此无需在命令行重复传私钥。

#### 本地 anvil

```shell
# 先启动 anvil（另开终端）
$ anvil

# 部署 Counter
$ forge script script/Counter.s.sol --rpc-url local --broadcast

# 部署 MyERC20（名称/符号读 .env，未设置时用默认值 MyToken / MTK）
$ forge script script/MyERC20.s.sol --rpc-url local --broadcast

# 部署 TokenBank（需先把 .env 里的 TOKEN_ADDRESS 改为真实 ERC20 地址）
$ forge script script/TokenBank.s.sol --rpc-url local --broadcast
```

#### Sepolia

先把 `.env` 中的 `SEPOLIA_RPC_URL` 替换为真实的 Infura/Alchemy 端点，`PRIVATE_KEY` 换成有测试币的账户私钥：

```shell
$ forge script script/Counter.s.sol --rpc-url sepolia --broadcast
```

### RPC Aliases

`foundry.toml` 中的 `[rpc_endpoints]` 定义了命名端点，可在 forge 命令里直接用别名引用（**不带 `$` 前缀**）：

```toml
[rpc_endpoints]
local  = "http://127.0.0.1:8545"
sepolia = "${SEPOLIA_RPC_URL}"
```

- CLI 引用别名：`--rpc-url local` / `--rpc-url sepolia`
- toml 中的 `${VAR}` 是 toml 层面的环境变量替换，运行时从 `.env` 取值，与 CLI 别名引用是两套不同机制

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
