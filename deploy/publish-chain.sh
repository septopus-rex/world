#!/usr/bin/env bash
# Septopus · 链上发版(dev 彩排)——protocol/cn|en/boot-chain.md §7 的流程实现:
#
#   build(mobile 壳单文件 IIFE)→ 网关重播种(组装 septopus.loader 文档 + 锚)
#   → 打印 ROOT_CID/锚,浏览器打开 /boot?name=septopus 即链上启动完整 3D 世界。
#
# 与主网发版的差别只有最后一步:dev 把锚写进网关名字索引(boot-chain §5 替身),
# 主网则用创世密钥把同一份微格式记录发到比特币。前面的构建/组装/寻址逐字节相同。
#
# Usage: bash deploy/publish-chain.sh     (需要 services/ipfs 网关在跑,dev.sh 会带起)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GW="${GW:-http://127.0.0.1:7789}"

GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; CYAN=$'\033[0;36m'; NC=$'\033[0m'
info()  { printf "${GREEN}[publish]${NC} %s\n" "$*"; }
error() { printf "${RED}[publish]${NC} %s\n" "$*" >&2; exit 1; }

# 1. 构建:mobile 壳 → 单文件 IIFE(dist-chain/app.js + style.css)
info "1/3 构建链包(client/mobile → dist-chain)..."
( cd "$ROOT/client/mobile" && npm run build:chain ) | tail -2

# 2. 网关重播种:seed() 读 dist-chain → 组装 loader 文档(prelude+css+app,
#    world 指向锚定的世界配置 CID)→ 写锚 anchor:septopus
curl -sf "$GW/v0/health" >/dev/null || error "网关不在线($GW)——先跑 bash deploy/dev.sh 或 cd services/ipfs && npm start"
info "2/3 网关重播种(组装 loader + 锚)..."
curl -sf -X POST "$GW/v0/reseed" >/dev/null || error "reseed 失败"

# 3. 打印发版结果
LOADER=$(curl -s "$GW/v0/name/loader:chain" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cid','?'))")
ANCHOR=$(curl -s "$GW/v0/name/anchor:septopus" | python3 -c "import json,sys; print(json.load(sys.stdin).get('cid','?'))")
info "3/3 发版完成"
printf "${CYAN}  ROOT_CID(loader) %s${NC}\n" "$LOADER"
printf "${CYAN}  锚记录            %s${NC}\n" "$ANCHOR"
printf "${CYAN}  链上启动          %s/boot?name=septopus${NC}\n" "$GW"
printf "  (主网:用创世密钥把 {p:septopus,name,version,cid:%s…} 发上比特币即完成同一发版)\n" "${LOADER:0:16}"
