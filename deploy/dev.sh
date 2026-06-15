#!/usr/bin/env bash
# Dev launcher for the chain-free desktop 3D client (client/desktop).
#
# This is the slimmed, chain-free replacement of the old dev.sh. The previous
# version orchestrated solana-test-validator + anchor build/deploy + IPFS +
# config swap for the legacy app/. That full chain dev environment is archived
# (untracked) at chain/deploy/ — restore from there if you need the on-chain stack.
#
# Usage: bash deploy/dev.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/client/desktop"
PORT=7777

# ── colors ────────────────────────────────────────────────────────────────────
GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; CYAN=$'\033[0;36m'; NC=$'\033[0m'
info()  { printf "${GREEN}[dev]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[dev]${NC} %s\n" "$*"; }
error() { printf "${RED}[dev]${NC} %s\n" "$*" >&2; exit 1; }

command -v node &>/dev/null || error "node 未安装"
command -v npm  &>/dev/null || error "npm 未安装"
[ -d "$CLIENT" ] || error "找不到 $CLIENT"

# ── deps ────────────────────────────────────────────────────────────────────────
# Reinstall not just when node_modules is MISSING, but also when it is INCOMPLETE
# (an interrupted install — the vite binary is the tell-tale) or STALE (the
# lockfile changed since the last install, e.g. after a git pull added a dep).
# The old check only tested directory existence, so a half-installed or outdated
# node_modules silently skipped install and vite then failed with "Cannot find module".
deps_reason=
if [ ! -d "$CLIENT/node_modules" ]; then
    deps_reason="缺少 node_modules"
elif [ ! -x "$CLIENT/node_modules/.bin/vite" ]; then
    deps_reason="依赖不完整（vite 未安装，可能上次安装中断）"
elif [ -f "$CLIENT/package-lock.json" ] && [ "$CLIENT/package-lock.json" -nt "$CLIENT/node_modules/.package-lock.json" ]; then
    deps_reason="依赖已过期（package-lock.json 比上次安装新）"
fi
if [ -n "$deps_reason" ]; then
    info "安装/更新依赖（$deps_reason）：npm install..."
    ( cd "$CLIENT" && npm install )
fi

# ── free the dev port (vite is configured strictPort) ───────────────────────────
if lsof -i ":$PORT" &>/dev/null; then
    warn "端口 $PORT 被占用，清理旧进程..."
    lsof -ti ":$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
fi

printf "${CYAN}=== Septopus World · Desktop Client (chain-free) ===${NC}\n"
info "启动 dev server → http://127.0.0.1:$PORT"
info "Ctrl+C 停止"

# vite handles its own SIGINT; run in foreground.
cd "$CLIENT" && exec npm run dev
