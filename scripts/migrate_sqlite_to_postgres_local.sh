#!/usr/bin/env bash
set -euo pipefail

# Safe local migration helper:
# SQLite (apps/backend/db.sqlite3) -> PostgreSQL
#
# Behavior:
# - Always creates SQLite backup + pre/post row count snapshots.
# - Uses Django dumpdata/loaddata to preserve model data.
# - Removes temporary JSON dump by default (set KEEP_MIGRATION_DUMP=1 to keep).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/apps/backend"
VENV_DIR="$ROOT_DIR/env"
TS="$(date +"%Y%m%d_%H%M%S")"
BACKUP_DIR="$BACKEND_DIR/backups/postgres_migration/$TS"
SQLITE_DB="$BACKEND_DIR/db.sqlite3"
TMP_DUMP="$BACKUP_DIR/sqlite_data_dump.json"

if [ ! -d "$VENV_DIR" ]; then
  echo "Missing virtualenv: $VENV_DIR"
  exit 1
fi

if [ ! -f "$SQLITE_DB" ]; then
  echo "Missing SQLite DB: $SQLITE_DB"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
cp -p "$SQLITE_DB" "$BACKUP_DIR/db.sqlite3.backup"

cleanup() {
  if [ "${KEEP_MIGRATION_DUMP:-0}" = "1" ]; then
    return
  fi
  rm -f "$TMP_DUMP" 2>/dev/null || true
}
trap cleanup EXIT

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
cd "$BACKEND_DIR"

echo "[1/8] Capturing pre-migration row counts from SQLite"
python manage.py shell -c '
import json
from django.apps import apps
from django.db import connection

rows = {}
for m in apps.get_models():
    if not m._meta.managed:
        continue
    label = m._meta.label
    try:
        rows[label] = m.objects.count()
    except Exception:
        rows[label] = None

open("'"$BACKUP_DIR"'/sqlite_counts_before.json", "w").write(
    json.dumps({"db_vendor": connection.vendor, "rows": rows}, indent=2, sort_keys=True)
)
print("saved", len(rows), "models")
'

echo "[2/8] Dumping SQLite data"
python manage.py dumpdata \
  --natural-foreign \
  --natural-primary \
  --exclude auth.permission \
  --exclude contenttypes \
  --exclude sessions.session \
  --output "$TMP_DUMP"

if [ ! -s "$TMP_DUMP" ]; then
  echo "Dump file is empty, aborting."
  exit 1
fi

echo "[3/8] Validating PostgreSQL prerequisites"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install PostgreSQL client/server first."
  exit 1
fi

: "${DB_NAME:?Set DB_NAME in environment}"
: "${DB_USER:?Set DB_USER in environment}"
: "${DB_PASSWORD:?Set DB_PASSWORD in environment}"
: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=5432}"

if ! PGPASSWORD="$DB_PASSWORD" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -c "SELECT 1;" >/dev/null 2>&1; then
  echo "Cannot connect to PostgreSQL with provided DB_* values."
  exit 1
fi

echo "[4/8] Running Django migrations on PostgreSQL"
export DB_ENGINE=postgresql
python manage.py migrate --noinput

echo "[5/8] Loading data into PostgreSQL"
python manage.py loaddata "$TMP_DUMP"

echo "[6/8] Capturing post-migration row counts from PostgreSQL"
python manage.py shell -c '
import json
from django.apps import apps
from django.db import connection

rows = {}
for m in apps.get_models():
    if not m._meta.managed:
        continue
    label = m._meta.label
    try:
        rows[label] = m.objects.count()
    except Exception:
        rows[label] = None

open("'"$BACKUP_DIR"'/postgres_counts_after.json", "w").write(
    json.dumps({"db_vendor": connection.vendor, "rows": rows}, indent=2, sort_keys=True)
)
print("saved", len(rows), "models")
'

echo "[7/8] Writing migration summary"
python - <<'PY'
import json, pathlib
backup_dir = pathlib.Path("'"$BACKUP_DIR"'")
pre = json.loads((backup_dir / "sqlite_counts_before.json").read_text())
post = json.loads((backup_dir / "postgres_counts_after.json").read_text())

rows_pre = pre["rows"]
rows_post = post["rows"]
keys = sorted(set(rows_pre) | set(rows_post))
diff = {}
for k in keys:
    if rows_pre.get(k) != rows_post.get(k):
        diff[k] = {"sqlite": rows_pre.get(k), "postgres": rows_post.get(k)}

summary = {
    "sqlite_vendor": pre.get("db_vendor"),
    "postgres_vendor": post.get("db_vendor"),
    "models_compared": len(keys),
    "mismatch_count": len(diff),
    "mismatches": diff,
}
(backup_dir / "migration_summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True))
print("mismatch_count =", len(diff))
PY

if [ "${KEEP_MIGRATION_DUMP:-0}" = "1" ]; then
  echo "[8/8] KEEP_MIGRATION_DUMP=1, retaining dump: $TMP_DUMP"
else
  echo "[8/8] Temporary JSON dump auto-cleaned"
fi

echo
echo "Done. Backup + reports:"
echo "  $BACKUP_DIR"
echo "Use PostgreSQL by keeping DB_ENGINE=postgresql in runtime env."
