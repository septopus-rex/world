#!/usr/bin/env bash
# Local dev environment: Solana localnet + IPFS + app frontend.
# Usage: bash deploy/dev.sh [--skip-deploy]
set -e

# macOS 系统代理（如 Clash）会拦截 127.0.0.1 流量导致 Solana CLI 收到 502；
# COPYFILE_DISABLE 防止 macOS 在 tar 里写入 ._genesis.bin 导致 1.18.x 启动失败
export NO_PROXY="127.0.0.1,localhost"
export no_proxy="127.0.0.1,localhost"
export COPYFILE_DISABLE=1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
LOCALHOST="$DEPLOY/localhost"

SKIP_DEPLOY=false
[[ "${1:-}" == "--skip-deploy" ]] && SKIP_DEPLOY=true

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'

info()  { printf "${GREEN}[dev]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[dev]${NC} %s\n" "$*"; }
error() { printf "${RED}[dev]${NC} %s\n" "$*" >&2; exit 1; }

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

wait_for_validator() {
    local retries=90
    info "等待 solana-test-validator 完全就绪 (slot 推进中)..."
    while true; do
        local slot
        slot=$(curl -sf -X POST http://127.0.0.1:8899 \
            -H 'Content-Type: application/json' \
            -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
            2>/dev/null | grep -oE '"result":[0-9]+' | grep -oE '[0-9]+' || echo 0)
        slot=$(printf '%d' "${slot:-0}" 2>/dev/null || echo 0)
        [ "$slot" -gt 1 ] && break
        retries=$((retries - 1))
        [ $retries -le 0 ] && error "solana-test-validator 就绪超时"
        sleep 1
    done
    info "solana-test-validator 就绪 [slot=$slot]"
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
# 杀进程组（包含所有子进程）
_kill_group() {
    local pid=$1
    [ -z "$pid" ] && return
    local pgid
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -dc '0-9')
    if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
        kill -- -"$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    else
        kill "$pid" 2>/dev/null || true
    fi
}

cleanup() {
    [ "$_stopping" = "1" ] && return
    _stopping=1
    trap '' INT TERM EXIT
    # 恢复终端状态（cursor、换行、颜色）
    tput cnorm 2>/dev/null
    printf "\r\n${YELLOW}[dev] 正在停止所有服务...${NC}\n"
    _kill_group "$APP_PID"
    _kill_group "$IPFS_PID"
    _kill_group "$VALIDATOR_PID"
    # 等子进程实际退出
    wait "$APP_PID"       2>/dev/null || true
    wait "$IPFS_PID"      2>/dev/null || true
    wait "$VALIDATOR_PID" 2>/dev/null || true
    stty sane 2>/dev/null || true
    if $CONFIG_BACKED_UP; then
        mv "$ROOT/app/src/config.js.bak" "$ROOT/app/src/config.js"
        printf "${GREEN}[dev]${NC} app/src/config.js 已还原\n"
    fi
    printf "${GREEN}[dev]${NC} 完成\n"
}
trap cleanup EXIT INT TERM

# ── 1. 依赖检测 ───────────────────────────────────────────────────────────────
# 先设好 PATH，避免已安装的工具被误判为缺失
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

# 使用 1.18.26（2.x/4.x 在 macOS 上有 fee-stabilization bug，1.18.26 正常）
_ACTIVE="$HOME/.local/share/solana/install/active_release"
_V118="$HOME/.local/share/solana/install/releases/1.18.26/solana-release"
if [ ! -d "$_V118" ]; then
    info "安装 Solana v1.18.26..."
    sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)" 2>&1 | tail -3
    [ -d "$_V118" ] || error "Solana v1.18.26 安装失败"
fi
_CUR=$(readlink "$_ACTIVE" 2>/dev/null || true)
if [ "$_CUR" != "$_V118" ]; then
    warn "切换 Solana active_release → v1.18.26..."
    rm -f "$_ACTIVE" && ln -s "$_V118" "$_ACTIVE"
fi

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

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
wait_for_validator
solana config set --url http://localhost:8899 &>/dev/null

# ── 2.5. Solana platform-tools 完整性检查 ─────────────────────────────────────
ensure_platform_tools() {
    local pt_link="$HOME/.local/share/solana/install/active_release/bin/sdk/sbf/dependencies/platform-tools"
    [ ! -L "$pt_link" ] && return
    local pt_target; pt_target=$(readlink "$pt_link")
    [ -d "$pt_target/rust/lib" ] && return  # 已正常安装

    local pt_version; pt_version=$(basename "$(dirname "$pt_target")")  # e.g. v1.43
    local arch="linux-x86_64"
    [[ "$(uname -s)" == "Darwin" ]] && {
        [[ "$(uname -m)" == "arm64" ]] && arch="osx-aarch64" || arch="osx-x86_64"
    }
    local url="https://github.com/anza-xyz/platform-tools/releases/download/${pt_version}/platform-tools-${arch}.tar.bz2"
    local tmp_file; tmp_file="$(dirname "$pt_target")/tmp-platform-tools-${arch}.tar.bz2"

    warn "platform-tools (${pt_version}) 不完整，重新下载..."
    rm -rf "$pt_target" "$tmp_file"
    mkdir -p "$(dirname "$pt_target")"

    info "下载 $url"
    curl -L --progress-bar -o "$tmp_file" "$url" \
        || error "platform-tools 下载失败"

    info "解压 platform-tools..."
    mkdir -p "$pt_target"
    tar -xjf "$tmp_file" -C "$pt_target" \
        || error "platform-tools 解压失败"
    rm -f "$tmp_file"
    info "platform-tools 安装完成"
}

ensure_platform_tools

# ── 3. Anchor build & deploy ──────────────────────────────────────────────────
if $SKIP_DEPLOY; then
    warn "--skip-deploy：跳过 anchor build/deploy"
else
    # 确保 anchor-cli 版本与 Cargo.toml 中的 anchor-lang 一致
    ANCHOR_VER=$(grep 'anchor-lang' "$ROOT/chain/programs/septopus/Cargo.toml" \
        | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$ANCHOR_VER" ]; then
        CURRENT_AVM=$(avm list 2>/dev/null | awk '/current/{print $1}')
        if [ "$CURRENT_AVM" != "$ANCHOR_VER" ]; then
            info "切换 anchor-cli -> $ANCHOR_VER (当前: ${CURRENT_AVM:-unknown})..."
            avm install "$ANCHOR_VER" 2>&1 | tail -5
            avm use "$ANCHOR_VER"
        fi
    fi

    info "anchor build (日志: /tmp/anchor-build.log)..."
    ( cd "$ROOT/chain" && anchor build > /tmp/anchor-build.log 2>&1 ) \
        || { error "anchor build 失败，查看 /tmp/anchor-build.log"; }
    wait_for_validator
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
# 清理残留在 7777 上的旧进程，防止 Vite 漂移到其他端口
if port_in_use 7777; then
    warn "端口 7777 被占用，清理旧进程..."
    lsof -ti :7777 | xargs kill -9 2>/dev/null || true
    sleep 1
fi
( cd "$ROOT/app" && yarn dev > /tmp/app-dev.log 2>&1 ) &
APP_PID=$!
wait_for_port 7777 "app"

# ── 6. Dashboard ──────────────────────────────────────────────────────────────
declare -a SVC_NAMES=( "Validator"   "IPFS API"   "IPFS GW"    "App"        )
declare -a SVC_PORTS=( "8899"        "5001"        "8080"        "7777"       )
declare -a SVC_URLS=(
    "http://localhost:8899"
    "http://localhost:5001"
    "http://localhost:8080"
    "http://localhost:7777"
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
