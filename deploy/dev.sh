#!/usr/bin/env bash
# Septopus World · unified dev launcher (chain-free).
#
# The client is a three-way split (client/core shared + desktop + mobile,
# specs/mobile-client.md), so dev now runs TWO frontends over one engine source.
# Default = a solo-style DASHBOARD: all services in the background, with live
# [ON]/[OFF] port-probe lights inline on the UI 入口 / API 服务 rows (no separate
# status table — each entry IS its own status line). Ctrl+C stops everything.
#
# Usage:
#   bash deploy/dev.sh                # dashboard: desktop(7777)+mobile(7778)+ai-gw(7788)+ipfs(7789)
#   bash deploy/dev.sh desktop        # single service, foreground (old behavior)
#   bash deploy/dev.sh mobile|ai-gw   # single service, foreground
#   bash deploy/dev.sh lan            # dashboard bound to 0.0.0.0 (真机联调,
#                                     # 手机访问 http://<内网IP>:7778)
#   bash deploy/dev.sh --chain        # 链上启动模式:只起 IPFS 网关 → 构建链包并
#                                     # 发版(publish-chain)→ 打开 /boot?name=septopus
#                                     # ——整个 3D 世界从锚经 CID 链启动,无应用服务器
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
ONLY=""; HOST="127.0.0.1"; CHAIN=""
for arg in "$@"; do
    case "$arg" in
        desktop|mobile|ai-gw|aigw|ai-build|aibuild|ipfs|mahjong|pool|holdem|board|worldlabs) ONLY="${arg/aigw/ai-gw}"; ONLY="${ONLY/aibuild/ai-build}" ;;
        lan) HOST="0.0.0.0" ;;
        --chain|chain) CHAIN=1 ;;   # 链上启动模式(boot-chain.md dev 彩排)
        *) warn "未知参数 '$arg'(可用:desktop | mobile | ai-gw | ai-build | ipfs | worldlabs | lan | --chain)" ;;
    esac
done

# ── services (name|path|port|cmd) — add a row here when a new service lands ──
# 说明:ai-gateway = AI 造物 v1/生成器模板(PROVIDER=mock 免钥,导出 PROVIDER=qwen
# 换真 LLM);ai-builder = AI 造物 v2 实验/直出 adjunct + 服务端碰撞校验(同一 PROVIDER
# 开关,规格 docs/plan/specs/ai-builder.md);worldlabs = 画廊㉑ AI 生成世界演示
# (WORLDLABS_PROVIDER=mock 免钥离线,导出 WORLDLABS_PROVIDER=real + WORLDLABS_API_KEY
# 换真 Marble API——真调用耗真额度+约 5 分钟,谨慎);ipfs = 内容网关(file-CAS,CID 与
# 引擎同源,启动时种入 core 内容+资产;客户端 IpfsRouter 未命中时落到它——进程内 CAS
# 仍是一级缓存/离线兜底)。live 推送(FakeWebSocket)仍为进程内假件。
FE_SERVICES=(
    "Desktop  |client/desktop|7777|npm run dev -- --host \$HOST"
    "Mobile   |client/mobile|7778|npm run dev -- --host \$HOST"
    "Board    |services/board|7786|npm start"
    "Holdem   |services/holdem|7784|npm start"
    "Pool     |services/pool|7785|npm start"
    "Mahjong  |services/mahjong|7787|npm start"
    "AI-GW    |services/ai-gateway|7788|npm start"
    "WorldLabs|services/worldlabs|7790|npm start"
    "AI-Build |services/ai-builder|7791|npm start"
    "IPFS     |services/ipfs|7789|npm start"
)

# ── deps: npm apps (missing / incomplete / stale lockfile → reinstall) ────────
npm_deps() { # $1 = app dir (repo-relative), $2 = marker (install completeness tell-tale:
    #            bin name under node_modules/.bin, or a path with '/' checked under node_modules)
    local dir="$ROOT/$1" marker="${2:-vite}" reason= probe
    case "$marker" in */*) probe="$dir/node_modules/$marker" ;; *) probe="$dir/node_modules/.bin/$marker" ;; esac
    [ -d "$dir" ] || error "找不到 $dir"
    if   [ ! -d "$dir/node_modules" ]; then reason="缺少 node_modules"
    elif [ ! -e "$probe" ]; then reason="依赖不完整（$marker 未安装，可能上次安装中断）"
    elif [ -f "$dir/package-lock.json" ] && [ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]; then reason="依赖已过期（package-lock.json 比上次安装新）"
    fi
    if [ -n "$reason" ]; then
        info "$1 安装/更新依赖（${reason}）：npm install..."
        ( cd "$dir" && npm install )
    fi
}
if [ -z "$CHAIN" ]; then
    npm_deps client/desktop vite
    npm_deps services ws/package.json   # shared services/lib deps (game-host imports 'ws' → walk-up)
    npm_deps services/ai-gateway tsx
    npm_deps services/ai-builder tsx
    npm_deps services/worldlabs tsx
    npm_deps services/mahjong tsx
    npm_deps services/pool tsx
    npm_deps services/holdem tsx
    npm_deps services/board tsx
fi
npm_deps client/mobile vite      # chain 模式也要:链包由 mobile 壳构建
npm_deps services/ipfs tsx

# ── deps: engine (yarn; both clients compile its SOURCE via the @engine alias) ─
engine_reason=
if   [ ! -d "$ENGINE/node_modules" ]; then engine_reason="缺少 node_modules"
elif [ ! -f "$ENGINE/node_modules/.yarn-integrity" ]; then engine_reason="依赖不完整（.yarn-integrity 缺失，可能上次安装中断）"
elif [ -f "$ENGINE/yarn.lock" ] && [ "$ENGINE/yarn.lock" -nt "$ENGINE/node_modules/.yarn-integrity" ]; then engine_reason="依赖已过期（yarn.lock 比上次安装新）"
fi
if [ -n "$engine_reason" ]; then
    if command -v yarn &>/dev/null; then
        info "安装/更新 engine 依赖（${engine_reason}）：yarn install..."
        ( cd "$ENGINE" && yarn install )
    else
        warn "engine 依赖需要更新（${engine_reason}），但未找到 yarn —— 请手动执行：cd engine && yarn install"
    fi
fi

free_port() { # $1 = port
    if lsof -i ":$1" &>/dev/null; then
        warn "端口 $1 被占用，清理旧进程..."
        lsof -ti ":$1" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# ── chain mode: the world boots FROM the content gateway alone ────────────────
if [ -n "$CHAIN" ]; then
    FE_SERVICES=( "IPFS   |services/ipfs|7789|npm start" )
fi

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
for row in "${FE_SERVICES[@]}"; do
    IFS='|' read -r name path port cmd <<< "$row"
    free_port "$port"
    log="$LOG_DIR/$(echo "$name" | tr -d ' ' | tr '[:upper:]' '[:lower:]' | tr -d '-').log"
    ( cd "$ROOT/$path" && eval "$cmd" > "$log" 2>&1 ) &
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

# chain 模式:等网关健康 → 构建链包 + 组装 loader/锚(publish-chain)→ 自动开浏览器
if [ -n "$CHAIN" ]; then
    info "等待 IPFS 网关就绪..."
    for _ in $(seq 1 30); do curl -sf http://127.0.0.1:7789/v0/health >/dev/null 2>&1 && break; sleep 1; done
    curl -sf http://127.0.0.1:7789/v0/health >/dev/null 2>&1 || error "IPFS 网关未起来(deploy/logs/ipfs.log)"
    bash "$ROOT/deploy/publish-chain.sh" || error "链上发版失败"
    CHAIN_URL="http://127.0.0.1:7789/boot?name=septopus"
    [ "$(uname)" = "Darwin" ] && open "$CHAIN_URL" 2>/dev/null || true
    sleep 1
fi

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
START_TOTAL=$(date +%s)
clear; tput civis 2>/dev/null || true

# ── dashboard loop (solo-style: repaint every 2s) ─────────────────────────────
# 每行前的 [ON]/[OFF] 即实时状态灯(lsof 端口探针,同端口行共用一个事实);
# 服务 [OFF] 时看 deploy/logs/<service>.log(说明段有全表)。
st() { if lsof -i ":$1" -sTCP:LISTEN &>/dev/null; then printf '%s' "${GREEN}[ON] ${NC}"; else printf '%s' "${RED}[OFF]${NC}"; fi; }
while true; do
    tput cup 0 0 2>/dev/null || clear
    printf -- "${BLUE}${BOLD}=== SEPTOPUS WORLD · DEV DASHBOARD ===${NC}\n"
    printf -- "${CYAN}Uptime: $(($(date +%s) - START_TOTAL))s | host: $HOST$( [ "$HOST" = "0.0.0.0" ] && [ -n "$LAN_IP" ] && echo " | LAN: $LAN_IP" )${NC}\n"

    if [ -n "$CHAIN" ]; then
    printf -- "\n${BOLD}UI 入口(浏览器打开)${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  链上启动       $(st 7789) ${GREEN}$CHAIN_URL${NC}\n"
    printf -- "                       锚(anchor:septopus)→ ROOT loader → 封套验证 → 3D 世界;无应用服务器\n"
    printf -- "  协议 stub      $(st 7789) ${GREEN}http://127.0.0.1:7789/boot${NC}(anchor:world,微型 loader 彩排)\n"
    printf -- "\n${BOLD}API 服务${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  IPFS 网关      $(st 7789) ${GREEN}:7789${NC}  /v0/health · /v0/names · /ipfs/<cid> · /assets/<file>\n"
    printf -- "\n${BOLD}说明${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  人工核实       services/ipfs/data/{app,content}/(符号链接镜像,blobs/ 为真身)\n"
    printf -- "  重新发版       ${CYAN}bash deploy/publish-chain.sh${NC}(改代码/数据后)\n"
    printf -- "  日志           deploy/logs/ipfs.log\n"
    else
    printf -- "\n${BOLD}UI 入口(浏览器打开)${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  桌面世界       $(st 7777) ${GREEN}http://127.0.0.1:7777/${NC}(默认=功能展厅走廊 ①–⑳,尽头传送广场)\n"
    printf -- "  移动世界       $(st 7778) ${GREEN}http://127.0.0.1:7778/${NC}"
    [ "$HOST" = "0.0.0.0" ] && [ -n "$LAN_IP" ] && printf -- "   ${CYAN}真机 → http://$LAN_IP:7778/${NC}"
    printf -- "\n"
    printf -- "  综合演示区     $(st 7777) ${GREEN}http://127.0.0.1:7777/?level=demo${NC}(游戏桌/编辑器素材,旧默认场景)\n"
    printf -- "  SPP粒子编辑器  $(st 7777) ${GREEN}http://127.0.0.1:7777/?tool=stylepack${NC}\n"
    printf -- "  链上启动页     $(st 7789) ${GREEN}http://127.0.0.1:7789/boot?name=septopus${NC}(先发版,见下)\n"
    printf -- "\n${BOLD}API 服务${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  德州扑克       $(st 7784) ${GREEN}:7784${NC}  POST /api/holdem/{start,state,act,end} · ws /live\n"
    printf -- "  桌球           $(st 7785) ${GREEN}:7785${NC}  POST /api/pool/{start,state,shoot,end} · ws /live\n"
    printf -- "  留言板         $(st 7786) ${GREEN}:7786${NC}  GET /v0/list?channel= · POST /v0/post\n"
    printf -- "  麻将           $(st 7787) ${GREEN}:7787${NC}  POST /api/mahjong/{start,state,discard,win,end} · ws /live\n"
    printf -- "  AI 造物        $(st 7788) ${GREEN}:7788${NC}  POST /v0/generate · POST /v0/revise\n"
    printf -- "  AI 造物 v2     $(st 7791) ${GREEN}:7791${NC}  POST /v0/generate(直出 adjunct + 服务端碰撞校验,实验)\n"
    printf -- "  AI 生成世界    $(st 7790) ${GREEN}:7790${NC}  POST /v0/generate · GET /v0/jobs/:id(画廊㉑,Marble API)\n"
    printf -- "  IPFS 网关      $(st 7789) ${GREEN}:7789${NC}  /v0/health · /v0/names · /ipfs/<cid> · /assets/<file> · POST /v0/add\n"
    printf -- "\n${BOLD}说明${NC}\n"
    printf -- "--------------------------------------------------------------------------------\n"
    printf -- "  游戏服务       一游戏一服务(会话在服务端);服务不在线时页面内 loopback 自动兜底\n"
    printf -- "  AI provider    ${PROVIDER:-mock}(导出 PROVIDER=qwen + DASHSCOPE_API_KEY 换真 LLM)\n"
    printf -- "  世界生成provider ${WORLDLABS_PROVIDER:-mock}(导出 WORLDLABS_PROVIDER=real + WORLDLABS_API_KEY 换真 Marble,耗真额度+约5分钟)\n"
    printf -- "  进程内层       CAS 一级缓存(MemoryCas,离线兜底) · live 推送(FakeWebSocket)\n"
    printf -- "  链上启动模式   ${CYAN}bash deploy/dev.sh --chain${NC}(只起网关;锚→loader→世界)\n"
    printf -- "  发版彩排       ${CYAN}bash deploy/publish-chain.sh${NC}(构建链包+组装 loader/锚)\n"
    printf -- "  日志           deploy/logs/{desktop,mobile,holdem,pool,board,mahjong,aigw,aibuild,worldlabs,ipfs}.log\n"
    fi

    printf -- "\n${YELLOW}Ctrl+C 停止全部。${NC}\n"
    sleep 2
done
