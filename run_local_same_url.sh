#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/apps/backend"
VENV_DIR="$SCRIPT_DIR/env"
PORT="8000"

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

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if [ "${FORCE_RESTART:-0}" = "1" ]; then
    echo "Port $PORT is busy. Stopping existing local runserver process."
    pkill -f "manage.py runserver 127.0.0.1:$PORT" || true
    sleep 1
  else
    echo "Port $PORT is already in use. Stop that process or run:"
    echo "FORCE_RESTART=1 ./run_local_same_url.sh"
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
    exit 1
  fi
fi

"$SCRIPT_DIR/build_and_copy_frontend.sh"

# Reuse the repo-local virtual environment expected by project_working_details.txt.
# shellcheck source=/dev/null
. "$VENV_DIR/bin/activate"

cd "$BACKEND_DIR"
echo "Applying Django migrations"
python3 manage.py migrate --noinput
echo "Starting WorkZilla local app at http://127.0.0.1:$PORT"
exec python3 manage.py runserver 127.0.0.1:"$PORT"
