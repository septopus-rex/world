#!/usr/bin/env bash
# One-time setup: install solana CLI, anchor (via avm), and kubo (IPFS).
# Safe to re-run — each step checks before installing.
set -e

MISSING=("$@")  # accepts list of missing tools from dev.sh

need() { [[ " ${MISSING[*]} " =~ " $1 " ]] || ! command -v "$1" &>/dev/null; }

echo "==> setup.sh starting (missing: ${MISSING[*]:-none specified, checking all})"

# ── Rust (anchor depends on it) ──────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
    echo "[setup] installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
    source "$HOME/.cargo/env"
fi

# ── Solana CLI ───────────────────────────────────────────────────────────────
if need solana; then
    echo "[setup] installing Solana CLI v1.18.26..."
    sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # Create default keypair if missing
    if [ ! -f "$HOME/.config/solana/id.json" ]; then
        echo "[setup] generating default Solana keypair..."
        solana-keygen new --no-bip39-passphrase -o "$HOME/.config/solana/id.json"
    fi
fi

# ── 确保 active_release 指向 v1.18.26 ───────────────────────────────────────
_SOLANA_ACTIVE="$HOME/.local/share/solana/install/active_release"
_V118="$HOME/.local/share/solana/install/releases/1.18.26/solana-release"
if [ -d "$_V118" ]; then
    _CURRENT=$(readlink "$_SOLANA_ACTIVE" 2>/dev/null || true)
    if [ "$_CURRENT" != "$_V118" ]; then
        echo "[setup] 切换 active_release → v1.18.26"
        rm -f "$_SOLANA_ACTIVE"
        ln -s "$_V118" "$_SOLANA_ACTIVE"
    fi
fi

# ── Anchor (via avm) ─────────────────────────────────────────────────────────
if need anchor; then
    echo "[setup] installing avm + anchor..."
    cargo install --git https://github.com/coral-xyz/anchor avm --force
    avm install latest
    avm use latest
fi

# ── Kubo (IPFS) ──────────────────────────────────────────────────────────────
if need ipfs; then
    if command -v brew &>/dev/null; then
        echo "[setup] installing kubo via brew..."
        brew install kubo
    else
        echo "[setup] brew not found — please install kubo manually:"
        echo "  https://docs.ipfs.tech/install/command-line/"
        exit 1
    fi
fi

echo ""
echo "==> setup complete. You may need to restart your shell or run:"
echo "    source ~/.cargo/env"
echo "    export PATH=\"\$HOME/.local/share/solana/install/active_release/bin:\$PATH\""
