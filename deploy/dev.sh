#!/usr/bin/env bash
# Local dev environment: Solana localnet + IPFS + app frontend.
# Usage: bash deploy/dev.sh [--skip-deploy]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
LOCALHOST="$DEPLOY/localhost"

SKIP_DEPLOY=false
[[ "${1:-}" == "--skip-deploy" ]] && SKIP_DEPLOY=true

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${GREEN}[dev]${NC} $*"; }
warn()  { echo -e "${YELLOW}[dev]${NC} $*"; }
error() { echo -e "${RED}[dev]${NC} $*" >&2; exit 1; }

# ── PID 追踪 ──────────────────────────────────────────────────────────────────
VALIDATOR_PID=""; IPFS_PID=""; APP_PID=""
CONFIG_BACKED_UP=false
_stopping=0

# ── Helpers ───────────────────────────────────────────────────────────────────
port_in_use() { lsof -i ":$1" &>/dev/null; }

wait_for_port() {
    local port=$1 label=$2 retries=30
    info "等待 $label (:$port)..."
    while ! lsof -i ":$port" &>/dev/null; do
        retries=$((retries - 1))
        [ $retries -le 0 ] && error "$label 启动超时"
        sleep 1
    done
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
    [ "$_stopping" = "1" ] && return
    _stopping=1
    trap '' INT TERM EXIT
    tput cnorm 2>/dev/null; tput cup 99 0 2>/dev/null
    printf "\n${YELLOW}[dev] 正在停止所有服务...${NC}\n"
    [ -n "$APP_PID" ]       && kill "$APP_PID"       2>/dev/null || true
    [ -n "$IPFS_PID" ]      && kill "$IPFS_PID"      2>/dev/null || true
    [ -n "$VALIDATOR_PID" ] && kill "$VALIDATOR_PID" 2>/dev/null || true
    if $CONFIG_BACKED_UP; then
        mv "$ROOT/app/src/config.js.bak" "$ROOT/app/src/config.js"
        printf "${GREEN}[dev]${NC} app/src/config.js 已还原\n"
    fi
    printf "${GREEN}[dev]${NC} 完成\n"
}
trap cleanup EXIT INT TERM

# ── 1. 依赖检测 ───────────────────────────────────────────────────────────────
info "检查依赖..."
MISSING=()
for tool in solana anchor ipfs node yarn; do
    command -v "$tool" &>/dev/null || MISSING+=("$tool")
done

if [ ${#MISSING[@]} -gt 0 ]; then
    warn "缺少工具: ${MISSING[*]}"
    info "调用 setup.sh..."
    bash "$DEPLOY/setup.sh" "${MISSING[@]}"
    [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    for tool in solana anchor ipfs; do
        command -v "$tool" &>/dev/null || error "$tool 安装后仍找不到，请重启 shell 再试"
    done
fi

# ── 2. Solana test validator ──────────────────────────────────────────────────
if port_in_use 8899; then
    warn "solana-test-validator 已在运行 (:8899)，跳过"
else
    info "启动 solana-test-validator..."
    solana-test-validator \
        --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
        "$ROOT/chain/mpl_token_metadata.so" \
        --reset --quiet \
        > /tmp/validator-dev.log 2>&1 &
    VALIDATOR_PID=$!
    wait_for_port 8899 "solana-test-validator"
fi
solana config set --url http://localhost:8899 &>/dev/null

# ── 3. Anchor build & deploy ──────────────────────────────────────────────────
if $SKIP_DEPLOY; then
    warn "--skip-deploy：跳过 anchor build/deploy"
else
    info "anchor build..."
    ( cd "$ROOT/chain" && anchor build > /tmp/anchor-build.log 2>&1 ) \
        || { error "anchor build 失败，查看 /tmp/anchor-build.log"; }
    info "anchor deploy → localnet..."
    ( cd "$ROOT/chain" && anchor deploy > /tmp/anchor-deploy.log 2>&1 ) \
        || { error "anchor deploy 失败，查看 /tmp/anchor-deploy.log"; }
fi

# ── 4. IPFS daemon ────────────────────────────────────────────────────────────
if port_in_use 5001; then
    warn "IPFS 已在运行 (:5001)，跳过"
else
    bash "$LOCALHOST/ipfs-init.sh"
    info "启动 IPFS daemon..."
    ipfs daemon > /tmp/ipfs-dev.log 2>&1 &
    IPFS_PID=$!
    wait_for_port 5001 "IPFS daemon"
fi

# ── 5. App frontend ───────────────────────────────────────────────────────────
info "切换 app/src/config.js → localhost 配置..."
cp "$ROOT/app/src/config.js" "$ROOT/app/src/config.js.bak"
CONFIG_BACKED_UP=true
cp "$LOCALHOST/config.js" "$ROOT/app/src/config.js"

info "启动 app dev server..."
( cd "$ROOT/app" && yarn dev > /tmp/app-dev.log 2>&1 ) &
APP_PID=$!
wait_for_port 6666 "app"

# ── 6. Dashboard ──────────────────────────────────────────────────────────────
declare -a SVC_NAMES=( "Validator"   "IPFS API"   "IPFS GW"    "App"        )
declare -a SVC_PORTS=( "8899"        "5001"        "8080"        "6666"       )
declare -a SVC_URLS=(
    "http://localhost:8899"
    "http://localhost:5001"
    "http://localhost:8080"
    "http://localhost:6666"
)
declare -a SVC_LOGS=(
    "/tmp/validator-dev.log"
    "/tmp/ipfs-dev.log"
    "/tmp/ipfs-dev.log"
    "/tmp/app-dev.log"
)
declare -a SVC_PIDS=( "$VALIDATOR_PID" "$IPFS_PID" "$IPFS_PID" "$APP_PID" )

START_TOTAL=$(date +%s)
tput civis 2>/dev/null; clear

while true; do
    tput cup 0 0

    printf "${BLUE}${BOLD}=== Septopus World · Dev Dashboard ===${NC}\n"
    printf "${CYAN}运行时长: $(($(date +%s) - START_TOTAL))s  |  Ctrl+C 停止${NC}"
    $SKIP_DEPLOY && printf "  ${YELLOW}[--skip-deploy]${NC}"
    printf "\n\n"

    printf "${BOLD}%-14s %-6s %-8s  %s${NC}\n" "SERVICE" "PORT" "STATUS" "URL / LOG"
    printf '%0.s─' {1..65}; printf '\n'

    for i in "${!SVC_NAMES[@]}"; do
        name="${SVC_NAMES[$i]}"
        port="${SVC_PORTS[$i]}"
        url="${SVC_URLS[$i]}"
        log_file="${SVC_LOGS[$i]}"
        pid="${SVC_PIDS[$i]}"

        if lsof -i ":$port" &>/dev/null; then
            status="${GREEN}[ON] ${NC}"
            url_display="${GREEN}${url}${NC}"
        else
            status="${RED}[OFF]${NC}"
            url_display="${RED}${log_file}${NC}"
        fi

        printf "%-14s %-6s %b  %b\n" "$name" "$port" "$status" "$url_display"
    done

    printf '\n'
    printf "${YELLOW}Logs: validator=/tmp/validator-dev.log  ipfs=/tmp/ipfs-dev.log  app=/tmp/app-dev.log${NC}\n"

    sleep 2
done
