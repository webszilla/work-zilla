import json
import logging
import os
import secrets
import subprocess
import tempfile
import zipfile
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import SystemBackupManagerSettings, SystemBackupLog

GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"
GOOGLE_SCOPE_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"
logger = logging.getLogger(__name__)

EXCLUDE_FOLDERS = {
    "venv",
    "env",
    ".venv",
    "node_modules",
    "__pycache__",
    ".git",
    "backups",
    "tmp",
    "staticfiles",
}
EXCLUDE_FILE_NAMES = {".DS_Store"}


class BackupManagerError(Exception):
    pass


class GoogleDriveAuthError(BackupManagerError):
    pass


def _require_requests():
    try:
        import requests  # type: ignore
        return requests
    except Exception as exc:  # pragma: no cover
        raise BackupManagerError(f"requests library unavailable: {exc}")


def _project_root() -> Path:
    # settings.BASE_DIR = repo/apps/backend
    return Path(settings.BASE_DIR).resolve().parents[1]


def _tmp_path(prefix: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(prefix=prefix, suffix=suffix, dir="/tmp")
    os.close(fd)
    return path


def _should_skip_rel_dir(rel_path: str) -> bool:
    rel_path = rel_path.replace("\\", "/").strip("/")
    if not rel_path:
        return False
    parts = [p for p in rel_path.split("/") if p]
    if any(part in EXCLUDE_FOLDERS for part in parts):
        return True
    # explicit nested exclude
    if rel_path == "media/cache" or rel_path.startswith("media/cache/"):
        return True
    return False


def create_backup_zip(project_root=None) -> str:
    """
    Create a project backup ZIP inside /tmp and return the file path.

    Default source root is settings.BASE_DIR. Caller may override `project_root`
    (e.g. repo root) for other backup flows.
    """
    root = Path(project_root or settings.BASE_DIR).resolve()
    if not root.exists() or not root.is_dir():
        raise BackupManagerError(f"Backup source folder not found: {root}")

    zip_path = _tmp_path("workzilla_project_", ".zip")
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for current_root, dirs, files in os.walk(root):
                rel_root = os.path.relpath(current_root, root).replace(os.sep, "/")
                rel_root = "" if rel_root == "." else rel_root

                # Requirement: prune excluded folders using dirs[:] filtering.
                dirs[:] = [
                    d for d in dirs
                    if d not in EXCLUDE_FOLDERS
                    and not _should_skip_rel_dir(f"{rel_root}/{d}" if rel_root else d)
                ]

                for filename in files:
                    if filename in EXCLUDE_FILE_NAMES:
                        continue
                    abs_path = os.path.join(current_root, filename)
                    rel_path = os.path.relpath(abs_path, root).replace(os.sep, "/")
                    if _should_skip_rel_dir(os.path.dirname(rel_path)):
                        continue
                    archive.write(abs_path, rel_path)
        return zip_path
    except Exception as exc:
        logger.exception("create_backup_zip failed for root=%s", root)
        _delete_temp_file(zip_path)
        raise BackupManagerError(f"Failed to create backup zip: {exc}") from exc


def _is_excluded_relpath(rel_path: str) -> bool:
    rel_path = rel_path.replace("\\", "/")
    parts = [p for p in rel_path.split("/") if p]
    blocked_dir_names = {
        "venv", "env", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache"
    }
    if any(part in blocked_dir_names for part in parts):
        return True
    lowered = rel_path.lower()
    if lowered.startswith(".git/") or "/.git/" in lowered:
        return True
    if "/media/cache/" in lowered or lowered.startswith("media/cache/"):
        return True
    if "/cache/" in lowered and lowered.startswith("apps/backend/media/"):
        return True
    return False


def _generate_pg_dump(sql_path: str):
    db = (settings.DATABASES or {}).get("default", {})
    engine = str(db.get("ENGINE") or "")
    if "postgresql" not in engine:
        raise BackupManagerError("PostgreSQL pg_dump backup requires django db engine = postgresql.")

    db_name = str(db.get("NAME") or "").strip()
    if not db_name:
        raise BackupManagerError("Database NAME missing.")

    cmd = ["pg_dump", "-F", "p", "-f", sql_path]
    if db.get("HOST"):
        cmd.extend(["-h", str(db.get("HOST"))])
    if db.get("PORT"):
        cmd.extend(["-p", str(db.get("PORT"))])
    if db.get("USER"):
        cmd.extend(["-U", str(db.get("USER"))])
    cmd.append(db_name)

    env = os.environ.copy()
    if db.get("PASSWORD"):
        env["PGPASSWORD"] = str(db.get("PASSWORD"))

    try:
        proc = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        raise BackupManagerError("pg_dump not found in PATH.")

    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise BackupManagerError(f"pg_dump failed: {stderr or 'unknown error'}")


def _zip_project_root(zip_path: str):
    # Backward-compatible wrapper for existing backup flow.
    generated_path = create_backup_zip(project_root=_project_root())
    if generated_path != zip_path:
        os.replace(generated_path, zip_path)


def _google_token_expired(settings_obj: SystemBackupManagerSettings) -> bool:
    if not settings_obj.google_access_token:
        return True
    if not settings_obj.google_token_expiry:
        return True
    return settings_obj.google_token_expiry <= timezone.now() + timedelta(minutes=2)


def _google_refresh_access_token(settings_obj: SystemBackupManagerSettings):
    if not settings_obj.google_refresh_token:
        raise GoogleDriveAuthError("Google Drive refresh token missing.")
    if not settings_obj.google_client_id or not settings_obj.google_client_secret:
        raise GoogleDriveAuthError("Google OAuth client not configured.")

    requests = _require_requests()
    response = requests.post(
        GOOGLE_OAUTH_TOKEN_URL,
        data={
            "client_id": settings_obj.google_client_id,
            "client_secret": settings_obj.google_client_secret,
            "refresh_token": settings_obj.google_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    if response.status_code >= 400:
        raise GoogleDriveAuthError(f"Token refresh failed ({response.status_code}): {response.text[:500]}")
    payload = response.json() or {}
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise GoogleDriveAuthError("Google token refresh returned no access_token.")
    expires_in = int(payload.get("expires_in") or 3600)
    settings_obj.google_access_token = access_token
    settings_obj.google_token_expiry = timezone.now() + timedelta(seconds=max(60, expires_in))
    settings_obj.save(update_fields=["google_access_token", "google_token_expiry", "updated_at"])
    return access_token


def _google_access_token(settings_obj: SystemBackupManagerSettings) -> str:
    if _google_token_expired(settings_obj):
        return _google_refresh_access_token(settings_obj)
    return settings_obj.google_access_token


def build_google_oauth_authorize_url(settings_obj: SystemBackupManagerSettings, callback_url: str) -> str:
    from urllib.parse import urlencode

    if not settings_obj.google_client_id or not settings_obj.google_client_secret:
        raise GoogleDriveAuthError("Google OAuth client_id/client_secret required.")
    state = secrets.token_urlsafe(24)
    settings_obj.oauth_state = state
    settings_obj.oauth_state_created_at = timezone.now()
    if not settings_obj.google_redirect_uri:
        settings_obj.google_redirect_uri = callback_url
    settings_obj.save(update_fields=["oauth_state", "oauth_state_created_at", "google_redirect_uri", "updated_at"])
    return f"{GOOGLE_OAUTH_AUTH_URL}?" + urlencode(
        {
            "client_id": settings_obj.google_client_id,
            "redirect_uri": settings_obj.google_redirect_uri,
            "response_type": "code",
            "access_type": "offline",
            "prompt": "consent",
            "scope": GOOGLE_SCOPE_DRIVE_FILE,
            "state": state,
        }
    )


def exchange_google_oauth_code(settings_obj: SystemBackupManagerSettings, code: str, state: str):
    if not code:
        raise GoogleDriveAuthError("Missing authorization code.")
    if not state or state != (settings_obj.oauth_state or ""):
        raise GoogleDriveAuthError("Invalid OAuth state.")
    if settings_obj.oauth_state_created_at and settings_obj.oauth_state_created_at < timezone.now() - timedelta(minutes=15):
        raise GoogleDriveAuthError("OAuth state expired.")
    if not settings_obj.google_redirect_uri:
        raise GoogleDriveAuthError("Google redirect URI missing.")

    requests = _require_requests()
    response = requests.post(
        GOOGLE_OAUTH_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings_obj.google_client_id,
            "client_secret": settings_obj.google_client_secret,
            "redirect_uri": settings_obj.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if response.status_code >= 400:
        raise GoogleDriveAuthError(f"OAuth token exchange failed ({response.status_code}).")
    payload = response.json() or {}
    access_token = str(payload.get("access_token") or "").strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    expires_in = int(payload.get("expires_in") or 3600)
    if not access_token:
        raise GoogleDriveAuthError("OAuth token exchange returned no access token.")
    if refresh_token:
        settings_obj.google_refresh_token = refresh_token
    settings_obj.google_access_token = access_token
    settings_obj.google_token_expiry = timezone.now() + timedelta(seconds=max(60, expires_in))
    settings_obj.oauth_state = ""
    settings_obj.oauth_state_created_at = None
    settings_obj.save(update_fields=[
        "google_refresh_token",
        "google_access_token",
        "google_token_expiry",
        "oauth_state",
        "oauth_state_created_at",
        "updated_at",
    ])


def _google_headers(settings_obj: SystemBackupManagerSettings):
    return {"Authorization": f"Bearer {_google_access_token(settings_obj)}"}


def _drive_upload_file(settings_obj: SystemBackupManagerSettings, file_path: str, display_name: str, run_id: str, file_type: str):
    requests = _require_requests()
    metadata = {
        "name": display_name,
        "appProperties": {
            "wz_backup_group": "system_backup_manager",
            "wz_backup_run_id": run_id,
            "wz_backup_file_type": file_type,
        },
    }
    if settings_obj.google_drive_folder_id:
        metadata["parents"] = [settings_obj.google_drive_folder_id]

    headers = _google_headers(settings_obj)
    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        "file": (display_name, open(file_path, "rb"), "application/octet-stream"),
    }
    try:
        resp = requests.post(
            f"{GOOGLE_DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,createdTime,webViewLink",
            headers=headers,
            files=files,
            timeout=180,
        )
    finally:
        try:
            files["file"][1].close()
        except Exception:
            pass
    if resp.status_code >= 400:
        if resp.status_code == 401:
            _google_refresh_access_token(settings_obj)
            return _drive_upload_file(settings_obj, file_path, display_name, run_id, file_type)
        raise BackupManagerError(f"Google Drive upload failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json() or {}


def _drive_delete_file(settings_obj: SystemBackupManagerSettings, file_id: str):
    if not file_id:
        return
    requests = _require_requests()
    resp = requests.delete(f"{GOOGLE_DRIVE_FILES_API}/{file_id}", headers=_google_headers(settings_obj), timeout=30)
    if resp.status_code in (401, 403):
        _google_refresh_access_token(settings_obj)
        resp = requests.delete(f"{GOOGLE_DRIVE_FILES_API}/{file_id}", headers=_google_headers(settings_obj), timeout=30)
    if resp.status_code not in (204, 200, 404):
        raise BackupManagerError(f"Google Drive delete failed ({resp.status_code}).")


def _drive_enforce_retention(settings_obj: SystemBackupManagerSettings, keep_last_backups: int):
    keep_last_backups = max(1, int(keep_last_backups or 7))
    requests = _require_requests()
    q_parts = ["trashed=false"]
    if settings_obj.google_drive_folder_id:
        q_parts.append(f"'{settings_obj.google_drive_folder_id}' in parents")
    q_parts.append("name contains 'workzilla-system-backup-'")
    params = {
        "q": " and ".join(q_parts),
        "fields": "files(id,name,createdTime,appProperties)",
        "pageSize": 200,
        "orderBy": "createdTime desc",
    }
    resp = requests.get(GOOGLE_DRIVE_FILES_API, headers=_google_headers(settings_obj), params=params, timeout=30)
    if resp.status_code >= 400:
        if resp.status_code == 401:
            _google_refresh_access_token(settings_obj)
            return _drive_enforce_retention(settings_obj, keep_last_backups)
        raise BackupManagerError(f"Google Drive list failed ({resp.status_code}).")
    files = (resp.json() or {}).get("files") or []
    groups = defaultdict(list)
    for row in files:
        app_props = row.get("appProperties") or {}
        run_id = app_props.get("wz_backup_run_id") or row.get("name")
        groups[run_id].append(row)
    ranked = sorted(
        groups.items(),
        key=lambda item: max((f.get("createdTime") or "") for f in item[1]),
        reverse=True,
    )
    for _, file_rows in ranked[keep_last_backups:]:
        for f in file_rows:
            try:
                _drive_delete_file(settings_obj, f.get("id") or "")
            except Exception:
                # retention cleanup should not fail whole backup
                continue


def _delete_temp_file(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def _serialize_db_backup_note(db_engine: str) -> str:
    if "postgresql" in (db_engine or ""):
        return "PostgreSQL dump generated with pg_dump."
    return "Database dump skipped: PostgreSQL not configured."


def run_system_backup_pipeline(log_id: int):
    log = SystemBackupLog.objects.filter(id=log_id).select_related("requested_by").first()
    if not log:
        return {"status": "not_found"}

    settings_obj = SystemBackupManagerSettings.get_solo()
    with transaction.atomic():
        locked = SystemBackupLog.objects.select_for_update().filter(id=log.id).first()
        if not locked:
            return {"status": "not_found"}
        if locked.status not in ("queued", "failed"):
            return {"status": "skipped", "reason": f"status={locked.status}"}
        locked.status = "running"
        locked.started_at = timezone.now()
        locked.error_message = ""
        locked.message = "Starting backup pipeline."
        locked.save(update_fields=["status", "started_at", "error_message", "message"])
        log = locked

    sql_path = _tmp_path("workzilla_pg_", ".sql")
    zip_path = _tmp_path("workzilla_project_", ".zip")

    try:
        db_engine = str((settings.DATABASES or {}).get("default", {}).get("ENGINE") or "")
        _generate_pg_dump(sql_path)
        _zip_project_root(zip_path)

        sql_size = os.path.getsize(sql_path) if os.path.exists(sql_path) else 0
        zip_size = os.path.getsize(zip_path) if os.path.exists(zip_path) else 0
        run_stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
        run_id = f"{run_stamp}-{log.id}"

        if not settings_obj.google_connected:
            raise GoogleDriveAuthError("Google Drive OAuth2 not connected (missing refresh token/client config).")

        sql_name = f"workzilla-system-backup-{run_stamp}-db.sql"
        zip_name = f"workzilla-system-backup-{run_stamp}-project.zip"
        sql_upload = _drive_upload_file(settings_obj, sql_path, sql_name, str(log.id), "db_sql")
        zip_upload = _drive_upload_file(settings_obj, zip_path, zip_name, str(log.id), "project_zip")
        _drive_enforce_retention(settings_obj, settings_obj.keep_last_backups)

        _delete_temp_file(sql_path)
        _delete_temp_file(zip_path)

        SystemBackupLog.objects.filter(id=log.id).update(
            status="completed",
            message="Backup completed and uploaded to Google Drive.",
            error_message="",
            temp_sql_path="",
            temp_zip_path="",
            sql_size_bytes=int(sql_size),
            zip_size_bytes=int(zip_size),
            drive_sql_file_id=str(sql_upload.get("id") or ""),
            drive_sql_file_name=str(sql_upload.get("name") or sql_name),
            drive_zip_file_id=str(zip_upload.get("id") or ""),
            drive_zip_file_name=str(zip_upload.get("name") or zip_name),
            completed_at=timezone.now(),
            meta={
                "db_backup_note": _serialize_db_backup_note(db_engine),
                "project_root": str(_project_root()),
                "retention_keep_last_backups": int(settings_obj.keep_last_backups),
                "trigger": log.trigger,
            },
        )
        SystemBackupManagerSettings.objects.filter(id=settings_obj.id).update(
            last_error_message="",
            scheduler_last_run_at=timezone.now(),
        )
        return {"status": "completed"}
    except Exception as exc:
        # keep temp files for debugging / manual recovery
        SystemBackupLog.objects.filter(id=log.id).update(
            status="failed",
            message="Backup failed.",
            error_message=str(exc),
            temp_sql_path=sql_path if os.path.exists(sql_path) else "",
            temp_zip_path=zip_path if os.path.exists(zip_path) else "",
            sql_size_bytes=int(os.path.getsize(sql_path)) if os.path.exists(sql_path) else 0,
            zip_size_bytes=int(os.path.getsize(zip_path)) if os.path.exists(zip_path) else 0,
            completed_at=timezone.now(),
            meta={
                "project_root": str(_project_root()),
                "trigger": log.trigger,
            },
        )
        SystemBackupManagerSettings.objects.filter(id=settings_obj.id).update(last_error_message=str(exc)[:2000])
        return {"status": "failed", "error": str(exc)}


def queue_system_backup(requested_by=None, trigger="manual"):
    with transaction.atomic():
        running = SystemBackupLog.objects.select_for_update().filter(status__in=["queued", "running"]).exists()
        if running:
            raise BackupManagerError("A system backup job is already queued or running.")
        log = SystemBackupLog.objects.create(
            requested_by=requested_by if getattr(requested_by, "is_authenticated", False) else None,
            trigger=trigger if trigger in ("manual", "scheduler") else "manual",
            status="queued",
            message="Backup job queued.",
        )
    return log


def scheduler_due(settings_obj: SystemBackupManagerSettings, now=None) -> bool:
    now = now or timezone.now()
    if not settings_obj.scheduler_enabled or not settings_obj.is_active:
        return False
    if settings_obj.schedule_frequency not in ("daily", "weekly"):
        return False
    target = now.replace(
        hour=int(settings_obj.schedule_hour_utc or 0),
        minute=int(settings_obj.schedule_minute_utc or 0),
        second=0,
        microsecond=0,
    )
    if settings_obj.schedule_frequency == "weekly":
        if now.weekday() != int(settings_obj.schedule_weekday or 0):
            return False
    if now < target:
        return False
    last = settings_obj.scheduler_last_run_at
    if not last:
        return True
    if settings_obj.schedule_frequency == "daily":
        return last.date() < now.date()
    start_of_week = (now - timedelta(days=now.weekday())).date()
    return (last.date() < start_of_week)


def trigger_due_scheduled_backup():
    settings_obj = SystemBackupManagerSettings.get_solo()
    if not scheduler_due(settings_obj):
        return {"queued": False, "reason": "not_due"}
    try:
        log = queue_system_backup(requested_by=None, trigger="scheduler")
    except BackupManagerError as exc:
        return {"queued": False, "reason": str(exc)}
    return {"queued": True, "log_id": log.id}
