#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="/Users/guru/Desktop/webszilla/saas/work-zilla/apps/frontend"
BACKEND_DIR="/Users/guru/Desktop/webszilla/saas/work-zilla/apps/backend"

cd "$FRONTEND_DIR"
npm install
VITE_API_BASE_URL="http://127.0.0.1:8000" npm run build

rm -rf "$BACKEND_DIR/frontend_dist"
mkdir -p "$BACKEND_DIR/frontend_dist"
cp -R "$FRONTEND_DIR/dist/" "$BACKEND_DIR/frontend_dist/"
