#!/usr/bin/env bash
# Septopus World · unified dev launcher (chain-free).
#
# The client is a three-way split (client/core shared + desktop + mobile,
# specs/mobile-client.md), so dev now runs TWO frontends over one engine source.
# Default = a solo-style DASHBOARD: both dev servers in the background + a live
# status table (port probe / uptime / last log line), Ctrl+C stops everything.
#
# Usage:
#   bash deploy/dev.sh                # dashboard: desktop(7777)+mobile(7778)+ai-gw(7788)+ipfs(7789)
#   bash deploy/dev.sh desktop        # single service, foreground (old behavior)
#   bash deploy/dev.sh mobile|ai-gw   # single service, foreground
#   bash deploy/dev.sh lan            # dashboard bound to 0.0.0.0 (真机联调,
#                                     # 手机访问 http://<内网IP>:7778)
#   PROVIDER=qwen DASHSCOPE_API_KEY=… bash deploy/dev.sh   # AI 造物换真 LLM
#
# The old chain dev environment (solana-test-validator + anchor + IPFS) is
# archived (untracked) at chain/deploy/.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/engine"
LOG_DIR="$ROOT/deploy/logs"
mkdir -p "$LOG_DIR"

# ── colors ────────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; CYAN=$'\033[0;36m'; BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'
info()  { printf "${GREEN}[dev]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[dev]${NC} %s\n" "$*"; }
error() { printf "${RED}[dev]${NC} %s\n" "$*" >&2; exit 1; }

command -v node &>/dev/null || error "node 未安装"
command -v npm  &>/dev/null || error "npm 未安装"

# ── args ──────────────────────────────────────────────────────────────────────
ONLY=""; HOST="127.0.0.1"
for arg in "$@"; do
    case "$arg" in
        desktop|mobile|ai-gw|aigw|ipfs) ONLY="${arg/aigw/ai-gw}" ;;
        lan) HOST="0.0.0.0" ;;
        *) warn "未知参数 '$arg'(可用:desktop | mobile | ai-gw | lan)" ;;
    esac
done

# ── services (name|path|port|cmd) — add a row here when a new service lands ──
# 说明:ai-gateway = AI 造物(PROVIDER=mock 免钥,导出 PROVIDER=qwen 换真 LLM);
# ipfs = 内容网关(file-CAS,CID 与引擎同源,启动时种入 core 内容+资产;客户端
# IpfsRouter 未命中时落到它——进程内 CAS 仍是一级缓存/离线兜底)。
# live 推送(FakeWebSocket)仍为进程内假件。
FE_SERVICES=(
    "Desktop|client/desktop|7777|npm run dev -- --host \$HOST"
    "Mobile |client/mobile|7778|npm run dev -- --host \$HOST"
    "AI-GW  |services/ai-gateway|7788|npm start"
    "IPFS   |services/ipfs|7789|npm start"
)

# ── deps: npm apps (missing / incomplete / stale lockfile → reinstall) ────────
npm_deps() { # $1 = app dir (repo-relative), $2 = marker binary (install completeness tell-tale)
    local dir="$ROOT/$1" marker="${2:-vite}" reason=
    [ -d "$dir" ] || error "找不到 $dir"
    if   [ ! -d "$dir/node_modules" ]; then reason="缺少 node_modules"
    elif [ ! -x "$dir/node_modules/.bin/$marker" ]; then reason="依赖不完整（$marker 未安装，可能上次安装中断）"
    elif [ -f "$dir/package-lock.json" ] && [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then reason="依赖已过期（package-lock.json 比上次安装新）"
    fi
    if [ -n "$reason" ]; then
        info "$1 安装/更新依赖（$reason）：npm install..."
        ( cd "$dir" && npm install )
    fi
}
npm_deps client/desktop vite
npm_deps client/mobile vite
npm_deps services/ai-gateway tsx
npm_deps services/ipfs tsx

# ── deps: engine (yarn; both clients compile its SOURCE via the @engine alias) ─
engine_reason=
if   [ ! -d "$ENGINE/node_modules" ]; then engine_reason="缺少 node_modules"
elif [ ! -f "$ENGINE/node_modules/.yarn-integrity" ]; then engine_reason="依赖不完整（.yarn-integrity 缺失，可能上次安装中断）"
elif [ -f "$ENGINE/yarn.lock" ] && [ "$ENGINE/yarn.lock" -nt "$ENGINE/node_modules/.yarn-integrity" ]; then engine_reason="依赖已过期（yarn.lock 比上次安装新）"
fi
if [ -n "$engine_reason" ]; then
    if command -v yarn &>/dev/null; then
        info "安装/更新 engine 依赖（$engine_reason）：yarn install..."
        ( cd "$ENGINE" && yarn install )
    else
        warn "engine 依赖需要更新（$engine_reason），但未找到 yarn —— 请手动执行：cd engine && yarn install"
    fi
fi

free_port() { # $1 = port
    if lsof -i ":$1" &>/dev/null; then
        warn "端口 $1 被占用，清理旧进程..."
        lsof -ti ":$1" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# ── single-service mode (the old foreground behavior) ─────────────────────────
if [ -n "$ONLY" ]; then
    for row in "${FE_SERVICES[@]}"; do
        IFS='|' read -r name path port cmd <<< "$row"
        if [ "$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr -d ' ')" = "$ONLY" ]; then
            free_port "$port"
            printf "${CYAN}=== Septopus World · %s ===${NC}\n" "$name"
            info "启动 → http://$HOST:$port"
            info "Ctrl+C 停止"
            cd "$ROOT/$path" && eval "exec $cmd"
        fi
    done
    error "未知服务 '$ONLY'"
fi

# ── dashboard mode: launch everything in the background ───────────────────────
FE_PIDS=(); FE_START=()
for i in "${!FE_SERVICES[@]}"; do
    IFS='|' read -r name path port cmd <<< "${FE_SERVICES[$i]}"
    free_port "$port"
    log="$LOG_DIR/$(echo "$name" | tr -d ' ' | tr '[:upper:]' '[:lower:]' | tr -d '-').log"
    ( cd "$ROOT/$path" && eval "$cmd" > "$log" 2>&1 ) &
    FE_PIDS[$i]=$!
    FE_START[$i]=$(date +%s)
done

cleanup() {
    printf "\n${YELLOW}[dev] 停止所有服务...${NC}\n"
    kill $(jobs -p) 2>/dev/null || true
    for row in "${FE_SERVICES[@]}"; do
        IFS='|' read -r _ _ port _ <<< "$row"   # 4-field row: name|path|port|cmd
        lsof -ti ":$port" | xargs kill -9 2>/dev/null || true
    done
    tput cnorm 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
START_TOTAL=$(date +%s)
clear; tput civis 2>/dev/null || true

# ── dashboard loop (solo-style: repaint the status table every 2s) ────────────
while true; do
    tput cup 0 0 2>/dev/null || clear
    printf -- "${BLUE}${BOLD}=== SEPTOPUS WORLD · DEV DASHBOARD ===${NC}\n"
    printf -- "${CYAN}Uptime: $(($(date +%s) - START_TOTAL))s | host: $HOST$( [ "$HOST" = "0.0.0.0" ] && [ -n "$LAN_IP" ] && echo " | LAN: $LAN_IP" )${NC}\n\n"

    printf -- "${BOLD}%-10s %-6s %-8s %-8s %s${NC}\n" "SERVICE" "PORT" "STATUS" "UPTIME" "LOG"
    printf -- "--------------------------------------------------------------------------------\n"
    for i in "${!FE_SERVICES[@]}"; do
        IFS='|' read -r name path port cmd <<< "${FE_SERVICES[$i]}"
        log="$LOG_DIR/$(echo "$name" | tr -d ' ' | tr '[:upper:]' '[:lower:]' | tr -d '-').log"
        if lsof -i ":$port" -sTCP:LISTEN &>/dev/null; then
            ST="${GREEN}[ON]${NC}"; UP="$(($(date +%s) - FE_START[$i]))s"
        else
            ST="${RED}[OFF]${NC}"; UP="-"
        fi
        LAST=$([ -f "$log" ] && tail -n 1 "$log" | tr -cd '[:print:]' | cut -c1-46 || echo "-")
        printf -- "%-10s %-6s %-8b %-8s %s\n" "$name" "$port" "$ST" "$UP" "$LAST"
    done

    printf -- "\n${BOLD}入口速查(URL)${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  桌面世界       ${GREEN}http://127.0.0.1:7777/${NC}\n"
    printf -- "  移动世界       ${GREEN}http://127.0.0.1:7778/${NC}"
    [ "$HOST" = "0.0.0.0" ] && [ -n "$LAN_IP" ] && printf -- "   ${CYAN}真机 → http://$LAN_IP:7778/${NC}"
    printf -- "\n"
    printf -- "  关卡           ${CYAN}?level=${NC}gallery | world | xianjian | coaster | parkour | refine\n"
    printf -- "  SPP粒子编辑器  ${GREEN}http://127.0.0.1:7777/?tool=stylepack${NC}\n"
    printf -- "  AI 造物网关    ${GREEN}http://127.0.0.1:7788${NC}   provider: ${PROVIDER:-mock}（导出 PROVIDER=qwen + DASHSCOPE_API_KEY 换真 LLM）\n"
    printf -- "  IPFS 网关      ${GREEN}http://127.0.0.1:7789${NC}   /v0/health · /v0/names · /ipfs/<cid>(CID 与引擎同源)\n"
    printf -- "  进程内层       CAS 一级缓存(MemoryCas,离线兜底) · live 推送(FakeWebSocket)\n"
    printf -- "  日志           deploy/logs/{desktop,mobile,aigw,ipfs}.log\n"

    printf -- "\n${YELLOW}Ctrl+C 停止全部。${NC}\n"
    sleep 2
done
