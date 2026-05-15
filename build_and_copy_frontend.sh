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
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
VITE_API_BASE_URL="http://127.0.0.1:8000" npm run build

python3 - <<'PY'
from pathlib import Path

index_path = Path("dist/index.html")
lines = index_path.read_text(encoding="utf-8").splitlines()
lines = [line for line in lines if 'rel="modulepreload"' not in line]
index_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

rm -rf "$BACKEND_DIR/frontend_dist"
mkdir -p "$BACKEND_DIR/frontend_dist"
cp -R "$FRONTEND_DIR/dist/" "$BACKEND_DIR/frontend_dist/"
