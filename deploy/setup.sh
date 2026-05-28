#!/usr/bin/env bash
# One-time setup: install solana CLI, anchor (via avm), and kubo (IPFS).
# Safe to re-run — each step checks before installing.
set -e

MISSING=("$@")  # accepts list of missing tools from dev.sh

need() { [[ " ${MISSING[*]} " =~ " $1 " ]] || ! command -v "$1" &>/dev/null; }

echo "==> setup.sh starting (missing: ${MISSING[*]:-none specified, checking all})"

# ── Rust (anchor depends on it) ──────────────────────────────────────────────
if need rust || ! command -v cargo &>/dev/null; then
    echo "[setup] installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
    source "$HOME/.cargo/env"
fi

# ── Solana CLI ───────────────────────────────────────────────────────────────
if need solana; then
    echo "[setup] installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # Create default keypair if missing
    if [ ! -f "$HOME/.config/solana/id.json" ]; then
        echo "[setup] generating default Solana keypair..."
        solana-keygen new --no-bip39-passphrase -o "$HOME/.config/solana/id.json"
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
