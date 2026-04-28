#!/usr/bin/env bash
set -euo pipefail

# Zombie-Coder-Agentic-Hub Linux bootstrap
#
# What this script does:
# - Clones the repo (or uses existing checkout)
# - Creates environment templates you can fill in
# - Installs Node dependencies (server + admin panel)
# - Prints the exact run commands
#
# What this script does NOT do:
# - It does NOT download large AI model files (.gguf)
# - It does NOT install system packages via apt/yum (you should do that)
# - It does NOT configure Cloudflare credentials (secrets) for you
#
# Prerequisites on Linux:
# - git
# - node >= 20
# - npm
# - python3 (only needed if you enable CHROMA_BOOTSTRAP)
#
# Usage:
#   ./scripts/setup-linux.sh [install_dir]
# Examples:
#   ./scripts/setup-linux.sh ~/apps/Zombie-Coder-Agentic-Hub

REPO_URL="https://github.com/zombiecoderbd/Zombie-Coder-Agentic-Hub.git"
INSTALL_DIR="${1:-$(pwd)/Zombie-Coder-Agentic-Hub}"

mkdir -p "${INSTALL_DIR}"

if [ ! -d "${INSTALL_DIR}/.git" ]; then
  echo "Cloning repo into: ${INSTALL_DIR}"
  git clone "${REPO_URL}" "${INSTALL_DIR}"
else
  echo "Repo already exists: ${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

# Server env template
if [ ! -f server/.env.local ]; then
  echo "Creating server/.env.local template"
  cat > server/.env.local <<'EOF'
# Backend URL used by Next proxy routes
UAS_API_URL=http://localhost:8000

# API protection for admin/settings/mcp execute
UAS_API_KEY=change_me_to_a_strong_key

# MySQL (optional)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=uas_admin

# CORS
CORS_ORIGIN=http://localhost:3000

# RAG/Chroma
RAG_ENABLED=true
RAG_VECTOR_BACKEND=chroma
CHROMA_URL=http://127.0.0.1:8001
CHROMA_COLLECTION=zombiecoder_metadata
CHROMA_MANAGED=true
# Optional auto-install (uses python3 + venv)
CHROMA_BOOTSTRAP=false
CHROMA_BOOTSTRAP_VENV=.chroma_venv

# Public gateway
PUBLIC_GATEWAY_ENABLED=true
PUBLIC_GATEWAY_PORT=9000
# Uses official cloudflared YAML below by default:
# server/config/cloudflared.yml
EOF
  echo "Created: server/.env.local"
else
  echo "server/.env.local exists, leaving it unchanged"
fi

# Cloudflared config template (non-secret)
if [ ! -f server/config/cloudflared.yml ]; then
  echo "Creating server/config/cloudflared.yml template"
  mkdir -p server/config
  cat > server/config/cloudflared.yml <<'EOF'
# cloudflared official configuration
#
# NOTE: Do NOT store credentials JSON in git.
# Put it under ~/.cloudflared/<tunnel-id>.json

tunnel: PUT_YOUR_TUNNEL_UUID_HERE
credentials-file: /home/<user>/.cloudflared/PUT_YOUR_TUNNEL_UUID_HERE.json

ingress:
  - hostname: a.smartearningplatformbd.net
    service: http://127.0.0.1:8000
  - hostname: lama.smartearningplatformbd.net
    service: http://127.0.0.1:15000
  - hostname: smartearningplatformbd.net
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF
  echo "Created: server/config/cloudflared.yml"
fi

echo "Installing root dependencies (admin panel)"
npm install

echo "Installing server dependencies"
( cd server && npm install )

echo "Build server"
( cd server && npm run build )

echo "Next steps:"
cat <<'EOF'

1) Start backend server:
   cd server
   npm start

2) Start admin panel (in another terminal):
   cd ..
   npm run dev

3) Check statuses:
   curl http://127.0.0.1:8000/status/rag
   curl http://127.0.0.1:9000/status

Notes:
- Models (.gguf) are not included in git. Download them separately and set paths in your env.
- If you want Chroma auto-install on Linux, set:
    CHROMA_BOOTSTRAP=true
  and ensure python3 is available.
EOF
