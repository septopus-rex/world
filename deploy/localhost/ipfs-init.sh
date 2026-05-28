#!/usr/bin/env bash
# One-time IPFS initialization: init repo and configure CORS for browser access.
set -e

if [ -d "$HOME/.ipfs" ]; then
    echo "[ipfs-init] repo already exists, skipping init"
else
    echo "[ipfs-init] initializing IPFS repo..."
    ipfs init
fi

echo "[ipfs-init] configuring CORS..."
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173","http://localhost:4173","http://127.0.0.1:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Authorization"]'
ipfs config --json API.HTTPHeaders.Access-Control-Expose-Headers '["Location"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Credentials '["true"]'

# Gateway CORS (for direct asset fetching from browser)
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["*"]'

echo "[ipfs-init] done"
