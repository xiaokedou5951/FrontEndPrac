#!/bin/bash

# ERC20 代币转账测试脚本
#
# 用法：
#   ./test/erc20-index-tx/transfer-tokens.sh
#
# 环境变量覆盖：
#   TRANSFER_COUNT=10 ./test/erc20-index-tx/transfer-tokens.sh

set -e

# ========== 加载环境变量 ==========

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.local"

# 加载 .env.local
if [ -f "$ENV_FILE" ]; then
    echo "加载配置: $ENV_FILE"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "⚠️  未找到 .env.local，使用默认配置"
fi

# ========== 配置（环境变量 -> 默认值） ==========

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
TOKEN_ADDRESS="${NEXT_PUBLIC_TOKEN_ADDRESS:-0xE6E340D132b5f46d1e472DebcD681B2aBc16e57E}"

# 使用 anvil 默认账户
# Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (发送方)
# Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (接收方 1)
# Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (接收方 2)
SENDER_PRIVATE_KEY="${SENDER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
SENDER_ADDRESS="${SENDER_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
RECEIVER1_ADDRESS="${RECEIVER1_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
RECEIVER2_ADDRESS="${RECEIVER2_ADDRESS:-0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC}"

TRANSFER_COUNT="${TRANSFER_COUNT:-5}"
AMOUNT_PER_TRANSFER="${AMOUNT_PER_TRANSFER:-1000000000000000000}"  # 1 token (18 decimals)

# ========== 工具函数 ==========

short_addr() {
    echo "${1:0:10}...${1: -6}"
}

# ========== 检查依赖 ==========

echo ""
echo "========================================"
echo " ERC20 代币转账测试脚本"
echo "========================================"

# 检查 cast
if ! command -v cast &> /dev/null; then
    echo "✗ 错误: 未安装 cast 命令"
    echo "  请先安装 Foundry: https://book.getfoundry.sh/getting-started/installation"
    exit 1
fi

echo ""
echo "— 配置 —"
echo "  RPC URL:           $RPC_URL"
echo "  Token Address:     $TOKEN_ADDRESS"
echo "  Sender:            $(short_addr "$SENDER_ADDRESS")"
echo "  Receiver 1:        $(short_addr "$RECEIVER1_ADDRESS")"
echo "  Receiver 2:        $(short_addr "$RECEIVER2_ADDRESS")"
echo "  Transfer Count:    $TRANSFER_COUNT"
echo "  Amount/Transfer:   $AMOUNT_PER_TRANSFER wei"

# 检查 RPC 连接
echo ""
echo "— 检查 RPC 连接 —"
if ! cast chain-id --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    echo "✗ 无法连接 RPC 节点: $RPC_URL"
    echo "  请确保 anvil 已启动: anvil"
    exit 1
fi

CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL")
echo "  ✓ 已连接 (Chain ID: $CHAIN_ID)"

# ========== 查询初始状态 ==========

echo ""
echo "— 查询初始余额 —"

SENDER_BALANCE=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$SENDER_ADDRESS" --rpc-url "$RPC_URL")
RECEIVER1_BALANCE=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$RECEIVER1_ADDRESS" --rpc-url "$RPC_URL")
RECEIVER2_BALANCE=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$RECEIVER2_ADDRESS" --rpc-url "$RPC_URL")

echo "  Sender Balance:    $SENDER_BALANCE"
echo "  Receiver1 Balance: $RECEIVER1_BALANCE"
echo "  Receiver2 Balance: $RECEIVER2_BALANCE"

# ========== 执行转账 ==========

echo ""
echo "— 开始转账测试 —"
echo ""

for i in $(seq 1 "$TRANSFER_COUNT"); do
    # 交替发送给两个接收方
    if [ $((i % 2)) -eq 1 ]; then
        RECEIVER="$RECEIVER1_ADDRESS"
        RECEIVER_NAME="Receiver1"
    else
        RECEIVER="$RECEIVER2_ADDRESS"
        RECEIVER_NAME="Receiver2"
    fi

    echo "[$i/$TRANSFER_COUNT] 发送到 $RECEIVER_NAME: $(short_addr "$RECEIVER")"

    TX_RESULT=$(cast send "$TOKEN_ADDRESS" \
        "transfer(address,uint256)" \
        "$RECEIVER" \
        "$AMOUNT_PER_TRANSFER" \
        --private-key "$SENDER_PRIVATE_KEY" \
        --rpc-url "$RPC_URL" \
        --json)

    TX_HASH=$(echo "$TX_RESULT" | jq -r '.transactionHash')
    BLOCK_NUMBER=$(echo "$TX_RESULT" | jq -r '.blockNumber')

    if [ -z "$TX_HASH" ] || [ "$TX_HASH" = "null" ]; then
        echo "  ✗ 转账失败"
        exit 1
    fi

    echo "  ✓ tx=$(short_addr "$TX_HASH")  block=$BLOCK_NUMBER"
    echo ""
done

# ========== 查询最终状态 ==========

echo "— 查询最终余额 —"

SENDER_BALANCE_AFTER=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$SENDER_ADDRESS" --rpc-url "$RPC_URL")
RECEIVER1_BALANCE_AFTER=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$RECEIVER1_ADDRESS" --rpc-url "$RPC_URL")
RECEIVER2_BALANCE_AFTER=$(cast call "$TOKEN_ADDRESS" "balanceOf(address)(uint256)" "$RECEIVER2_ADDRESS" --rpc-url "$RPC_URL")

SENDER_DIFF=$((SENDER_BALANCE - SENDER_BALANCE_AFTER))
RECEIVER1_DIFF=$((RECEIVER1_BALANCE_AFTER - RECEIVER1_BALANCE))
RECEIVER2_DIFF=$((RECEIVER2_BALANCE_AFTER - RECEIVER2_BALANCE))

echo "  Sender:      $SENDER_BALANCE -> $SENDER_BALANCE_AFTER (差值: $SENDER_DIFF)"
echo "  Receiver1:   $RECEIVER1_BALANCE -> $RECEIVER1_BALANCE_AFTER (差值: $RECEIVER1_DIFF)"
echo "  Receiver2:   $RECEIVER2_BALANCE -> $RECEIVER2_BALANCE_AFTER (差值: $RECEIVER2_DIFF)"

# ========== 汇总 ==========

echo ""
echo "— 汇总 —"
echo "  ✓ 完成转账次数:   $TRANSFER_COUNT"
echo "  ✓ 每笔转账金额:   $AMOUNT_PER_TRANSFER wei"
echo "  ✓ Sender 减少:    $SENDER_DIFF"
echo "  ✓ Receiver1 增加: $RECEIVER1_DIFF"
echo "  ✓ Receiver2 增加: $RECEIVER2_DIFF"

echo ""
echo "下一步操作:"
echo "  1. 访问前端页面查看转账记录:"
echo "     http://localhost:3000/erc20-index-tx"
echo ""
echo "  2. 连接钱包 (使用测试账户地址):"
echo "     - Sender:    $SENDER_ADDRESS"
echo "     - Receiver1: $RECEIVER1_ADDRESS"
echo "     - Receiver2: $RECEIVER2_ADDRESS"
echo ""
echo "  3. 或使用数据库查询:"
echo "     sqlite3 $PROJECT_ROOT/transfers.db 'SELECT * FROM transfers ORDER BY block_number DESC LIMIT 10;'"
echo ""