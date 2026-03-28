import json
import os
import secrets
import tempfile
from datetime import timedelta

from django.utils import timezone

from apps.backend.products.models import Product
from apps.backend.worksuite.saas_admin.models import SystemBackupManagerSettings

from .backup_pipeline import generate_backup_package
from .models import OrgGoogleDriveBackupSettings
from .services import request_backup, log_backup_event

GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_FILES_API = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"
GOOGLE_SCOPE_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"


class OrgGoogleBackupError(Exception):
    pass


def _require_requests():
    try:
        import requests  # type: ignore

        return requests
    except Exception as exc:  # pragma: no cover
        raise OrgGoogleBackupError(f"requests library unavailable: {exc}")


def _tmp_file(suffix=".zip"):
    fd, path = tempfile.mkstemp(prefix="org_gdrive_backup_", suffix=suffix, dir="/tmp")
    os.close(fd)
    return path


def get_google_client_config():
    settings_obj = SystemBackupManagerSettings.get_solo()
    client_id = str(settings_obj.google_client_id or "").strip()
    client_secret = str(settings_obj.google_client_secret or "").strip()
    if not client_id or not client_secret:
        raise OrgGoogleBackupError("Google OAuth is not configured by SaaS admin.")
    return {
        "client_id": client_id,
        "client_secret": client_secret,
    }


def serialize_org_google_settings(settings_obj: OrgGoogleDriveBackupSettings):
    return {
        "organization_id": settings_obj.organization_id,
        "is_active": bool(settings_obj.is_active),
        "product_slug": settings_obj.product_slug or "business-autopilot-erp",
        "google_connected": bool(settings_obj.google_connected),
        "google_drive_folder_id": settings_obj.google_drive_folder_id or "",
        "scheduler_enabled": bool(settings_obj.scheduler_enabled),
        "schedule_frequency": settings_obj.schedule_frequency,
        "schedule_weekday": int(settings_obj.schedule_weekday or 0),
        "schedule_hour_utc": int(settings_obj.schedule_hour_utc or 0),
        "schedule_minute_utc": int(settings_obj.schedule_minute_utc or 0),
        "keep_last_backups": int(settings_obj.keep_last_backups or 7),
        "scheduler_last_run_at": settings_obj.scheduler_last_run_at.isoformat() if settings_obj.scheduler_last_run_at else "",
        "last_backup_status": settings_obj.last_backup_status or "",
        "last_backup_at": settings_obj.last_backup_at.isoformat() if settings_obj.last_backup_at else "",
        "last_error_message": settings_obj.last_error_message or "",
    }


def build_google_oauth_authorize_url(settings_obj: OrgGoogleDriveBackupSettings, callback_url: str) -> str:
    from urllib.parse import urlencode

    config = get_google_client_config()
    state = secrets.token_urlsafe(24)
    settings_obj.oauth_state = state
    settings_obj.oauth_state_created_at = timezone.now()
    settings_obj.save(update_fields=["oauth_state", "oauth_state_created_at", "updated_at"])

    return f"{GOOGLE_OAUTH_AUTH_URL}?" + urlencode(
        {
            "client_id": config["client_id"],
            "redirect_uri": callback_url,
            "response_type": "code",
            "access_type": "offline",
            "prompt": "consent",
            "scope": GOOGLE_SCOPE_DRIVE_FILE,
            "state": state,
        }
    )


def exchange_google_oauth_code(settings_obj: OrgGoogleDriveBackupSettings, *, code: str, state: str, callback_url: str):
    if not code:
        raise OrgGoogleBackupError("Missing authorization code.")
    if not state or state != (settings_obj.oauth_state or ""):
        raise OrgGoogleBackupError("Invalid OAuth state.")
    if settings_obj.oauth_state_created_at and settings_obj.oauth_state_created_at < timezone.now() - timedelta(minutes=15):
        raise OrgGoogleBackupError("OAuth state expired.")

    config = get_google_client_config()
    requests = _require_requests()
    response = requests.post(
        GOOGLE_OAUTH_TOKEN_URL,
        data={
            "code": code,
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": callback_url,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if response.status_code >= 400:
        raise OrgGoogleBackupError(f"OAuth token exchange failed ({response.status_code}).")

    payload = response.json() or {}
    access_token = str(payload.get("access_token") or "").strip()
    refresh_token = str(payload.get("refresh_token") or "").strip()
    expires_in = int(payload.get("expires_in") or 3600)
    if not access_token:
        raise OrgGoogleBackupError("OAuth token exchange returned no access token.")

    if refresh_token:
        settings_obj.google_refresh_token = refresh_token
    settings_obj.google_access_token = access_token
    settings_obj.google_token_expiry = timezone.now() + timedelta(seconds=max(60, expires_in))
    settings_obj.oauth_state = ""
    settings_obj.oauth_state_created_at = None
    settings_obj.last_error_message = ""
    settings_obj.save(
        update_fields=[
            "google_refresh_token",
            "google_access_token",
            "google_token_expiry",
            "oauth_state",
            "oauth_state_created_at",
            "last_error_message",
            "updated_at",
        ]
    )


def _refresh_google_access_token(settings_obj: OrgGoogleDriveBackupSettings):
    if not settings_obj.google_refresh_token:
        raise OrgGoogleBackupError("Google refresh token missing.")

    config = get_google_client_config()
    requests = _require_requests()
    response = requests.post(
        GOOGLE_OAUTH_TOKEN_URL,
        data={
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "refresh_token": settings_obj.google_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    if response.status_code >= 400:
        raise OrgGoogleBackupError(f"Token refresh failed ({response.status_code}).")

    payload = response.json() or {}
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise OrgGoogleBackupError("Google token refresh returned no access token.")
    expires_in = int(payload.get("expires_in") or 3600)

    settings_obj.google_access_token = access_token
    settings_obj.google_token_expiry = timezone.now() + timedelta(seconds=max(60, expires_in))
    settings_obj.save(update_fields=["google_access_token", "google_token_expiry", "updated_at"])
    return access_token


def _google_access_token(settings_obj: OrgGoogleDriveBackupSettings) -> str:
    if settings_obj.token_expired():
        return _refresh_google_access_token(settings_obj)
    return settings_obj.google_access_token


def _google_headers(settings_obj: OrgGoogleDriveBackupSettings):
    return {"Authorization": f"Bearer {_google_access_token(settings_obj)}"}


def _drive_ensure_folder(settings_obj: OrgGoogleDriveBackupSettings, folder_name: str, parent_id: str = ""):
    requests = _require_requests()
    q_parts = ["trashed=false", "mimeType='application/vnd.google-apps.folder'", f"name='{folder_name}'"]
    if parent_id:
        q_parts.append(f"'{parent_id}' in parents")
    response = requests.get(
        GOOGLE_DRIVE_FILES_API,
        headers=_google_headers(settings_obj),
        params={"q": " and ".join(q_parts), "fields": "files(id,name)", "pageSize": 20},
        timeout=30,
    )
    if response.status_code >= 400:
        if response.status_code == 401:
            _refresh_google_access_token(settings_obj)
            return _drive_ensure_folder(settings_obj, folder_name, parent_id)
        raise OrgGoogleBackupError(f"Google Drive folder lookup failed ({response.status_code}).")

    files = (response.json() or {}).get("files") or []
    if files:
        return str(files[0].get("id") or "")

    payload = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder"}
    if parent_id:
        payload["parents"] = [parent_id]
    create = requests.post(
        f"{GOOGLE_DRIVE_FILES_API}?fields=id,name",
        headers={**_google_headers(settings_obj), "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=30,
    )
    if create.status_code >= 400:
        if create.status_code == 401:
            _refresh_google_access_token(settings_obj)
            return _drive_ensure_folder(settings_obj, folder_name, parent_id)
        raise OrgGoogleBackupError(f"Google Drive folder create failed ({create.status_code}).")

    return str((create.json() or {}).get("id") or "")


def _drive_upload_file(settings_obj: OrgGoogleDriveBackupSettings, *, local_path: str, name: str, parent_id: str, backup_id: str):
    requests = _require_requests()

    metadata = {
        "name": name,
        "parents": [parent_id],
        "appProperties": {
            "wz_backup_group": "org_user_backup",
            "wz_org_id": str(settings_obj.organization_id),
            "wz_backup_id": str(backup_id),
        },
    }

    files = {
        "metadata": (None, json.dumps(metadata), "application/json"),
        "file": (name, open(local_path, "rb"), "application/zip"),
    }
    try:
        response = requests.post(
            f"{GOOGLE_DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,createdTime,size,webViewLink",
            headers=_google_headers(settings_obj),
            files=files,
            timeout=180,
        )
    finally:
        try:
            files["file"][1].close()
        except Exception:
            pass

    if response.status_code >= 400:
        if response.status_code == 401:
            _refresh_google_access_token(settings_obj)
            return _drive_upload_file(
                settings_obj,
                local_path=local_path,
                name=name,
                parent_id=parent_id,
                backup_id=backup_id,
            )
        raise OrgGoogleBackupError(f"Google Drive upload failed ({response.status_code}).")

    return response.json() or {}


def _drive_list_files(settings_obj: OrgGoogleDriveBackupSettings, parent_id: str):
    requests = _require_requests()
    response = requests.get(
        GOOGLE_DRIVE_FILES_API,
        headers=_google_headers(settings_obj),
        params={
            "q": f"trashed=false and '{parent_id}' in parents",
            "fields": "files(id,name,createdTime)",
            "orderBy": "createdTime desc",
            "pageSize": 200,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        if response.status_code == 401:
            _refresh_google_access_token(settings_obj)
            return _drive_list_files(settings_obj, parent_id)
        raise OrgGoogleBackupError(f"Google Drive list failed ({response.status_code}).")

    return (response.json() or {}).get("files") or []


def _drive_delete_file(settings_obj: OrgGoogleDriveBackupSettings, file_id: str):
    if not file_id:
        return
    requests = _require_requests()
    response = requests.delete(f"{GOOGLE_DRIVE_FILES_API}/{file_id}", headers=_google_headers(settings_obj), timeout=30)
    if response.status_code in (401, 403):
        _refresh_google_access_token(settings_obj)
        response = requests.delete(f"{GOOGLE_DRIVE_FILES_API}/{file_id}", headers=_google_headers(settings_obj), timeout=30)
    if response.status_code not in (200, 204, 404):
        raise OrgGoogleBackupError(f"Google Drive delete failed ({response.status_code}).")


def _enforce_retention(settings_obj: OrgGoogleDriveBackupSettings, parent_id: str):
    keep = max(1, int(settings_obj.keep_last_backups or 7))
    files = _drive_list_files(settings_obj, parent_id)
    for row in files[keep:]:
        try:
            _drive_delete_file(settings_obj, str(row.get("id") or ""))
        except Exception:
            continue


def scheduler_due(settings_obj: OrgGoogleDriveBackupSettings, now=None):
    now = now or timezone.now()
    if not settings_obj.is_active or not settings_obj.scheduler_enabled:
        return False
    if settings_obj.schedule_frequency not in ("daily", "weekly"):
        return False

    target = now.replace(
        hour=int(settings_obj.schedule_hour_utc or 0),
        minute=int(settings_obj.schedule_minute_utc or 0),
        second=0,
        microsecond=0,
    )
    if settings_obj.schedule_frequency == "weekly" and now.weekday() != int(settings_obj.schedule_weekday or 0):
        return False
    if now < target:
        return False

    last = settings_obj.scheduler_last_run_at
    if not last:
        return True
    if settings_obj.schedule_frequency == "daily":
        return last.date() < now.date()
    start_of_week = (now - timedelta(days=now.weekday())).date()
    return last.date() < start_of_week


def run_org_google_backup(settings_obj: OrgGoogleDriveBackupSettings, *, requested_by=None, trigger="manual"):
    if not settings_obj.google_connected:
        raise OrgGoogleBackupError("Google Drive is not connected.")

    product_slug = str(settings_obj.product_slug or "").strip() or "business-autopilot-erp"
    product = Product.objects.filter(slug=product_slug, is_active=True).first()
    if not product:
        raise OrgGoogleBackupError("Selected product for backup is not active.")

    organization = settings_obj.organization
    backup = request_backup(
        organization=organization,
        product=product,
        user=requested_by,
        request_id=None,
        trace_id=f"org_gdrive_{trigger}",
    )

    generate_backup_package(backup)
    if backup.status != "completed" or not backup.storage_path:
        raise OrgGoogleBackupError("Backup generation failed.")

    temp_zip_path = _tmp_file(suffix=".zip")
    try:
        from django.core.files.storage import default_storage

        with default_storage.open(backup.storage_path, "rb") as src, open(temp_zip_path, "wb") as dst:
            dst.write(src.read())

        # Folder tree: WorkZillaOrgBackups/org_<id>/product_<slug>/
        configured_parent = str(settings_obj.google_drive_folder_id or "").strip()
        root_id = _drive_ensure_folder(settings_obj, "WorkZillaOrgBackups", configured_parent)
        org_folder_id = _drive_ensure_folder(settings_obj, f"org_{organization.id}", root_id)
        product_folder_id = _drive_ensure_folder(settings_obj, f"product_{product.slug}", org_folder_id)

        stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")
        file_name = f"org_{organization.id}_{product.slug}_{stamp}.zip"
        upload = _drive_upload_file(
            settings_obj,
            local_path=temp_zip_path,
            name=file_name,
            parent_id=product_folder_id,
            backup_id=str(backup.id),
        )
        _enforce_retention(settings_obj, product_folder_id)

        settings_obj.last_backup_status = "completed"
        settings_obj.last_backup_at = timezone.now()
        settings_obj.last_error_message = ""
        settings_obj.scheduler_last_run_at = timezone.now()
        settings_obj.save(
            update_fields=[
                "last_backup_status",
                "last_backup_at",
                "last_error_message",
                "scheduler_last_run_at",
                "updated_at",
            ]
        )

        log_backup_event(
            organization=organization,
            product=product,
            user=requested_by,
            action="backup_completed",
            status="ok",
            backup_id=backup.id,
            actor_type="system",
            event_meta={
                "google_drive_upload": True,
                "google_drive_file_id": str(upload.get("id") or ""),
                "google_drive_file_name": str(upload.get("name") or file_name),
                "trigger": trigger,
            },
        )

        return {
            "status": "completed",
            "backup_id": str(backup.id),
            "drive_file_id": str(upload.get("id") or ""),
            "drive_file_name": str(upload.get("name") or file_name),
        }
    finally:
        if temp_zip_path and os.path.exists(temp_zip_path):
            try:
                os.remove(temp_zip_path)
            except OSError:
                pass


def run_due_org_google_backups():
    now = timezone.now()
    queued = 0
    skipped = 0
    failed = 0
    for settings_obj in OrgGoogleDriveBackupSettings.objects.select_related("organization").all():
        if not scheduler_due(settings_obj, now=now):
            skipped += 1
            continue
        try:
            run_org_google_backup(settings_obj, requested_by=None, trigger="scheduler")
            queued += 1
        except Exception as exc:
            failed += 1
            settings_obj.last_backup_status = "failed"
            settings_obj.last_error_message = str(exc)[:2000]
            settings_obj.scheduler_last_run_at = timezone.now()
            settings_obj.save(
                update_fields=["last_backup_status", "last_error_message", "scheduler_last_run_at", "updated_at"]
            )

    return {"queued": queued, "skipped": skipped, "failed": failed}
