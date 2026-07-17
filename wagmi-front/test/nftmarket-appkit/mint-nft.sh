#!/usr/bin/env bash
# wagmi-front/test/nftmarket-appkit/mint-nft.sh
#
# 铸造 SimpleNft 合约的 NFT
#
# 用法：
#   ./mint-nft.sh [token_id]
#
# 参数：
#   token_id   - NFT 的 token ID（可选，默认为 1）
#
# 环境变量：
#   PRIVATE_KEY - 部署私钥（默认 anvil 账户 #0）
#   RPC_URL     - 链 RPC（默认 http://127.0.0.1:8545）

set -euo pipefail

# -------------------- 路径与默认值 --------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAGMI_FRONT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_LOCAL="$WAGMI_FRONT_DIR/.env.local"

# anvil 默认账户 #0 的私钥和地址（仅本地测试用）
DEFAULT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEFAULT_TO_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
DEFAULT_RPC_URL="http://127.0.0.1:8545"
DEFAULT_TOKEN_ID=1

# -------------------- 工具函数 --------------------
log()  { printf '\033[1;36m[mint]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m  ✗\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# 从 .env.local 读取环境变量
load_env() {
  local key=$1
  if [ -f "$ENV_LOCAL" ]; then
    local val
    val=$(grep -E "^${key}=" "$ENV_LOCAL" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r')
    if [ -n "$val" ]; then
      echo "$val"
      return
    fi
  fi
  echo ""
}

# -------------------- 前置检查 --------------------
log "前置检查"

# 检查 cast 命令
command -v cast >/dev/null 2>&1 || die "缺少依赖命令: cast （请先安装 Foundry）"

# 加载配置
PRIVATE_KEY="${PRIVATE_KEY:-$DEFAULT_PRIVATE_KEY}"
RPC_URL="${RPC_URL:-$DEFAULT_RPC_URL}"

# 从 .env.local 读取 SimpleNft 合约地址
SIMPLE_NFT_ADDRESS=$(load_env "NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL")
[ -n "$SIMPLE_NFT_ADDRESS" ] || die "未在 $ENV_LOCAL 中找到 NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL"

# 解析参数
TO_ADDRESS="$DEFAULT_TO_ADDRESS"
TOKEN_ID="${1:-$DEFAULT_TOKEN_ID}"

ok "SimpleNft 地址: $SIMPLE_NFT_ADDRESS"
ok "RPC URL: $RPC_URL"
ok "接收地址: $TO_ADDRESS"
ok "Token ID: $TOKEN_ID"
ok "私钥: ${PRIVATE_KEY:0:10}...（已隐藏）"

# -------------------- 检查合约 --------------------
log "检查 SimpleNft 合约"
if ! cast code "$SIMPLE_NFT_ADDRESS" --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  die "合约 $SIMPLE_NFT_ADDRESS 不存在或 RPC 节点未启动"
fi
ok "合约已部署"

# -------------------- 检查 tokenId 是否已被铸造 --------------------
log "检查 Token ID $TOKEN_ID 是否已存在"
OWNER=$(cast call "$SIMPLE_NFT_ADDRESS" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$RPC_URL" 2>/dev/null || echo "")

if [ -n "$OWNER" ] && [ "$OWNER" != "0x0000000000000000000000000000000000000000" ]; then
  die "Token ID $TOKEN_ID 已被铸造，当前所有者: $OWNER"
fi
ok "Token ID $TOKEN_ID 可用"

# -------------------- 铸造 NFT --------------------
log "铸造 NFT (Token ID: $TOKEN_ID)"

cast send "$SIMPLE_NFT_ADDRESS" \
  "mint(address,uint256)" \
  "$TO_ADDRESS" \
  "$TOKEN_ID" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$RPC_URL" \
  --gas-limit 100000

ok "铸造成功"

# -------------------- 验证 --------------------
log "验证铸造结果"
NEW_OWNER=$(cast call "$SIMPLE_NFT_ADDRESS" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$RPC_URL")
ok "Token ID $TOKEN_ID 现在属于: $NEW_OWNER"

# -------------------- 汇总 --------------------
echo
log "铸造完成 ✓"
echo "  SimpleNft 地址: $SIMPLE_NFT_ADDRESS"
echo "  Token ID:       $TOKEN_ID"
echo "  所有者:         $NEW_OWNER"
echo
echo "  下一步：可以在 NFTMarket 中上架此 NFT"