#!/usr/bin/env bash
# viem-front/scripts/deploy-contracts.sh
#
# 一键部署 contracts/ 下的 7 个合约，并把地址写回 viem-front/.env.local
#
# 部署顺序（存在依赖关系）：
#   1. MyERC20                — 无前置依赖，构造时向部署者铸造 1,000,000 * 1e18
#   2. MyTokenPermit          — 无前置依赖，EIP-2612 permit 代币，向部署者铸造 TOKEN_INITIAL_SUPPLY * 1e18
#   3. TokenBank              — 构造参数 TOKEN_ADDRESS = MyERC20 地址
#   4. NFTMarket              — 构造参数 TOKEN_ADDRESS = MyERC20 地址（作为支付代币）
#   5. NFTMarketPermit        — 构造参数 TOKEN_ADDRESS + SIGNER_ADDRESS（白名单签名地址）
#   6. SimpleNft              — 无构造参数
#   7. AirdropMerkleNFTMarket — 构造参数 MY_TOKEN_PERMIT_ADDRESS + MERKLE_ROOT
#                                （paymentToken = MyTokenPermit，merkleRoot 由 proof 后端 GET /root 提供）
#
# 依赖：forge / cast / jq / curl（Foundry 工具链 + jq + curl）
#
# 环境变量优先级：当前 shell 已导出的环境变量 > contracts/.env > 内置默认值
#   PRIVATE_KEY          部署私钥（默认 anvil 账户 #0，仅本地测试用）
#   RPC_URL              链 RPC（默认 http://127.0.0.1:8545）
#   TOKEN_NAME           MyERC20 名称（默认 MyToken）
#   TOKEN_SYMBOL         MyERC20 符号（默认 MTK）
#   SIGNER_ADDRESS       NFTMarketPermit 白名单签名地址（默认 anvil 账户 #0 地址）
#   TOKEN_INITIAL_SUPPLY MyTokenPermit 初始供应量（whole tokens，默认 1000000）
#   PROOF_API_BASE       airdrop-merkle proof 后端地址（默认 http://localhost:4001）
#                        若后端未运行，本脚本会自动启动
#                        wagmi-front/test/airdrop-merkle/server.mjs（端口从该 URL 解析）
#
# 用法：
#   ./scripts/deploy-contracts.sh                            # 全部使用默认值
#   PRIVATE_KEY=0x... ./scripts/deploy-contracts.sh          # 覆盖部署私钥
#   RPC_URL=https://sepolia... ./scripts/deploy-contracts.sh # 部署到其他链

set -euo pipefail

# -------------------- 路径与默认值 --------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEM_FRONT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$(cd "$VIEM_FRONT_DIR/../contracts" && pwd)"
ENV_LOCAL="$VIEM_FRONT_DIR/.env.local"
ENV_LOCAL_EXAMPLE="$VIEM_FRONT_DIR/.env.local.example"

# anvil 默认账户 #0 的私钥（仅本地测试用，正式链请用环境变量覆盖）
DEFAULT_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEFAULT_RPC_URL="http://127.0.0.1:8545"
DEFAULT_TOKEN_NAME="MyToken"
DEFAULT_TOKEN_SYMBOL="MTK"
# anvil 默认账户 #0 的地址（与 DEFAULT_PRIVATE_KEY 对应）
DEFAULT_SIGNER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
# MyTokenPermit 初始供应量（whole tokens，构造函数内部会乘以 1e18）
DEFAULT_TOKEN_INITIAL_SUPPLY="1000000"
# airdrop-merkle proof 后端地址（部署 AirdropMerkleNFTMarket 时用于获取 merkleRoot）
DEFAULT_PROOF_API_BASE="http://localhost:4001"

# -------------------- 工具函数 --------------------
# 注意：所有日志函数都写到 stderr，stdout 只留给数据输出
# （deploy() 通过 echo 把地址输出到 stdout，再用 $(...) 捕获，
# 如果日志也走 stdout 会被一起捕获污染地址）
log()  { printf '\033[1;36m[deploy]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m  ✗\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# 检查依赖命令是否存在
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少依赖命令: $1 （请先安装 Foundry / jq）"
}

# 加载环境变量：用户已 export > contracts/.env > 默认值
load_var() {
  local key=$1 default=$2
  if [ -n "${!key:-}" ]; then
    return  # 用户已通过环境变量覆盖
  fi
  if [ -f "$CONTRACTS_DIR/.env" ]; then
    local val
    val=$(grep -E "^${key}=" "$CONTRACTS_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r') || true
    if [ -n "$val" ]; then
      export "$key=$val"
      return
    fi
  fi
  export "$key=$default"
}

# 从 broadcast/<Script>.s.sol/<chainId>/run-latest.json 提取合约地址
extract_address() {
  local script_name=$1
  local f="$CONTRACTS_DIR/broadcast/${script_name}.s.sol/${CHAIN_ID}/run-latest.json"
  [ -f "$f" ] || die "找不到 broadcast 文件: $f"
  local addr
  addr=$(jq -r '.receipts[0].contractAddress // empty' "$f")
  [ -n "$addr" ] || die "无法从 $f 提取合约地址"
  echo "$addr"
}

# 部署单个合约：参数 = 脚本名（不含 .s.sol 后缀）；输出合约地址
deploy() {
  local script_name=$1
  log "部署 $script_name ..."
  local log_file="/tmp/deploy-${script_name}-$$.log"
  (
    cd "$CONTRACTS_DIR"
    forge script "script/${script_name}.s.sol" \
      --rpc-url "$RPC_URL" \
      --broadcast \
      --slow
  ) > "$log_file" 2>&1 || {
    err "$script_name 部署失败，日志："
    cat "$log_file" >&2
    exit 1
  }
  local addr
  addr=$(extract_address "$script_name")
  ok "$script_name 已部署: $addr"
  echo "$addr"
}

# 用 awk 替换 .env.local 中的 KEY=value 行（保留其他内容；若不存在则追加）
update_env_var() {
  local file=$1 key=$2 value=$3
  local tmp
  tmp=$(mktemp)
  awk -v k="$key" -v v="$value" '
    $0 ~ "^" k "=" { print k "=" v; found=1; next }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# -------------------- 前置检查 --------------------
log "前置检查"
require_cmd forge
require_cmd cast
require_cmd jq
require_cmd curl
require_cmd node
[ -d "$CONTRACTS_DIR" ] || die "未找到 contracts 目录: $CONTRACTS_DIR"
[ -f "$CONTRACTS_DIR/foundry.toml" ] || die "未找到 foundry.toml: $CONTRACTS_DIR/foundry.toml"

load_var PRIVATE_KEY "$DEFAULT_PRIVATE_KEY"
load_var RPC_URL      "$DEFAULT_RPC_URL"
load_var TOKEN_NAME    "$DEFAULT_TOKEN_NAME"
load_var TOKEN_SYMBOL  "$DEFAULT_TOKEN_SYMBOL"
load_var SIGNER_ADDRESS "$DEFAULT_SIGNER_ADDRESS"
load_var TOKEN_INITIAL_SUPPLY "$DEFAULT_TOKEN_INITIAL_SUPPLY"
load_var PROOF_API_BASE "$DEFAULT_PROOF_API_BASE"

ok "RPC_URL      = $RPC_URL"
ok "TOKEN_NAME     = $TOKEN_NAME"
ok "TOKEN_SYMBOL   = $TOKEN_SYMBOL"
ok "SIGNER_ADDRESS = $SIGNER_ADDRESS"
ok "TOKEN_INITIAL_SUPPLY = $TOKEN_INITIAL_SUPPLY"
ok "PROOF_API_BASE = $PROOF_API_BASE"
ok "PRIVATE_KEY    = ${PRIVATE_KEY:0:10}...（已隐藏）"

# -------------------- 探测 RPC --------------------
log "探测 RPC 节点 $RPC_URL"
if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
  die "无法连接 RPC 节点，请先启动 anvil 或检查 RPC_URL：$RPC_URL"
fi
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" | tr -d '\n')
ok "链已连接，chainId = $CHAIN_ID"

# 导出给 forge script 用的变量
export PRIVATE_KEY RPC_URL TOKEN_NAME TOKEN_SYMBOL SIGNER_ADDRESS TOKEN_INITIAL_SUPPLY

# -------------------- 部署 --------------------
log "开始部署 7 个合约到 $RPC_URL (chainId=$CHAIN_ID)"

# 1. MyERC20（无前置依赖）
TOKEN_ADDRESS=$(deploy MyERC20)
export TOKEN_ADDRESS

# 2. MyTokenPermit（无前置依赖，EIP-2612 permit 代币，供 AirdropMerkleNFTMarket 使用）
MY_TOKEN_PERMIT_ADDRESS=$(deploy MyTokenPermit)
export MY_TOKEN_PERMIT_ADDRESS

# 3. TokenBank（构造参数 = TOKEN_ADDRESS）
TOKENBANK_ADDRESS=$(deploy TokenBank)

# 4. NFTMarket（构造参数 = TOKEN_ADDRESS，作为支付代币）
NFT_MARKET_ADDRESS=$(deploy NFTMarket)

# 5. NFTMarketPermit（构造参数 = TOKEN_ADDRESS + SIGNER_ADDRESS）
NFT_MARKET_PERMIT_ADDRESS=$(deploy NFTMarketPermit)

# 6. SimpleNft（无构造参数）
SIMPLE_NFT_ADDRESS=$(deploy SimpleNft)

# 7. AirdropMerkleNFTMarket（构造参数 = MY_TOKEN_PERMIT_ADDRESS + MERKLE_ROOT）
#    merkleRoot 须从 proof 后端 GET /root 获取。
#    若后端未运行，本脚本会自动启动 wagmi-front/test/airdrop-merkle/server.mjs。
PROOF_SERVER_DIR="$VIEM_FRONT_DIR/test/airdrop-merkle"
PROOF_SERVER_PID=""
PROOF_SERVER_LOG=""

# 从 PROOF_API_BASE 提取端口（默认 4001）
PROOF_SERVER_PORT=$(printf '%s' "$PROOF_API_BASE" | sed -nE 's|^https?://[^:/]*:([0-9]+).*|\1|p')
PROOF_SERVER_PORT="${PROOF_SERVER_PORT:-4001}"

# 检查后端是否已在运行
proof_is_up() {
  curl -s --max-time 2 "$PROOF_API_BASE/health" >/dev/null 2>&1
}

if ! proof_is_up; then
  if [ ! -f "$PROOF_SERVER_DIR/server.mjs" ]; then
    warn "未找到 proof 后端: $PROOF_SERVER_DIR/server.mjs，跳过 AirdropMerkleNFTMarket 部署"
    warn "请手动启动后端后重新运行：cd wagmi-front/test/airdrop-merkle && npm start"
  else
    log "proof 后端未运行，自动启动: $PROOF_SERVER_DIR/server.mjs (port=$PROOF_SERVER_PORT)"
    PROOF_SERVER_LOG="/tmp/airdrop-merkle-proof-$$.log"
    PORT="$PROOF_SERVER_PORT" nohup node "$PROOF_SERVER_DIR/server.mjs" > "$PROOF_SERVER_LOG" 2>&1 &
    PROOF_SERVER_PID=$!
    ok "proof 后端进程已启动 (PID=$PROOF_SERVER_PID)"

    # 等待就绪（最多 10 秒）
    log "等待 proof 后端就绪..."
    ready=0
    for _ in $(seq 1 20); do
      if proof_is_up; then
        ready=1
        break
      fi
      sleep 0.5
    done
    if [ "$ready" -eq 0 ]; then
      warn "proof 后端启动超时，日志："
      cat "$PROOF_SERVER_LOG" >&2 2>/dev/null || true
      warn "跳过 AirdropMerkleNFTMarket 部署"
      kill "$PROOF_SERVER_PID" 2>/dev/null || true
      PROOF_SERVER_PID=""
    else
      ok "proof 后端已就绪"
    fi
  fi
else
  ok "proof 后端已在运行"
fi

# 获取 merkleRoot（后端就绪时）
MERKLE_ROOT=""
if proof_is_up; then
  log "从 proof 后端获取 merkleRoot: $PROOF_API_BASE/root"
  MERKLE_ROOT=$(curl -s --max-time 5 "$PROOF_API_BASE/root" 2>/dev/null | jq -r '.root // empty' 2>/dev/null || echo "")
fi

AIRDROP_MERKLE_MARKET_ADDRESS=""
if [ -n "$MERKLE_ROOT" ]; then
  ok "merkleRoot = $MERKLE_ROOT"
  export MERKLE_ROOT
  AIRDROP_MERKLE_MARKET_ADDRESS=$(deploy AirdropMerkleNFTMarket)
else
  warn "无法获取 merkleRoot，跳过 AirdropMerkleNFTMarket 部署"
  warn "可手动启动后端后重新运行：cd wagmi-front/test/airdrop-merkle && npm start"
  warn "或手动部署：MY_TOKEN_PERMIT_ADDRESS=$MY_TOKEN_PERMIT_ADDRESS MERKLE_ROOT=<0x...> forge script script/AirdropMerkleNFTMarket.s.sol --rpc-url $RPC_URL --broadcast --slow"
fi

# -------------------- 链上回读校验（warn-only） --------------------
log "链上回读校验"
token_lower=$(printf '%s' "$TOKEN_ADDRESS" | tr '[:upper:]' '[:lower:]')

tb_token=$(cast call "$TOKENBANK_ADDRESS" "token()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [ -n "$tb_token" ]; then
  tb_token_lower=$(printf '%s' "$tb_token" | tr '[:upper:]' '[:lower:]')
  if [ "$tb_token_lower" = "$token_lower" ]; then
    ok "TokenBank.token() == MyERC20 地址 ✓"
  else
    warn "TokenBank.token() = $tb_token，与 MyERC20 地址 $TOKEN_ADDRESS 不一致"
  fi
else
  warn "无法读取 TokenBank.token()（跳过校验）"
fi

nm_token=$(cast call "$NFT_MARKET_ADDRESS" "paymentToken()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [ -n "$nm_token" ]; then
  nm_token_lower=$(printf '%s' "$nm_token" | tr '[:upper:]' '[:lower:]')
  if [ "$nm_token_lower" = "$token_lower" ]; then
    ok "NFTMarket.paymentToken() == MyERC20 地址 ✓"
  else
    warn "NFTMarket.paymentToken() = $nm_token，与 MyERC20 地址 $TOKEN_ADDRESS 不一致"
  fi
else
  warn "无法读取 NFTMarket.paymentToken()（跳过校验）"
fi

nmp_token=$(cast call "$NFT_MARKET_PERMIT_ADDRESS" "paymentToken()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [ -n "$nmp_token" ]; then
  nmp_token_lower=$(printf '%s' "$nmp_token" | tr '[:upper:]' '[:lower:]')
  if [ "$nmp_token_lower" = "$token_lower" ]; then
    ok "NFTMarketPermit.paymentToken() == MyERC20 地址 ✓"
  else
    warn "NFTMarketPermit.paymentToken() = $nmp_token，与 MyERC20 地址 $TOKEN_ADDRESS 不一致"
  fi
else
  warn "无法读取 NFTMarketPermit.paymentToken()（跳过校验）"
fi

nmp_signer=$(cast call "$NFT_MARKET_PERMIT_ADDRESS" "signer()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [ -n "$nmp_signer" ]; then
  signer_lower=$(printf '%s' "$SIGNER_ADDRESS" | tr '[:upper:]' '[:lower:]')
  nmp_signer_lower=$(printf '%s' "$nmp_signer" | tr '[:upper:]' '[:lower:]')
  if [ "$nmp_signer_lower" = "$signer_lower" ]; then
    ok "NFTMarketPermit.signer() == SIGNER_ADDRESS ✓"
  else
    warn "NFTMarketPermit.signer() = $nmp_signer，与 SIGNER_ADDRESS $SIGNER_ADDRESS 不一致"
  fi
else
  warn "无法读取 NFTMarketPermit.signer()（跳过校验）"
fi

# AirdropMerkleNFTMarket 回读校验（仅在成功部署时进行）
if [ -n "$AIRDROP_MERKLE_MARKET_ADDRESS" ]; then
  mtp_lower=$(printf '%s' "$MY_TOKEN_PERMIT_ADDRESS" | tr '[:upper:]' '[:lower:]')

  amm_token=$(cast call "$AIRDROP_MERKLE_MARKET_ADDRESS" "paymentToken()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
  if [ -n "$amm_token" ]; then
    amm_token_lower=$(printf '%s' "$amm_token" | tr '[:upper:]' '[:lower:]')
    if [ "$amm_token_lower" = "$mtp_lower" ]; then
      ok "AirdropMerkleNFTMarket.paymentToken() == MyTokenPermit 地址 ✓"
    else
      warn "AirdropMerkleNFTMarket.paymentToken() = $amm_token，与 MyTokenPermit 地址 $MY_TOKEN_PERMIT_ADDRESS 不一致"
    fi
  else
    warn "无法读取 AirdropMerkleNFTMarket.paymentToken()（跳过校验）"
  fi

  amm_root=$(cast call "$AIRDROP_MERKLE_MARKET_ADDRESS" "merkleRoot()(bytes32)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
  if [ -n "$amm_root" ]; then
    if [ "$amm_root" = "$MERKLE_ROOT" ]; then
      ok "AirdropMerkleNFTMarket.merkleRoot() == 后端 /root 返回值 ✓"
    else
      warn "AirdropMerkleNFTMarket.merkleRoot() = $amm_root，与后端 /root 返回值 $MERKLE_ROOT 不一致"
    fi
  else
    warn "无法读取 AirdropMerkleNFTMarket.merkleRoot()（跳过校验）"
  fi
fi

# -------------------- 处理 .env.local --------------------
log "更新 $ENV_LOCAL"
if [ ! -f "$ENV_LOCAL" ]; then
  if [ -f "$ENV_LOCAL_EXAMPLE" ]; then
    cp "$ENV_LOCAL_EXAMPLE" "$ENV_LOCAL"
    ok "从 .env.local.example 复制创建 .env.local"
  else
    : > "$ENV_LOCAL"
    warn ".env.local 与 .env.local.example 均不存在，已创建空文件"
  fi
else
  backup="${ENV_LOCAL}.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_LOCAL" "$backup"
  ok "已备份原文件到 $backup"
fi

update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_TOKEN_ADDRESS_LOCAL"       "$TOKEN_ADDRESS"
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_TOKENBANK_ADDRESS_LOCAL"   "$TOKENBANK_ADDRESS"
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_NFT_MARKET_ADDRESS_LOCAL"  "$NFT_MARKET_ADDRESS"
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS_LOCAL"  "$NFT_MARKET_PERMIT_ADDRESS"
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_SIMPLE_NFT_ADDRESS_LOCAL"  "$SIMPLE_NFT_ADDRESS"
update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS_LOCAL"     "$MY_TOKEN_PERMIT_ADDRESS"
if [ -n "$AIRDROP_MERKLE_MARKET_ADDRESS" ]; then
  update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_AIRDROP_MERKLE_MARKET_ADDRESS_LOCAL"  "$AIRDROP_MERKLE_MARKET_ADDRESS"
  update_env_var "$ENV_LOCAL" "NEXT_PUBLIC_AIRDROP_PROOF_API_BASE"               "$PROOF_API_BASE"
  ok "已写入 7 个合约地址 + proof API base"
else
  ok "已写入 6 个合约地址（AirdropMerkleNFTMarket 跳过）"
fi

# -------------------- 汇总 --------------------
echo
log "部署完成 ✓"
printf  '  %-40s %s\n' "MyERC20                (NEXT_PUBLIC_TOKEN_ADDRESS)"                "$TOKEN_ADDRESS"
printf  '  %-40s %s\n' "MyTokenPermit          (NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS)"      "$MY_TOKEN_PERMIT_ADDRESS"
printf  '  %-40s %s\n' "TokenBank              (NEXT_PUBLIC_TOKENBANK_ADDRESS)"            "$TOKENBANK_ADDRESS"
printf  '  %-40s %s\n' "NFTMarket              (NEXT_PUBLIC_NFT_MARKET_ADDRESS)"           "$NFT_MARKET_ADDRESS"
printf  '  %-40s %s\n' "NFTMarketPermit        (NEXT_PUBLIC_NFT_MARKET_PERMIT_ADDRESS)"    "$NFT_MARKET_PERMIT_ADDRESS"
printf  '  %-40s %s\n' "SimpleNft              (NEXT_PUBLIC_SIMPLE_NFT_ADDRESS)"           "$SIMPLE_NFT_ADDRESS"
if [ -n "$AIRDROP_MERKLE_MARKET_ADDRESS" ]; then
  printf  '  %-40s %s\n' "AirdropMerkleNFTMarket (NEXT_PUBLIC_AIRDROP_MERKLE_MARKET_ADDRESS)" "$AIRDROP_MERKLE_MARKET_ADDRESS"
  printf  '  %-40s %s\n' "merkleRoot             (后端 /root)"                               "$MERKLE_ROOT"
else
  warn "AirdropMerkleNFTMarket 未部署（proof 后端未就绪）"
fi
echo
echo "  下一步：重启前端使新地址生效"
echo "    cd wagmi-front && npm run dev"
echo
if [ -n "$PROOF_SERVER_PID" ]; then
  echo "  proof 后端由本脚本自动启动 (PID=$PROOF_SERVER_PID, port=$PROOF_SERVER_PORT)，"
  echo "  继续运行以供 airdrop-merkle 前端调用 proof 接口。"
  echo "    停止: kill $PROOF_SERVER_PID"
  echo "    日志: $PROOF_SERVER_LOG"
  echo
fi
if [ -n "$AIRDROP_MERKLE_MARKET_ADDRESS" ]; then
  echo "  提示：airdrop-merkle 前端页面已通过 getMyTokenPermitAddress() 直接读取"
  echo "        NEXT_PUBLIC_MY_TOKEN_PERMIT_ADDRESS_* (=$MY_TOKEN_PERMIT_ADDRESS)，"
  echo "        无需手动切换 NEXT_PUBLIC_TOKEN_ADDRESS_*。"
fi
