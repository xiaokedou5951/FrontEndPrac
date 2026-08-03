#!/bin/bash
set -e

echo "📥 下载 Powers of Tau 文件..."

# 进入 circuits 目录
cd "$(dirname "$0")/../circuits"

# 创建 ptau 目录
mkdir -p ptau
cd ptau

# 下载 Powers of Tau 28 (支持最多 2^15 约束)
# 这是 Hermez 的 trusted setup 文件
if [ ! -f powersOfTau28_hez_final_15.ptau ]; then
    echo "⏬ 下载 powersOfTau28_hez_final_15.ptau..."
    curl -L -o powersOfTau28_hez_final_15.ptau https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau
    echo "✅ 下载完成!"
else
    echo "✅ 文件已存在，跳过下载"
fi

echo "📁 Powers of Tau 文件位置: circuits/ptau/powersOfTau28_hez_final_15.ptau"
