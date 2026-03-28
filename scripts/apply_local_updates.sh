#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] React build"
cd apps/frontend
npm run build

echo "[2/4] Sync frontend_dist"
rsync -a --delete dist/ ../backend/frontend_dist/
cd "$ROOT_DIR"

echo "[3/4] Django migrate"
./.venv/bin/python apps/backend/manage.py migrate --skip-checks

echo "[4/4] Restart dev server (8000)"
(lsof -ti tcp:8000 | xargs -r kill -9) || true
nohup ./.venv/bin/python apps/backend/manage.py runserver 0.0.0.0:8000 --noreload --skip-checks > logs/dev_server.log 2>&1 &
sleep 2

echo "Done. Server running on http://127.0.0.1:8000"
