import json
import os
import sqlite3
import tempfile
from collections import defaultdict
from datetime import timedelta

from django.apps import apps as django_apps
from django.core import serializers
from django.db import models, transaction
from django.utils import timezone

from core.models import Organization
from .models import OrganizationBackupLog, OrganizationRestoreLog, SystemBackupManagerSettings
from .system_backup_manager import (
    BackupManagerError,
    _delete_temp_file,
    _drive_delete_file,
    _drive_enforce_retention,
    _drive_upload_file,
    _google_headers,
    _require_requests,
    _tmp_path,
)

BUNDLE_VERSION = 1
ORG_BACKUP_MARKER = "-- WORKZILLA_ORG_BACKUP_JSON_V1 --"
EXCLUDED_MODEL_LABELS = {
    "admin.logentry",
    "contenttypes.contenttype",
    "sessions.session",
    "auth.permission",
    "auth.group",
    "saas_admin.organizationbackuplog",
    "saas_admin.organizationrestorelog",
    "saas_admin.systembackuplog",
}


def _org_export_models():
    models_list = []
    for model in django_apps.get_models():
        opts = model._meta
        if opts.proxy or opts.auto_created:
            continue
        if not getattr(opts, "managed", True):
            continue
        label = opts.label_lower
        if label in EXCLUDED_MODEL_LABELS:
            continue
        org_field = next((f for f in opts.fields if getattr(f, "name", "") == "organization" and getattr(f, "is_relation", False)), None)
        if not org_field or not isinstance(org_field, models.ForeignKey):
            continue
        remote_model = getattr(getattr(org_field, "remote_field", None), "model", None)
        if remote_model is not Organization:
            continue
        models_list.append(model)
    # stable order by app/model to make backups deterministic
    models_list.sort(key=lambda m: m._meta.label_lower)
    return models_list


def _serialize_org_bundle(org: Organization):
    exported_at = timezone.now().replace(microsecond=0).isoformat()
    bundle = {
        "schema": "workzilla.org_backup",
        "version": BUNDLE_VERSION,
        "exported_at": exported_at,
        "organization": {
            "id": org.id,
            "name": org.name,
        },
        "models": [],
        "records": [],
    }
    total_records = 0
    for model in _org_export_models():
        qs = model.objects.filter(organization_id=org.id).order_by("pk")
        count = qs.count()
        if count <= 0:
            continue
        serialized_json = serializers.serialize("json", qs)
        rows = json.loads(serialized_json)
        bundle["models"].append(model._meta.label_lower)
        bundle["records"].extend(rows)
        total_records += len(rows)
    bundle["record_count"] = total_records
    bundle["model_count"] = len(bundle["models"])
    return bundle


def _write_org_backup_file(path: str, bundle: dict):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(f"{ORG_BACKUP_MARKER}\n")
        json.dump(bundle, handle, ensure_ascii=False)


def _read_org_backup_file(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        first_line = handle.readline().strip()
        payload_text = handle.read()
    if first_line != ORG_BACKUP_MARKER:
        raise BackupManagerError("Invalid org backup file format marker.")
    try:
        payload = json.loads(payload_text or "{}")
    except json.JSONDecodeError as exc:
        raise BackupManagerError(f"Invalid org backup JSON: {exc}")
    if payload.get("schema") != "workzilla.org_backup":
        raise BackupManagerError("Unsupported org backup schema.")
    return payload


def _ensure_drive_folder(settings_obj, folder_name: str, parent_id: str = ""):
    requests = _require_requests()
    q_parts = ["trashed=false", "mimeType='application/vnd.google-apps.folder'", f"name='{folder_name}'"]
    if parent_id:
        q_parts.append(f"'{parent_id}' in parents")
    params = {"q": " and ".join(q_parts), "fields": "files(id,name)", "pageSize": 10}
    resp = requests.get("https://www.googleapis.com/drive/v3/files", headers=_google_headers(settings_obj), params=params, timeout=30)
    if resp.status_code >= 400:
        raise BackupManagerError(f"Google Drive folder lookup failed ({resp.status_code}).")
    files = (resp.json() or {}).get("files") or []
    if files:
        return files[0]["id"]

    meta = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        meta["parents"] = [parent_id]
    create = requests.post(
        "https://www.googleapis.com/drive/v3/files?fields=id,name",
        headers={**_google_headers(settings_obj), "Content-Type": "application/json"},
        data=json.dumps(meta),
        timeout=30,
    )
    if create.status_code >= 400:
        raise BackupManagerError(f"Google Drive folder create failed ({create.status_code}).")
    return (create.json() or {}).get("id")


def _upload_org_backup_to_drive(settings_obj, org: Organization, file_path: str, run_id: str):
    root_folder_id = _ensure_drive_folder(settings_obj, "SaaSBackups", settings_obj.google_drive_folder_id or "")
    org_folder_name = f"org_{org.id}"
    org_folder_id = _ensure_drive_folder(settings_obj, org_folder_name, root_folder_id)

    previous_folder_id = settings_obj.google_drive_folder_id
    try:
        settings_obj.google_drive_folder_id = org_folder_id
        stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
        display_name = f"org_{org.id}_{stamp}.sql"
        upload = _drive_upload_file(settings_obj, file_path, display_name, run_id, "org_sql")
    finally:
        settings_obj.google_drive_folder_id = previous_folder_id
    return {
        "folder_id": org_folder_id,
        "folder_path": f"/SaaSBackups/{org_folder_name}/",
        "upload": upload,
    }


def queue_org_backup(org: Organization, requested_by=None, trigger="manual"):
    if OrganizationBackupLog.objects.filter(organization=org, status__in=["queued", "running"]).exists():
        raise BackupManagerError("Backup already queued/running for this organization.")
    return OrganizationBackupLog.objects.create(
        organization=org,
        requested_by=requested_by if getattr(requested_by, "is_authenticated", False) else None,
        trigger=trigger if trigger in ("manual", "scheduler", "bulk_manual") else "manual",
        status="queued",
        message="Organization backup queued.",
    )


def run_org_backup_pipeline(log_id):
    log = OrganizationBackupLog.objects.select_related("organization", "requested_by").filter(id=log_id).first()
    if not log:
        return {"status": "not_found"}
    org = log.organization
    settings_obj = SystemBackupManagerSettings.get_solo()
    if not settings_obj.google_connected:
        OrganizationBackupLog.objects.filter(id=log.id).update(status="failed", error_message="Google Drive not connected.", completed_at=timezone.now())
        return {"status": "failed", "error": "google_not_connected"}

    with transaction.atomic():
        row = OrganizationBackupLog.objects.select_for_update().filter(id=log.id).first()
        if not row or row.status not in ("queued", "failed"):
            return {"status": "skipped"}
        row.status = "running"
        row.started_at = timezone.now()
        row.error_message = ""
        row.message = "Exporting organization data."
        row.save(update_fields=["status", "started_at", "error_message", "message"])
        log = row

    temp_path = _tmp_path(f"org_{org.id}_", ".sql")
    try:
        bundle = _serialize_org_bundle(org)
        _write_org_backup_file(temp_path, bundle)
        upload_result = _upload_org_backup_to_drive(settings_obj, org, temp_path, str(log.id))
        size_bytes = os.path.getsize(temp_path) if os.path.exists(temp_path) else 0
        _delete_temp_file(temp_path)
        OrganizationBackupLog.objects.filter(id=log.id).update(
            status="completed",
            message="Organization backup exported and uploaded to Google Drive.",
            temp_file_path="",
            temp_file_size_bytes=int(size_bytes),
            drive_file_id=str(upload_result["upload"].get("id") or ""),
            drive_file_name=str(upload_result["upload"].get("name") or ""),
            drive_folder_path=upload_result["folder_path"],
            records_exported=int(bundle.get("record_count") or 0),
            model_count=int(bundle.get("model_count") or 0),
            meta={"models": bundle.get("models") or [], "schema": bundle.get("schema"), "version": bundle.get("version")},
            completed_at=timezone.now(),
        )
        # retention at global group level (best-effort) - keeps latest N grouped backups too
        try:
            _drive_enforce_retention(settings_obj, settings_obj.keep_last_backups)
        except Exception:
            pass
        return {"status": "completed"}
    except Exception as exc:
        OrganizationBackupLog.objects.filter(id=log.id).update(
            status="failed",
            error_message=str(exc),
            message="Organization backup failed.",
            temp_file_path=temp_path if os.path.exists(temp_path) else "",
            temp_file_size_bytes=int(os.path.getsize(temp_path)) if os.path.exists(temp_path) else 0,
            completed_at=timezone.now(),
        )
        return {"status": "failed", "error": str(exc)}


def queue_org_restore(org: Organization, backup_file_id: str, backup_file_name: str, restored_by=None):
    if OrganizationRestoreLog.objects.filter(organization=org, status__in=["queued", "downloading", "validating", "restoring"]).exists():
        raise BackupManagerError("Restore already running/queued for this organization.")
    return OrganizationRestoreLog.objects.create(
        organization=org,
        restored_by=restored_by if getattr(restored_by, "is_authenticated", False) else None,
        backup_file_id=backup_file_id,
        backup_file_name=backup_file_name or "",
        status="queued",
        message="Restore job queued.",
    )


def list_org_backups_from_drive(org: Organization):
    settings_obj = SystemBackupManagerSettings.get_solo()
    if not settings_obj.google_connected:
        raise BackupManagerError("Google Drive not connected.")
    requests = _require_requests()
    root_folder_id = _ensure_drive_folder(settings_obj, "SaaSBackups", settings_obj.google_drive_folder_id or "")
    org_folder_id = _ensure_drive_folder(settings_obj, f"org_{org.id}", root_folder_id)
    q = f"trashed=false and '{org_folder_id}' in parents"
    resp = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers=_google_headers(settings_obj),
        params={"q": q, "fields": "files(id,name,createdTime,size)", "orderBy": "createdTime desc", "pageSize": 100},
        timeout=30,
    )
    if resp.status_code >= 400:
        raise BackupManagerError(f"Google Drive list failed ({resp.status_code}).")
    files = (resp.json() or {}).get("files") or []
    return [{
        "id": f.get("id") or "",
        "name": f.get("name") or "",
        "created_at": f.get("createdTime") or "",
        "size": int(f.get("size") or 0),
    } for f in files]


def _download_drive_file(settings_obj, file_id: str, dest_path: str):
    requests = _require_requests()
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
    resp = requests.get(url, headers=_google_headers(settings_obj), timeout=120, stream=True)
    if resp.status_code >= 400:
        raise BackupManagerError(f"Google Drive download failed ({resp.status_code}).")
    with open(dest_path, "wb") as handle:
        for chunk in resp.iter_content(chunk_size=1024 * 256):
            if chunk:
                handle.write(chunk)


def _stage_restore_bundle_sqlite(bundle: dict, sqlite_path: str):
    conn = sqlite3.connect(sqlite_path)
    try:
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS bundle_meta (k TEXT PRIMARY KEY, v TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS records (model TEXT, pk TEXT, org_id TEXT, payload_json TEXT)")
        for k, v in {
            "schema": str(bundle.get("schema") or ""),
            "version": str(bundle.get("version") or ""),
            "org_id": str((bundle.get("organization") or {}).get("id") or ""),
            "record_count": str(bundle.get("record_count") or 0),
        }.items():
            cur.execute("INSERT OR REPLACE INTO bundle_meta (k,v) VALUES (?,?)", (k, v))
        for row in bundle.get("records") or []:
            fields = row.get("fields") or {}
            cur.execute(
                "INSERT INTO records (model, pk, org_id, payload_json) VALUES (?,?,?,?)",
                (str(row.get("model") or ""), str(row.get("pk") or ""), str(fields.get("organization") or ""), json.dumps(row)),
            )
        conn.commit()
    finally:
        conn.close()


def _validate_restore_bundle(org: Organization, bundle: dict):
    errors = []
    records = bundle.get("records") or []
    org_id_in_bundle = (bundle.get("organization") or {}).get("id")
    if str(org_id_in_bundle) != str(org.id):
        errors.append("Selected organization does not match backup bundle org id.")

    for row in records:
        model_label = (row.get("model") or "").lower()
        try:
            django_apps.get_model(model_label)
        except Exception:
            errors.append(f"Schema mismatch: model not found -> {model_label}")
            continue
        fields = row.get("fields") or {}
        if "organization" in fields and str(fields.get("organization")) != str(org.id):
            errors.append(f"Org mismatch in record {model_label}#{row.get('pk')}")
            if len(errors) > 20:
                break
    return {
        "ok": len(errors) == 0,
        "record_count": len(records),
        "model_count": len(set([str((r.get("model") or "")).lower() for r in records])),
        "errors": errors[:50],
    }


def _safe_restore_org_records(org: Organization, bundle: dict):
    """
    Enterprise-safe baseline restore strategy:
    - never overwrite existing rows
    - restore only direct organization models
    - skip rows with conflicts/dependency errors
    Returns stats; does not raise for per-row skips unless critical bundle invalid.
    """
    restored = 0
    skipped = 0
    errors = []
    by_model = defaultdict(list)
    for row in bundle.get("records") or []:
        by_model[str(row.get("model") or "").lower()].append(row)

    with transaction.atomic():
        for model_label in sorted(by_model.keys()):
            model = django_apps.get_model(model_label)
            # safety: restore only direct org FK models
            org_field = next((f for f in model._meta.fields if getattr(f, "name", "") == "organization"), None)
            if not org_field:
                skipped += len(by_model[model_label])
                continue
            serialized_rows = [row for row in by_model[model_label] if (row.get("fields") or {}).get("organization") == org.id]
            if not serialized_rows:
                continue
            for row in serialized_rows:
                try:
                    pk = row.get("pk")
                    if pk is not None and model.objects.filter(pk=pk).exists():
                        skipped += 1
                        continue
                    # deserialize single object and save
                    for obj in serializers.deserialize("json", json.dumps([row])):
                        obj.save()
                        restored += 1
                except Exception as exc:
                    skipped += 1
                    if len(errors) < 50:
                        errors.append(f"{model_label}#{row.get('pk')}: {exc}")
    return {"restored": restored, "skipped": skipped, "errors": errors}


def run_org_restore_pipeline(log_id):
    log = OrganizationRestoreLog.objects.select_related("organization", "restored_by").filter(id=log_id).first()
    if not log:
        return {"status": "not_found"}
    settings_obj = SystemBackupManagerSettings.get_solo()
    if not settings_obj.google_connected:
        OrganizationRestoreLog.objects.filter(id=log.id).update(status="failed", errors="Google Drive not connected.", completed_at=timezone.now())
        return {"status": "failed", "error": "google_not_connected"}

    download_path = _tmp_path(f"org_restore_{log.organization_id}_", ".sql")
    temp_restore_db = _tmp_path(f"restore_temp_org_{log.organization_id}_", ".sqlite3")
    try:
        OrganizationRestoreLog.objects.filter(id=log.id).update(status="downloading", started_at=timezone.now(), message="Downloading backup from Google Drive.")
        _download_drive_file(settings_obj, log.backup_file_id, download_path)

        OrganizationRestoreLog.objects.filter(id=log.id).update(status="validating", temp_download_path=download_path, temp_restore_db_path=temp_restore_db, message="Validating backup bundle and staging temp restore DB.")
        bundle = _read_org_backup_file(download_path)
        _stage_restore_bundle_sqlite(bundle, temp_restore_db)
        validation = _validate_restore_bundle(log.organization, bundle)
        if not validation.get("ok"):
            OrganizationRestoreLog.objects.filter(id=log.id).update(
                status="failed",
                validation_summary=validation,
                errors="; ".join(validation.get("errors") or ["Validation failed"]),
                message="Restore validation failed.",
                completed_at=timezone.now(),
            )
            return {"status": "failed", "error": "validation_failed", "validation": validation}

        OrganizationRestoreLog.objects.filter(id=log.id).update(status="restoring", validation_summary=validation, message="Validated. Restoring org records with no-overwrite policy.")
        result = _safe_restore_org_records(log.organization, bundle)
        status = "completed" if not result.get("errors") else "completed"
        OrganizationRestoreLog.objects.filter(id=log.id).update(
            status=status,
            restored_records=int(result.get("restored") or 0),
            validation_summary={**validation, **result},
            errors="\n".join(result.get("errors") or []),
            message="Restore completed (non-overwrite safe mode).",
            completed_at=timezone.now(),
        )
        _delete_temp_file(download_path)
        _delete_temp_file(temp_restore_db)
        OrganizationRestoreLog.objects.filter(id=log.id).update(temp_download_path="", temp_restore_db_path="")
        return {"status": "completed", **result}
    except Exception as exc:
        OrganizationRestoreLog.objects.filter(id=log.id).update(
            status="failed",
            errors=str(exc),
            message="Restore failed.",
            temp_download_path=download_path if os.path.exists(download_path) else "",
            temp_restore_db_path=temp_restore_db if os.path.exists(temp_restore_db) else "",
            completed_at=timezone.now(),
        )
        return {"status": "failed", "error": str(exc)}
