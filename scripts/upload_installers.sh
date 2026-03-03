#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Syncing generated application downloads to Backblaze"
python3 "$ROOT_DIR/scripts/sync_application_downloads.py" "$@"

echo "Verifying download URLs"
curl -I -s https://getworkzilla.com/downloads/windows-agent/ | head -n 5
curl -I -s https://getworkzilla.com/downloads/mac-agent/ | head -n 5
curl -I -s https://getworkzilla.com/downloads/application-files/ | head -n 5
curl -I -s https://getworkzilla.com/downloads/bootstrap-products.json | head -n 5
