#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/apps/frontend"
BACKEND_DIR="$SCRIPT_DIR/apps/backend"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

cd "$FRONTEND_DIR"
npm install
VITE_API_BASE_URL="http://127.0.0.1:8000" npm run build

rm -rf "$BACKEND_DIR/frontend_dist"
mkdir -p "$BACKEND_DIR/frontend_dist"
cp -R "$FRONTEND_DIR/dist/" "$BACKEND_DIR/frontend_dist/"
