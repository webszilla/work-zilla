#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Deleting old local installer artifacts before new build"
python3 "$ROOT_DIR/scripts/sync_application_downloads.py" --clean-local-first
