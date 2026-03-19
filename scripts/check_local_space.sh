#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Project root: $ROOT_DIR"
echo
echo "Total size:"
du -sh .
echo
echo "Top-level usage:"
du -sh .git apps env 2>/dev/null | sort -hr
echo
echo "Largest app folders:"
du -sh apps/* 2>/dev/null | sort -hr | head -n 20
echo
echo "Largest files (>100MB):"
find . -type f -size +100M -print | sort | head -n 50

