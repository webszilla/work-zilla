#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_HOST="${SERVER_HOST:-root@89.167.16.104}"
SERVER_DOWNLOADS_PATH="${SERVER_DOWNLOADS_PATH:-/home/workzilla/docker-data/volumes/workzilla_html_data/_data/getworkzilla.com/apps/backend/static/downloads/}"
LOCAL_DOWNLOADS_PATH="${LOCAL_DOWNLOADS_PATH:-$ROOT_DIR/apps/backend/static/downloads/}"

echo "Uploading installers from ${LOCAL_DOWNLOADS_PATH}"
echo "Target: ${SERVER_HOST}:${SERVER_DOWNLOADS_PATH}"

rsync -az --delete \
  "$LOCAL_DOWNLOADS_PATH" \
  "${SERVER_HOST}:${SERVER_DOWNLOADS_PATH}"

echo "Server downloads:"
ssh "$SERVER_HOST" "ls -lh \"$SERVER_DOWNLOADS_PATH\" | sed -n '1,80p'"

echo "Verifying download URLs"
curl -I -s https://getworkzilla.com/downloads/windows-agent/ | head -n 5
curl -I -s https://getworkzilla.com/downloads/mac-agent/ | head -n 5
curl -I -s https://getworkzilla.com/downloads/bootstrap-products.json | head -n 5
