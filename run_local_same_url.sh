#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/apps/backend"
VENV_DIR="$SCRIPT_DIR/env"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not available. Install it with nvm or add it to PATH."
  exit 1
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "Missing virtual environment at $VENV_DIR"
  exit 1
fi

"$SCRIPT_DIR/build_and_copy_frontend.sh"

# Reuse the repo-local virtual environment expected by project_working_details.txt.
# shellcheck source=/dev/null
. "$VENV_DIR/bin/activate"

cd "$BACKEND_DIR"
exec python3 manage.py runserver 127.0.0.1:8000
