#!/usr/bin/env bash
# Local dev environment: Solana localnet + IPFS + app frontend.
# Usage: bash deploy/dev.sh [--skip-deploy]
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
LOCALHOST="$DEPLOY/localhost"

SKIP_DEPLOY=false
[[ "${1:-}" == "--skip-deploy" ]] && SKIP_DEPLOY=true

VALIDATOR_PID=""
IPFS_PID=""
APP_PID=""
CONFIG_BACKED_UP=false

# ── Helpers ──────────────────────────────────────────────────────────────────

log() { echo "[dev] $*"; }

port_in_use() { lsof -i ":$1" &>/dev/null; }

wait_for_port() {
    local port=$1 label=$2 retries=20
    log "waiting for $label on :$port..."
    while ! lsof -i ":$port" &>/dev/null; do
        retries=$((retries - 1))
        [ $retries -le 0 ] && { log "ERROR: $label failed to start"; exit 1; }
        sleep 1
    done
    log "$label ready"
}

# ── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
    echo ""
    log "shutting down..."
    [ -n "$APP_PID" ]       && kill "$APP_PID"       2>/dev/null || true
    [ -n "$IPFS_PID" ]      && kill "$IPFS_PID"      2>/dev/null || true
    [ -n "$VALIDATOR_PID" ] && kill "$VALIDATOR_PID" 2>/dev/null || true

    if $CONFIG_BACKED_UP; then
        mv "$ROOT/app/src/config.js.bak" "$ROOT/app/src/config.js"
        log "restored app/src/config.js"
    fi
    log "done"
}
trap cleanup EXIT INT TERM

# ── 1. Check dependencies ─────────────────────────────────────────────────────

log "checking dependencies..."
MISSING=()
for tool in solana anchor ipfs node yarn; do
    command -v "$tool" &>/dev/null || MISSING+=("$tool")
done

if [ ${#MISSING[@]} -gt 0 ]; then
    log "missing tools: ${MISSING[*]}"
    log "running setup.sh..."
    bash "$DEPLOY/setup.sh" "${MISSING[@]}"

    # Re-source paths that setup.sh may have added
    [ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # Re-check
    for tool in solana anchor ipfs; do
        command -v "$tool" &>/dev/null || {
            log "ERROR: $tool still not found after setup. Restart your shell and try again."
            exit 1
        }
    done
fi

# ── 2. Solana test validator ───────────────────────────────────────────────────

if port_in_use 8899; then
    log "solana-test-validator already running on :8899, skipping"
else
    log "starting solana-test-validator..."
    solana-test-validator \
        --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
        "$ROOT/chain/mpl_token_metadata.so" \
        --reset \
        --quiet &
    VALIDATOR_PID=$!
    wait_for_port 8899 "solana-test-validator"
fi

solana config set --url http://localhost:8899 &>/dev/null

# ── 3. Build & deploy Anchor program ─────────────────────────────────────────

if $SKIP_DEPLOY; then
    log "--skip-deploy set, skipping anchor build/deploy"
else
    log "building Anchor program..."
    cd "$ROOT/chain"
    anchor build
    log "deploying to localnet..."
    anchor deploy
    cd "$ROOT"
fi

# ── 4. IPFS daemon ────────────────────────────────────────────────────────────

if port_in_use 5001; then
    log "IPFS already running on :5001, skipping"
else
    bash "$LOCALHOST/ipfs-init.sh"
    log "starting IPFS daemon..."
    ipfs daemon &>/tmp/ipfs-dev.log &
    IPFS_PID=$!
    wait_for_port 5001 "IPFS daemon"
fi

# ── 5. App frontend ───────────────────────────────────────────────────────────

log "swapping app/src/config.js → localhost config..."
cp "$ROOT/app/src/config.js" "$ROOT/app/src/config.js.bak"
CONFIG_BACKED_UP=true
cp "$LOCALHOST/config.js" "$ROOT/app/src/config.js"

log "starting app dev server..."
cd "$ROOT/app"
yarn dev &
APP_PID=$!
cd "$ROOT"

wait_for_port 5173 "app"

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  Local environment ready                │"
echo "│  Solana RPC : http://localhost:8899     │"
echo "│  IPFS API   : http://localhost:5001     │"
echo "│  IPFS GW    : http://localhost:8080     │"
echo "│  App        : http://localhost:5173     │"
echo "│  IPFS log   : /tmp/ipfs-dev.log         │"
echo "│  Ctrl+C to stop all services            │"
echo "└─────────────────────────────────────────┘"

wait
