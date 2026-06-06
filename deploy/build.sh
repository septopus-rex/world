#!/usr/bin/env bash
# Production build of the desktop 3D client → client/desktop/dist (static PWA).
#
# The output is a fully static, offline-capable PWA — host it on any static file
# server / OSS / CDN. No chain, no backend required.
#
# Usage: bash deploy/build.sh [--preview]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/client/desktop"

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; NC=$'\033[0m'
info()  { printf "${GREEN}[build]${NC} %s\n" "$*"; }
error() { printf "${RED}[build]${NC} %s\n" "$*" >&2; exit 1; }

command -v npm &>/dev/null || error "npm 未安装"
[ -d "$CLIENT" ] || error "找不到 $CLIENT"

[ -d "$CLIENT/node_modules" ] || ( cd "$CLIENT" && npm install )

info "构建 client/desktop ..."
( cd "$CLIENT" && npm run build )
info "完成 → $CLIENT/dist  (静态 PWA，可直接托管到任意静态服务器 / OSS / CDN)"

if [[ "${1:-}" == "--preview" ]]; then
    info "本地预览 (npm run preview)..."
    cd "$CLIENT" && exec npm run preview
fi
