#!/bin/bash
set -e

echo "🔧 本地生成 Powers of Tau 文件..."

# 进入 circuits 目录
cd "$(dirname "$0")/../circuits"

# 创建 ptau 目录
mkdir -p ptau
cd ptau

# 生成 ptau 文件（本地开发用，不用于生产）
echo "⚡ 生成 powersOfTau28_hez_final_15.ptau..."
npx snarkjs powersoftau new bn128 15 pot15_0000.ptau -v
npx snarkjs powersoftau contribute pot15_0000.ptau pot15_0001.ptau --name="First contribution" -v -e="random entropy"
npx snarkjs powersoftau prepare phase2 pot15_0001.ptau powersOfTau28_hez_final_15.ptau -v

# 清理临时文件
rm pot15_0000.ptau pot15_0001.ptau

echo "✅ Powers of Tau 文件生成完成!"
echo "📁 文件位置: circuits/ptau/powersOfTau28_hez_final_15.ptau"
