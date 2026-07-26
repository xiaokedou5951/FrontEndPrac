#!/usr/bin/env bash
# wagmi-front/test/nftmarket-white/sign-permit.sh
#
# 为白名单用户生成 EIP-712 签名（permitBuy 凭证）
#
# 用法：
#   ./sign-permit.sh <buyer_address> <listing_id>
#
# 参数：
#   buyer_address - 白名单买家地址
#   listing_id    - 上架 ID
#
# 环境变量：
#   PRIVATE_KEY - 签名者私钥（默认 anvil 账户 #0，即合约 signer）
#   RPC_URL     - 链 RPC（默认 http://127.0.0.1:8545）

set -euo pipefail

# -------------------- 路径与默认值 --------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAGMI_FRONT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_LOCAL="$WAGMI_FRONT_DIR/.env.local"

# anvil 默认账户 #0（合约部署者 / signer）
DEFAULT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEFAULT_RPC_URL="http://127.0.0.1:8545"

# -------------------- 工具函数 --------------------
log()  { printf '\033[1;36m[sign]\033[0m %s\n' "$*" >&2; }
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

command -v cast >/dev/null 2>&1 || die "缺少依赖命令: cast （请先安装 Foundry）"

# 加载配置
PRIVATE_KEY="${PRIVATE_KEY:-$DEFAULT_PRIVATE_KEY}"
RPC_URL="${RPC_URL:-$DEFAULT_RPC_URL}"

# 解析参数
BUYER="${1:-}"
LISTING_ID="${2:-}"

[ -n "$BUYER" ] || die "用法: $0 <buyer_address> <listing_id>"
[ -n "$LISTING_ID" ] || die "用法: $0 <buyer_address> <listing_id>"

# 验证买家地址格式
[[ "$BUYER" =~ ^0x[a-fA-F0-9]{40}$ ]] || die "买家地址格式无效: $BUYER"
# 验证 listingId 为非负整数
[[ "$LISTING_ID" =~ ^[0-9]+$ ]] || die "listingId 必须为非负整数: $LISTING_ID"

# 从 .env.local 读取 NFTMarketPermit 合约地址
NFT_MARKET_PERMIT_ADDRESS=$(load_env "NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_LOCAL")
[ -n "$NFT_MARKET_PERMIT_ADDRESS" ] || die "未在 $ENV_LOCAL 中找到 NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_LOCAL"

ok "NFTMarketPermit 地址: $NFT_MARKET_PERMIT_ADDRESS"
ok "RPC URL: $RPC_URL"
ok "买家地址: $BUYER"
ok "Listing ID: $LISTING_ID"
ok "签名私钥: ${PRIVATE_KEY:0:10}...（已隐藏）"

# -------------------- 检查合约 --------------------
log "检查 NFTMarketPermit 合约"
if ! cast code "$NFT_MARKET_PERMIT_ADDRESS" --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  die "合约 $NFT_MARKET_PERMIT_ADDRESS 不存在或 RPC 节点未启动"
fi
ok "合约已部署"

# -------------------- 验证签名者身份 --------------------
log "验证签名者身份"
SIGNER_ON_CHAIN=$(cast call "$NFT_MARKET_PERMIT_ADDRESS" "signer()(address)" --rpc-url "$RPC_URL")
SIGNER_ADDRESS=$(cast wallet address --private-key "$PRIVATE_KEY" 2>/dev/null || echo "")

if [ -z "$SIGNER_ADDRESS" ]; then
  die "无法从私钥推导地址"
fi

# bash 3 兼容：用 tr 做小写比较
SIGNER_ON_CHAIN_LOWER=$(echo "$SIGNER_ON_CHAIN" | tr '[:upper:]' '[:lower:]')
SIGNER_ADDRESS_LOWER=$(echo "$SIGNER_ADDRESS" | tr '[:upper:]' '[:lower:]')

if [ "$SIGNER_ON_CHAIN_LOWER" != "$SIGNER_ADDRESS_LOWER" ]; then
  die "当前私钥地址 $SIGNER_ADDRESS 不是合约 signer（链上 signer: $SIGNER_ON_CHAIN）"
fi
ok "签名者地址: $SIGNER_ADDRESS （与合约 signer 一致）"

# -------------------- 读取链上数据 --------------------
log "读取链上 EIP-712 参数"
DOMAIN_SEPARATOR=$(cast call "$NFT_MARKET_PERMIT_ADDRESS" "domainSeparator()(bytes32)" --rpc-url "$RPC_URL")
PERMIT_TYPEHASH=$(cast call "$NFT_MARKET_PERMIT_ADDRESS" "PERMIT_TYPEHASH()(bytes32)" --rpc-url "$RPC_URL")
ok "Domain Separator: $DOMAIN_SEPARATOR"
ok "PERMIT_TYPEHASH: $PERMIT_TYPEHASH"

# -------------------- 构造 EIP-712 签名 --------------------
log "构造 EIP-712 签名"

# 1. structHash = keccak256(abi.encode(PERMIT_TYPEHASH, buyer, listingId))
STRUCT_HASH=$(cast keccak "$(cast abi-encode "f(bytes32,address,uint256)" "$PERMIT_TYPEHASH" "$BUYER" "$LISTING_ID")")
ok "Struct Hash: $STRUCT_HASH"

# 2. digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))
#    "\x19\x01" 的 hex 为 0x1901
DIGEST=$(cast keccak "0x1901${DOMAIN_SEPARATOR#0x}${STRUCT_HASH#0x}")
ok "Digest: $DIGEST"

# 3. 使用私钥签名 digest
SIGNATURE=$(cast wallet sign "$DIGEST" --private-key "$PRIVATE_KEY" --no-hash)
ok "签名: $SIGNATURE"

# -------------------- 拆分签名为 v, r, s --------------------
log "拆分签名"

# 签名格式: 0x + r(32字节) + s(32字节) + v(1字节) = 0x + 130 hex chars = 132 chars total
if [ ${#SIGNATURE} -ne 132 ]; then
  die "签名长度异常: ${#SIGNATURE}（期望 132）"
fi

R="0x${SIGNATURE:2:64}"
S="0x${SIGNATURE:66:64}"
V=$((16#${SIGNATURE:130:2}))

ok "v = $V"
ok "r = $R"
ok "s = $S"

# -------------------- 汇总 --------------------
echo
log "签名生成完成 ✓"
echo
echo "  合约地址:   $NFT_MARKET_PERMIT_ADDRESS"
echo "  买家地址:   $BUYER"
echo "  Listing ID: $LISTING_ID"
echo
echo "  完整签名 (65 bytes):"
echo "    $SIGNATURE"
echo
echo "  拆分结果:"
echo "    v = $V"
echo "    r = $R"
echo "    s = $S"
echo
echo "  下一步："
echo "    前端 - 在「白名单许可购买 NFT」卡片中输入 Listing ID 和签名"
echo "    命令行 - 执行以下命令购买:"
echo
echo "    cast send $NFT_MARKET_PERMIT_ADDRESS \\"
echo "      \"permitBuy(uint256,uint8,bytes32,bytes32)\" \\"
echo "      $LISTING_ID $V $R $S \\"
echo "      --rpc-url $RPC_URL \\"
echo "      --private-key <buyer_private_key>"
