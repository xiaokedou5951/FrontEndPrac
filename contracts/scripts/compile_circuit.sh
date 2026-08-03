#!/bin/bash
set -e

echo "🔧 编译零知识证明电路..."

# 进入 contracts 目录
cd "$(dirname "$0")/.."

# 创建构建目录
mkdir -p circuits/build
cd circuits/build

# 1. 编译电路
echo "📝 编译电路..."
circom ../whitelist.circom --r1cs --wasm --sym --c

# 2. 生成证明密钥 (Groth16)
echo "🔑 生成证明密钥..."
npx snarkjs groth16 setup whitelist.r1cs ../ptau/powersOfTau28_hez_final_15.ptau whitelist_0000.zkey

# 3. 贡献仪式
echo "🎭 贡献仪式..."
npx snarkjs zkey contribute whitelist_0000.zkey whitelist_0001.zkey --name="1st Contributor Name" -v -e="random entropy"

# 4. 导出验证密钥
echo "🔓 导出验证密钥..."
npx snarkjs zkey export verificationkey whitelist_0001.zkey verification_key.json

# 5. 生成 Verifier 合约
echo "📜 生成 Verifier 合约..."
npx snarkjs zkey export solidityverifier whitelist_0001.zkey Verifier.sol

# 6. 移动 Verifier 合约到 src 目录
echo "📦 移动 Verifier 合约..."
mv Verifier.sol ../../src/zk-airdrop/Groth16Verifier.sol

echo "✅ 电路编译完成!"
echo "📁 输出文件:"
echo "  - circuits/build/whitelist_js/whitelist.wasm"
echo "  - circuits/build/whitelist_0001.zkey"
echo "  - circuits/build/verification_key.json"
echo "  - src/zk-airdrop/Groth16Verifier.sol"
