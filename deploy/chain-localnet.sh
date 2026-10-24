#!/usr/bin/env bash
# Start (or reuse) a local solana-test-validator preloaded with the
# septopus_land program, then ensure the default world ('septopus') is
# initialized on chain.
#
# Usage:
#   bash deploy/chain-localnet.sh          # start if not running + init world
#   bash deploy/chain-localnet.sh stop     # stop the validator
#   bash deploy/chain-localnet.sh reset    # wipe ledger + restart + init world
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="$ROOT/chain/test-ledger"
LOG="$ROOT/deploy/logs/solana-validator.log"
PID_FILE="$ROOT/deploy/logs/solana-validator.pid"
PROGRAM_ID="BchyjzrcoUdsuLH8fdbx1GSDj95cf3nvcAKeKsmC9ye5"
SO="$ROOT/chain/target/deploy/septopus_land.so"

mkdir -p "$ROOT/deploy/logs"

rpc_up() {
  curl -sf -X POST http://127.0.0.1:8899 \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' >/dev/null 2>&1
}

stop_validator() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  pkill -f "solana-test-validator.*$LEDGER" 2>/dev/null || true
}

cmd="${1:-start}"
if [[ "$cmd" == "stop" ]]; then
  stop_validator
  echo "[localnet] validator stopped"
  exit 0
fi

if [[ "$cmd" == "reset" ]]; then
  stop_validator
  rm -rf "$LEDGER"
fi

if [[ ! -f "$SO" ]]; then
  echo "[localnet] building septopus_land.so..."
  (cd "$ROOT/chain" && anchor build)
fi

if ! rpc_up; then
  echo "[localnet] starting solana-test-validator on :8899 (program $PROGRAM_ID)..."
  solana-test-validator \
    --ledger "$LEDGER" \
    --bpf-program "$PROGRAM_ID" "$SO" \
    --reset \
    --quiet >"$LOG" 2>&1 &
  echo $! >"$PID_FILE"
  for _ in {1..40}; do
    rpc_up && break
    sleep 0.25
  done
  rpc_up || { echo "[localnet] validator failed to start; see $LOG" >&2; exit 1; }
fi

(cd "$ROOT/client/chain" && npm run --silent init-world)
echo "[localnet] ready at http://127.0.0.1:8899"
