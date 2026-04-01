#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-root@89.167.16.104}"
SERVER_PROJECT_PATH="${SERVER_PROJECT_PATH:-/home/workzilla/docker-data/volumes/workzilla_html_data/_data/getworkzilla.com}"
SERVER_MIN_FREE_MB="${SERVER_MIN_FREE_MB:-1024}"
SERVER_RETENTION_DAYS="${SERVER_RETENTION_DAYS:-3}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/workzilla_root}"

FORBIDDEN_DEPLOY_PATTERNS=(
  "*.sqlite3"
  "*.sqlite3-journal"
  "*.sqlite3-wal"
  "*.sqlite3-shm"
  "*.sql"
  "*.dump"
  "*.bak"
)

echo "Deploying code to ${SERVER_HOST}:${SERVER_PROJECT_PATH}"

cd "$(dirname "$0")/.."

require_file() {
  local path="$1"
  local label="$2"
  if [ ! -f "$path" ]; then
    echo "ERROR: ${label} not found at ${path}"
    exit 1
  fi
}

check_local_forbidden_db_artifacts() {
  local found=0
  local search_paths=(
    "apps/backend"
    "backups"
    "tmp"
  )
  for base in "${search_paths[@]}"; do
    if [ ! -e "$base" ]; then
      continue
    fi
    while IFS= read -r path; do
      [ -n "$path" ] || continue
      found=1
      echo "Blocked local DB artifact: $path"
    done < <(find "$base" -type f \( \
      -name '*.sqlite3' -o \
      -name '*.sqlite3-journal' -o \
      -name '*.sqlite3-wal' -o \
      -name '*.sqlite3-shm' -o \
      -name '*.sql' -o \
      -name '*.dump' -o \
      -name '*.bak' \
    \) 2>/dev/null)
  done
  if [ "$found" -eq 1 ]; then
    echo "ERROR: Local DB artifacts detected in deploy-sensitive folders. Remove/move them before deploy."
    exit 1
  fi
}

check_git_forbidden_db_tracking() {
  local found=0
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    found=1
    echo "Blocked tracked DB artifact in git: $path"
  done < <(git ls-files | grep -E '(^|/).+(\.sqlite3|\.sqlite3-journal|\.sqlite3-wal|\.sqlite3-shm|\.sql|\.dump|\.bak)$' || true)
  if [ "$found" -eq 1 ]; then
    echo "ERROR: Forbidden DB/runtime artifacts are tracked in git. Untrack them before deploy."
    exit 1
  fi
}

check_local_env_postgres_only() {
  require_file "apps/backend/.env" "Local backend env"
  if ! grep -Eq '^DB_ENGINE=postgres(ql)?$' apps/backend/.env; then
    echo "ERROR: Local apps/backend/.env must use DB_ENGINE=postgresql before deploy."
    exit 1
  fi
}

preflight_local_deploy_guard() {
  require_file "$SSH_KEY_PATH" "Deploy SSH key"
  check_local_env_postgres_only
  check_local_forbidden_db_artifacts
  check_git_forbidden_db_tracking
}

preflight_local_deploy_guard

DEPLOY_MODE="git"
if ! ssh -i "$SSH_KEY_PATH" "$SERVER_HOST" "[ -d '$SERVER_PROJECT_PATH/.git' ]" >/dev/null 2>&1; then
  DEPLOY_MODE="rsync"
fi

if [ "$DEPLOY_MODE" = "rsync" ]; then
  echo "Remote .git missing. Using rsync fallback deploy."
  rsync -az \
    --exclude '.git/' \
    --exclude 'venv/' \
    --exclude '.venv/' \
    --exclude 'env/' \
    --exclude 'apps/backend/.env' \
    --exclude 'apps/frontend/.env' \
    --exclude 'apps/frontend/.env.*' \
    --exclude '*.sqlite3' \
    --exclude '*.sqlite3-journal' \
    --exclude '*.sqlite3-wal' \
    --exclude '*.sqlite3-shm' \
    --exclude '*.sql' \
    --exclude '*.dump' \
    --exclude '*.bak' \
    --exclude 'logs/' \
    --exclude 'apps/backend/backups/postgres_migration/' \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    --exclude '.build/' \
    --exclude 'apps/desktop_app/dist/' \
    --exclude 'apps/bootstrap_installer/dist/' \
    --exclude 'apps/desktop_app/mac_helper/.build/' \
    --exclude 'build/' \
    -e "ssh -i ${SSH_KEY_PATH}" \
    ./ "${SERVER_HOST}:${SERVER_PROJECT_PATH}/"
fi

ssh -i "$SSH_KEY_PATH" "$SERVER_HOST" "SERVER_PROJECT_PATH='$SERVER_PROJECT_PATH' SERVER_MIN_FREE_MB='$SERVER_MIN_FREE_MB' SERVER_RETENTION_DAYS='$SERVER_RETENTION_DAYS' SERVER_DEPLOY_MODE='$DEPLOY_MODE' bash -s" <<'EOF'
set -euo pipefail

min_free_mb="${SERVER_MIN_FREE_MB:-1024}"
retention_days="${SERVER_RETENTION_DAYS:-3}"

check_free_mb() {
  df -Pm / | awk 'NR==2 {print $4}'
}

truncate_file_if_exists() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    truncate -s 0 "$file_path" || true
  fi
}

ensure_disk_guard_cron() {
  cat > /usr/local/bin/workzilla_log_guard.sh <<'GUARD_EOF'
#!/usr/bin/env bash
set -euo pipefail

MAX_BYTES=$((200 * 1024 * 1024))
CLICKHOUSE_NAME="openpanel-op-ch-1"

truncate_if_over() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    local size
    size=$(stat -c%s "$file_path" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_BYTES" ]; then
      truncate -s 0 "$file_path"
    fi
  fi
}

truncate_if_over "/opt/openpanel/docker/data/op-ch-logs/clickhouse-server.log"
truncate_if_over "/opt/openpanel/docker/data/op-ch-logs/clickhouse-server.err.log"

container_id=$(docker ps -aqf "name=^${CLICKHOUSE_NAME}$" | head -n 1 || true)
if [ -n "$container_id" ]; then
  truncate_if_over "/var/lib/docker/containers/${container_id}/${container_id}-json.log"
fi
GUARD_EOF

  chmod +x /usr/local/bin/workzilla_log_guard.sh
  if ! (crontab -l 2>/dev/null | grep -F '/usr/local/bin/workzilla_log_guard.sh' >/dev/null); then
    (crontab -l 2>/dev/null; echo '*/10 * * * * /usr/local/bin/workzilla_log_guard.sh >/dev/null 2>&1') | crontab -
  fi
}

run_preflight_cleanup() {
  local before_free after_free
  before_free="$(check_free_mb)"
  echo "Preflight free space before cleanup: ${before_free} MB"

  truncate_file_if_exists "/opt/openpanel/docker/data/op-ch-logs/clickhouse-server.log"
  truncate_file_if_exists "/opt/openpanel/docker/data/op-ch-logs/clickhouse-server.err.log"
  rm -f /opt/openpanel/docker/data/op-ch-logs/*.gz || true

  clickhouse_id=$(docker ps -aqf "name=^openpanel-op-ch-1$" | head -n 1 || true)
  if [ -n "${clickhouse_id}" ]; then
    truncate_file_if_exists "/var/lib/docker/containers/${clickhouse_id}/${clickhouse_id}-json.log"
  fi

  # Keep deployment lean: remove temporary and backup artifacts older than retention window.
  find /tmp -maxdepth 1 -type f \( -name 'workzilla-*' -o -name '*workzilla*dump*' -o -name '*.tmp' \) -mtime "+${retention_days}" -delete 2>/dev/null || true
  find "${SERVER_PROJECT_PATH}/apps/backend/backups/postgres_migration" -mindepth 1 -maxdepth 3 -mtime "+${retention_days}" -exec rm -rf {} + 2>/dev/null || true
  find "${SERVER_PROJECT_PATH}" -type f \( -name '*.sql' -o -name '*.dump' -o -name '*.bak' -o -name '*.tmp' \) -mtime "+${retention_days}" -delete 2>/dev/null || true

  # Safe docker cleanup (does not stop running containers).
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
  docker builder prune -af --filter "until=168h" >/dev/null 2>&1 || true
  docker container prune -f --filter "until=168h" >/dev/null 2>&1 || true
  docker volume prune -f >/dev/null 2>&1 || true

  journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  apt-get clean >/dev/null 2>&1 || true
  rm -f "${SERVER_PROJECT_PATH}/.git/index.lock" >/dev/null 2>&1 || true

  ensure_disk_guard_cron
  /usr/local/bin/workzilla_log_guard.sh >/dev/null 2>&1 || true

  after_free="$(check_free_mb)"
  echo "Preflight free space after cleanup: ${after_free} MB"
  if [ "${after_free}" -lt "${min_free_mb}" ]; then
    echo "ERROR: Free disk below threshold (${after_free} MB < ${min_free_mb} MB). Aborting deploy for safety."
    exit 1
  fi
}

run_preflight_cleanup

cd "$SERVER_PROJECT_PATH"

cleanup_server_installers() {
  rm -rf "${SERVER_PROJECT_PATH}/apps/bootstrap_installer/dist"/* 2>/dev/null || true
  rm -rf "${SERVER_PROJECT_PATH}/apps/desktop_app/dist"/* 2>/dev/null || true
  rm -rf "${SERVER_PROJECT_PATH}/apps/desktop_app/mac_helper/.build"/* 2>/dev/null || true
  mkdir -p "${SERVER_PROJECT_PATH}/apps/bootstrap_installer/dist" \
           "${SERVER_PROJECT_PATH}/apps/desktop_app/dist" \
           "${SERVER_PROJECT_PATH}/apps/desktop_app/mac_helper/.build"
  find "${SERVER_PROJECT_PATH}/apps/backend/static/downloads" -maxdepth 1 -type f \
    ! -name 'bootstrap-products.json' ! -name 'README.md' -delete 2>/dev/null || true
}

cleanup_server_installers

if [ ! -f "apps/backend/.env" ]; then
  echo "ERROR: apps/backend/.env missing on server. Aborting to prevent DB fallback."
  exit 1
fi
if ! grep -Eq '^DB_ENGINE=postgres(ql)?$' apps/backend/.env; then
  echo "ERROR: DB_ENGINE is not postgresql in apps/backend/.env. Aborting deploy to prevent SQLite fallback."
  exit 1
fi
find "$SERVER_PROJECT_PATH" -type f \( -name '*.sqlite3' -o -name '*.sqlite3-journal' -o -name '*.sqlite3-wal' -o -name '*.sqlite3-shm' \) \
  ! -path "$SERVER_PROJECT_PATH/.git/*" \
  -print >/tmp/workzilla_sqlite_files_after_sync.txt 2>/dev/null || true
if [ -s /tmp/workzilla_sqlite_files_after_sync.txt ]; then
  echo "WARNING: SQLite files exist on server (not used by runtime because PostgreSQL is enforced):"
  cat /tmp/workzilla_sqlite_files_after_sync.txt
fi

if [ "${SERVER_DEPLOY_MODE:-git}" = "git" ]; then
  git config --global --add safe.directory "$SERVER_PROJECT_PATH" >/dev/null 2>&1 || true
  git pull origin main
else
  echo "Deploy mode: rsync (skipping git pull)"
fi

. venv/bin/activate
venv/bin/python apps/backend/manage.py migrate --skip-checks
venv/bin/python apps/backend/manage.py collectstatic --noinput --skip-checks
cleanup_server_installers

if systemctl list-unit-files | grep -q '^workzilla-gunicorn.service'; then
  # Prevent duplicate bind conflicts with older manual gunicorn launches.
  pgrep -f "venv/bin/gunicorn apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000" | xargs -r kill || true
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ! ss -ltnp | grep -q ':8000 '; then
      break
    fi
    sleep 1
  done
  systemctl daemon-reload
  systemctl restart workzilla-gunicorn.service
else
  pgrep -f "apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000" | xargs -r kill
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ! ss -ltnp | grep -q ':8000 '; then
      break
    fi
    sleep 1
  done
  mkdir -p "${SERVER_PROJECT_PATH}/logs"
  nohup env DJANGO_DEBUG=0 venv/bin/gunicorn apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 900 --graceful-timeout 60 >"${SERVER_PROJECT_PATH}/logs/gunicorn.out" 2>&1 </dev/null &
fi
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if ss -ltnp | grep -q ':8000 '; then
    break
  fi
  sleep 1
done

if [ -d .git ]; then
  echo "Live SHA: $(git rev-parse --short HEAD)"
else
  echo "Live SHA: rsync-no-git"
fi
echo "Gunicorn:"
pgrep -af "apps.backend.core_platform.wsgi:application --bind 0.0.0.0:8000"
echo "Server project size: $(du -sh "$SERVER_PROJECT_PATH" | awk '{print $1}')"
EOF

echo "Verifying live URLs"
curl -I -s https://getworkzilla.com/ | head -n 1
curl -I -s https://getworkzilla.com/static/public/css/site.css | head -n 5
curl -I -s https://getworkzilla.com/static/common/css/public.css | head -n 5
curl -I -s https://getworkzilla.com/downloads/windows-agent/ | head -n 12
curl -I -L -s https://getworkzilla.com/downloads/windows-agent/ | head -n 16
curl -I -s https://getworkzilla.com/downloads/application-files/ | head -n 12
curl -I -s https://getworkzilla.com/downloads/bootstrap-products.json | head -n 5
