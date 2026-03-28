import os
from datetime import timedelta

from django.conf import settings
from django.core.files import File
from django.utils import timezone

from apps.backend.core_platform import storage as storage_utils

from .models import (
    BlackblazeBackupArtifact,
    BlackblazeBackupSettings,
    GlobalMediaStorageSettings,
)
from .system_backup_manager import (
    BackupManagerError,
    _delete_temp_file,
    _tmp_path,
    _generate_pg_dump,
    create_backup_zip,
)


def _blackblaze_enabled(media_settings: GlobalMediaStorageSettings):
    # Keep provider status aligned with storage settings UI:
    # if object storage credentials are configured, treat backup storage as online.
    return media_settings.storage_mode == "object" and media_settings.is_object_configured()


def _object_storage():
    media_settings = GlobalMediaStorageSettings.get_solo()
    if not _blackblaze_enabled(media_settings):
        raise BackupManagerError("Blackblaze object storage is not configured.")
    storage = storage_utils._build_object_storage(media_settings)
    if not storage:
        raise BackupManagerError("Object storage backend unavailable.")
    storage.location = ""
    return storage, media_settings


def _backup_key(backup_type: str, filename: str):
    now = timezone.localtime(timezone.now())
    date_path = now.strftime("%Y-%m-%d")
    return f"saas_backups/{backup_type}/{date_path}/{filename}"


def _cleanup_old_artifacts(settings_obj: BlackblazeBackupSettings, backup_type: str, storage):
    keep_days = int(settings_obj.db_retention_days if backup_type == "db" else settings_obj.script_retention_days)
    keep_days = max(1, keep_days)
    cutoff = timezone.now() - timedelta(days=keep_days)

    expired_qs = BlackblazeBackupArtifact.objects.filter(
        backup_type=backup_type,
        created_at__lt=cutoff,
    ).exclude(status="expired")
    for row in expired_qs:
        try:
            if row.storage_path and storage.exists(row.storage_path):
                storage.delete(row.storage_path)
        except Exception:
            pass
        row.status = "expired"
        row.expires_at = timezone.now()
        row.save(update_fields=["status", "expires_at"])


def run_blackblaze_backup(backup_type: str):
    if backup_type not in ("db", "script"):
        raise BackupManagerError("invalid_backup_type")

    settings_obj = BlackblazeBackupSettings.get_solo()
    storage, _ = _object_storage()

    stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
    filename = f"{backup_type}_backup_{stamp}.{'sql' if backup_type == 'db' else 'zip'}"

    artifact = BlackblazeBackupArtifact.objects.create(
        backup_type=backup_type,
        status="running",
        file_name=filename,
    )

    tmp_path = _tmp_path(f"blackblaze_{backup_type}_", ".sql" if backup_type == "db" else ".zip")
    try:
        if backup_type == "db":
            _generate_pg_dump(tmp_path)
        else:
            generated_zip = create_backup_zip(project_root=settings.BASE_DIR)
            if generated_zip != tmp_path:
                os.replace(generated_zip, tmp_path)

        size_bytes = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
        storage_key = _backup_key(backup_type, filename)
        with open(tmp_path, "rb") as handle:
            storage.save(storage_key, File(handle))

        artifact.status = "completed"
        artifact.storage_path = storage_key
        artifact.size_bytes = int(size_bytes)
        artifact.completed_at = timezone.now()
        artifact.save(update_fields=["status", "storage_path", "size_bytes", "completed_at"])

        if backup_type == "db":
            settings_obj.last_db_backup_at = timezone.now()
        else:
            settings_obj.last_script_backup_at = timezone.now()
        settings_obj.last_error_message = ""
        settings_obj.save(update_fields=["last_db_backup_at", "last_script_backup_at", "last_error_message", "updated_at"])

        _cleanup_old_artifacts(settings_obj, backup_type, storage)
        return artifact
    except Exception as exc:
        artifact.status = "failed"
        artifact.error_message = str(exc)[:2000]
        artifact.completed_at = timezone.now()
        artifact.save(update_fields=["status", "error_message", "completed_at"])

        settings_obj.last_error_message = str(exc)[:2000]
        settings_obj.save(update_fields=["last_error_message", "updated_at"])
        raise
    finally:
        _delete_temp_file(tmp_path)


def _due_for_daily(settings_obj: BlackblazeBackupSettings, now_local):
    target = now_local.replace(
        hour=int(settings_obj.script_daily_hour_local or 21),
        minute=int(settings_obj.script_daily_minute_local or 0),
        second=0,
        microsecond=0,
    )
    if now_local < target:
        return False
    last = settings_obj.last_script_backup_at
    if not last:
        return True
    return timezone.localtime(last).date() < now_local.date()


def trigger_due_blackblaze_backups():
    settings_obj = BlackblazeBackupSettings.get_solo()
    if not settings_obj.is_active:
        return {"queued": False, "reason": "inactive"}

    now = timezone.now()
    now_local = timezone.localtime(now)
    queued = []

    if settings_obj.db_enabled:
        due = False
        if not settings_obj.last_db_backup_at:
            due = True
        else:
            due = now >= (settings_obj.last_db_backup_at + timedelta(hours=max(1, int(settings_obj.db_interval_hours or 4))))
        if due:
            queued.append("db")

    if settings_obj.script_enabled and _due_for_daily(settings_obj, now_local):
        queued.append("script")

    return {"queued": bool(queued), "types": queued}


def grouped_artifacts_last_days(days=7):
    cutoff = timezone.now() - timedelta(days=max(1, int(days)))
    qs = BlackblazeBackupArtifact.objects.filter(created_at__gte=cutoff).order_by("-created_at")

    grouped = {"db": {}, "script": {}}
    for row in qs:
        day_key = timezone.localtime(row.created_at).strftime("%Y-%m-%d")
        bucket = grouped.setdefault(row.backup_type, {})
        bucket.setdefault(day_key, []).append(
            {
                "id": str(row.id),
                "status": row.status,
                "file_name": row.file_name,
                "size_bytes": int(row.size_bytes or 0),
                "created_at": timezone.localtime(row.created_at).strftime("%Y-%m-%d %H:%M:%S"),
                "completed_at": timezone.localtime(row.completed_at).strftime("%Y-%m-%d %H:%M:%S") if row.completed_at else "",
                "download_url": f"/api/saas-admin/system-backup-manager/blackblaze/download/{row.id}",
            }
        )

    return grouped
