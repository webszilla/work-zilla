# SQLite to PostgreSQL Migration (Django SaaS)

## Goal
Move `apps/backend/db.sqlite3` data into PostgreSQL with backup-first safety.

## 1) Local prerequisites
- PostgreSQL server running locally.
- `psql` available in terminal.
- DB and user created (example: `workzilla` / `workzilla`).

## 2) Set runtime env (local shell)
```bash
cd ~/Desktop/webszilla/saas/work-zilla
source env/bin/activate
export DB_ENGINE=postgresql
export DB_NAME=workzilla
export DB_USER=workzilla
export DB_PASSWORD='<your-password>'
export DB_HOST=127.0.0.1
export DB_PORT=5432
```

## 3) Run migration script
```bash
./scripts/migrate_sqlite_to_postgres_local.sh
```

What it does:
- Backs up old sqlite DB to `apps/backend/backups/postgres_migration/<timestamp>/`.
- Captures model row counts before/after.
- Migrates schema + data.
- Removes temp JSON dump by default.

## 4) Verify
- Check `migration_summary.json` in backup folder.
- `mismatch_count` should be `0` (or reviewed explicitly).
- Run:
```bash
python apps/backend/manage.py check
python apps/backend/manage.py runserver 127.0.0.1:8000
```

## 5) Online migration (after local pass)
- Take production backup first.
- Use same `DB_*` structure on server.
- Run `python manage.py migrate` against PostgreSQL.
- Import validated data using the approved transfer method.
- Verify core flows: auth, CRM, billing, subscriptions, file/media.
