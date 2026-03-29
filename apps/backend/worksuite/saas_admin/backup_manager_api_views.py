import json
import threading

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.utils import OperationalError, ProgrammingError
from django.core.files.storage import default_storage
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse, Http404, FileResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from core.models import UserProfile
from core.models import Organization
from apps.backend.core_platform import storage as storage_utils
from .models import (
    SystemBackupLog,
    SystemBackupManagerSettings,
    OrganizationBackupLog,
    OrganizationRestoreLog,
    GlobalMediaStorageSettings,
    BlackblazeBackupSettings,
    BlackblazeBackupArtifact,
)
from .org_backup_manager import (
    BackupManagerError as OrgBackupManagerError,
    list_org_backups_from_drive,
    queue_org_backup,
    queue_org_restore,
)
from .system_backup_manager import (
    BackupManagerError,
    GoogleDriveAuthError,
    build_google_oauth_authorize_url,
    exchange_google_oauth_code,
    queue_system_backup,
    _tmp_path,
    _generate_pg_dump,
    _delete_temp_file,
)
from .blackblaze_backup_manager import (
    run_blackblaze_backup,
    grouped_artifacts_last_days,
    trigger_due_blackblaze_backups,
)
from .tasks import (
    run_system_backup_job,
    run_org_backup_job,
    run_org_restore_job,
    run_org_backup_all_job,
    run_blackblaze_backup_job,
    run_blackblaze_scheduler_tick,
)


def _is_saas_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    role = str(getattr(profile, "role", "") or "").strip().lower().replace("-", "_").replace(" ", "_")
    return bool(profile and role in ("superadmin", "super_admin", "saas_admin", "saasadmin"))


def _require_saas_admin(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    return None


def _format_datetime(value):
    if not value:
        return ""
    local_value = timezone.localtime(value) if timezone.is_aware(value) else value
    return local_value.strftime("%Y-%m-%d %H:%M:%S")


def _mask_secret(value):
    value = str(value or "")
    if not value:
        return ""
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}***{value[-3:]}"


def _serialize_log(row: SystemBackupLog):
    return {
        "id": row.id,
        "status": row.status,
        "trigger": row.trigger,
        "message": row.message or "",
        "error_message": row.error_message or "",
        "temp_sql_path": row.temp_sql_path or "",
        "temp_zip_path": row.temp_zip_path or "",
        "sql_size_bytes": int(row.sql_size_bytes or 0),
        "zip_size_bytes": int(row.zip_size_bytes or 0),
        "drive_sql_file_id": row.drive_sql_file_id or "",
        "drive_sql_file_name": row.drive_sql_file_name or "",
        "drive_zip_file_id": row.drive_zip_file_id or "",
        "drive_zip_file_name": row.drive_zip_file_name or "",
        "requested_by": row.requested_by.username if row.requested_by else "system",
        "started_at": _format_datetime(row.started_at),
        "completed_at": _format_datetime(row.completed_at),
        "created_at": _format_datetime(row.created_at),
        "meta": row.meta or {},
    }


def _serialize_org_backup_log(row: OrganizationBackupLog):
    return {
        "id": row.id,
        "org_id": row.organization_id,
        "org_name": row.organization.name if row.organization else "-",
        "status": row.status,
        "trigger": row.trigger,
        "drive_file_id": row.drive_file_id or "",
        "drive_file_name": row.drive_file_name or "",
        "drive_folder_path": row.drive_folder_path or "",
        "records_exported": int(row.records_exported or 0),
        "model_count": int(row.model_count or 0),
        "message": row.message or "",
        "error_message": row.error_message or "",
        "temp_file_path": row.temp_file_path or "",
        "created_at": _format_datetime(row.created_at),
        "started_at": _format_datetime(row.started_at),
        "completed_at": _format_datetime(row.completed_at),
    }


def _serialize_org_restore_log(row: OrganizationRestoreLog):
    return {
        "id": row.id,
        "org_id": row.organization_id,
        "org_name": row.organization.name if row.organization else "-",
        "status": row.status,
        "backup_file_id": row.backup_file_id or "",
        "backup_file_name": row.backup_file_name or "",
        "restored_records": int(row.restored_records or 0),
        "message": row.message or "",
        "errors": row.errors or "",
        "temp_download_path": row.temp_download_path or "",
        "temp_restore_db_path": row.temp_restore_db_path or "",
        "validation_summary": row.validation_summary or {},
        "created_at": _format_datetime(row.created_at),
        "started_at": _format_datetime(row.started_at),
        "completed_at": _format_datetime(row.completed_at),
        "restored_by": row.restored_by.username if row.restored_by else "system",
    }


def _serialize_settings(obj: SystemBackupManagerSettings):
    latest = SystemBackupLog.objects.order_by("-created_at").first()
    running = SystemBackupLog.objects.filter(status__in=["queued", "running"]).order_by("-created_at").first()
    return {
        "provider": obj.provider,
        "is_active": bool(obj.is_active),
        "google_client_id": obj.google_client_id or "",
        "google_client_secret_masked": _mask_secret(obj.google_client_secret),
        "has_google_client_secret": bool(obj.google_client_secret),
        "google_redirect_uri": obj.google_redirect_uri or "",
        "google_drive_folder_id": obj.google_drive_folder_id or "",
        "google_connected": bool(obj.google_connected),
        "has_refresh_token": bool(obj.google_refresh_token),
        "access_token_masked": _mask_secret(obj.google_access_token),
        "token_expiry": _format_datetime(obj.google_token_expiry),
        "scheduler_enabled": bool(obj.scheduler_enabled),
        "schedule_frequency": obj.schedule_frequency,
        "schedule_weekday": int(obj.schedule_weekday or 0),
        "schedule_hour_utc": int(obj.schedule_hour_utc or 0),
        "schedule_minute_utc": int(obj.schedule_minute_utc or 0),
        "keep_last_backups": int(obj.keep_last_backups or 7),
        "scheduler_last_run_at": _format_datetime(obj.scheduler_last_run_at),
        "last_error_message": obj.last_error_message or "",
        "google_drive_connection_status": "connected" if obj.google_connected else "not_connected",
        "last_backup_status": latest.status if latest else "never",
        "last_backup_date": _format_datetime(latest.completed_at or latest.created_at) if latest else "",
        "backup_running": bool(running),
        "running_backup_id": running.id if running else None,
        "updated_at": _format_datetime(obj.updated_at),
    }


def _serialize_blackblaze_settings():
    media_settings = GlobalMediaStorageSettings.get_solo()
    try:
        bb_settings = BlackblazeBackupSettings.get_solo()
    except (ProgrammingError, OperationalError):
        return {
            "is_active": False,
            "status": "offline",
            "db_enabled": False,
            "db_interval_hours": 4,
            "db_retention_days": 7,
            "script_enabled": False,
            "script_daily_hour_local": 21,
            "script_daily_minute_local": 0,
            "script_retention_days": 7,
            "last_db_backup_at": "",
            "last_script_backup_at": "",
            "last_error_message": "blackblaze_tables_not_migrated",
            "storage_mode": media_settings.storage_mode,
            "endpoint_url": media_settings.endpoint_url or "",
        }
    is_blackblaze = media_settings.storage_mode == "object" and media_settings.is_object_configured()
    return {
        "is_active": bool(bb_settings.is_active),
        "status": "online" if is_blackblaze else "offline",
        "db_enabled": bool(bb_settings.db_enabled),
        "db_interval_hours": int(bb_settings.db_interval_hours or 4),
        "db_retention_days": int(bb_settings.db_retention_days or 7),
        "script_enabled": bool(bb_settings.script_enabled),
        "script_daily_hour_local": int(bb_settings.script_daily_hour_local or 21),
        "script_daily_minute_local": int(bb_settings.script_daily_minute_local or 0),
        "script_retention_days": int(bb_settings.script_retention_days or 7),
        "last_db_backup_at": _format_datetime(bb_settings.last_db_backup_at),
        "last_script_backup_at": _format_datetime(bb_settings.last_script_backup_at),
        "last_error_message": bb_settings.last_error_message or "",
        "storage_mode": media_settings.storage_mode,
        "endpoint_url": media_settings.endpoint_url or "",
    }


@login_required
@require_http_methods(["GET"])
def system_backup_manager_dashboard(request):
    error = _require_saas_admin(request)
    if error:
        return error
    settings_obj = SystemBackupManagerSettings.get_solo()
    orgs = list(Organization.objects.order_by("name").values("id", "name"))
    latest_org_backup = OrganizationBackupLog.objects.select_related("organization").first()
    latest_restore = OrganizationRestoreLog.objects.select_related("organization").first()
    try:
        bb_grouped = grouped_artifacts_last_days(7)
    except (ProgrammingError, OperationalError):
        bb_grouped = {"db": {}, "script": {}}
    return JsonResponse({
        "settings": _serialize_settings(settings_obj),
        "provider_tabs": ["google_drive", "blackblaze"],
        "blackblaze": _serialize_blackblaze_settings(),
        "blackblaze_grouped": bb_grouped,
        "organizations": orgs,
        "org_backup_summary": {
            "last_backup_date": _format_datetime(latest_org_backup.completed_at or latest_org_backup.created_at) if latest_org_backup else "",
            "last_backup_status": latest_org_backup.status if latest_org_backup else "never",
        },
        "restore_summary": {
            "last_restore_date": _format_datetime(latest_restore.completed_at or latest_restore.created_at) if latest_restore else "",
            "last_restore_status": latest_restore.status if latest_restore else "never",
        },
    })


@login_required
@require_http_methods(["GET"])
def system_backup_manager_live_db_download(request):
    error = _require_saas_admin(request)
    if error:
        return error

    sql_path = _tmp_path("workzilla_live_pg_", ".sql")
    try:
        _generate_pg_dump(sql_path)
        with open(sql_path, "rb") as handle:
            payload = handle.read()
    except Exception as exc:
        return JsonResponse({"detail": str(exc) or "live_db_dump_failed"}, status=400)
    finally:
        _delete_temp_file(sql_path)

    stamp = timezone.localtime(timezone.now()).strftime("%Y%m%d_%H%M%S")
    response = HttpResponse(payload, content_type="application/sql")
    response["Content-Disposition"] = f'attachment; filename="live_db_backup_{stamp}.sql"'
    response["Content-Length"] = str(len(payload))
    return response


@login_required
@require_http_methods(["GET", "PUT"])
def system_backup_manager_settings(request):
    error = _require_saas_admin(request)
    if error:
        return error

    settings_obj = SystemBackupManagerSettings.get_solo()
    if request.method == "GET":
        return JsonResponse(_serialize_settings(settings_obj))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    settings_obj.is_active = bool(payload.get("is_active", settings_obj.is_active))
    settings_obj.google_client_id = str(payload.get("google_client_id", settings_obj.google_client_id) or "").strip()
    settings_obj.google_redirect_uri = str(payload.get("google_redirect_uri", settings_obj.google_redirect_uri) or "").strip()
    settings_obj.google_drive_folder_id = str(payload.get("google_drive_folder_id", settings_obj.google_drive_folder_id) or "").strip()
    client_secret = str(payload.get("google_client_secret", "") or "").strip()
    if client_secret:
        settings_obj.google_client_secret = client_secret

    settings_obj.scheduler_enabled = bool(payload.get("scheduler_enabled", settings_obj.scheduler_enabled))
    frequency = str(payload.get("schedule_frequency", settings_obj.schedule_frequency) or "daily").strip().lower()
    if frequency not in ("daily", "weekly"):
        return JsonResponse({"detail": "invalid_schedule_frequency"}, status=400)
    settings_obj.schedule_frequency = frequency
    try:
        settings_obj.schedule_weekday = max(0, min(6, int(payload.get("schedule_weekday", settings_obj.schedule_weekday))))
        settings_obj.schedule_hour_utc = max(0, min(23, int(payload.get("schedule_hour_utc", settings_obj.schedule_hour_utc))))
        settings_obj.schedule_minute_utc = max(0, min(59, int(payload.get("schedule_minute_utc", settings_obj.schedule_minute_utc))))
        settings_obj.keep_last_backups = max(1, min(30, int(payload.get("keep_last_backups", settings_obj.keep_last_backups))))
    except (TypeError, ValueError):
        return JsonResponse({"detail": "invalid_schedule_values"}, status=400)

    settings_obj.save()
    return JsonResponse(_serialize_settings(settings_obj))


@login_required
@require_http_methods(["GET"])
def system_backup_manager_logs(request):
    error = _require_saas_admin(request)
    if error:
        return error
    limit = request.GET.get("limit") or 20
    try:
        limit = max(1, min(100, int(limit)))
    except (TypeError, ValueError):
        limit = 20
    rows = SystemBackupLog.objects.select_related("requested_by").order_by("-created_at")[:limit]
    return JsonResponse({"items": [_serialize_log(row) for row in rows]})


@login_required
@require_http_methods(["GET"])
def organization_backup_logs(request):
    error = _require_saas_admin(request)
    if error:
        return error
    org_id = request.GET.get("org_id")
    limit = request.GET.get("limit") or 50
    try:
        limit = max(1, min(200, int(limit)))
    except (TypeError, ValueError):
        limit = 50
    qs = OrganizationBackupLog.objects.select_related("organization", "requested_by").order_by("-created_at")
    if org_id:
        try:
            qs = qs.filter(organization_id=int(org_id))
        except (TypeError, ValueError):
            pass
    return JsonResponse({"items": [_serialize_org_backup_log(row) for row in qs[:limit]]})


@login_required
@require_http_methods(["GET"])
def organization_restore_logs(request):
    error = _require_saas_admin(request)
    if error:
        return error
    org_id = request.GET.get("org_id")
    limit = request.GET.get("limit") or 50
    try:
        limit = max(1, min(200, int(limit)))
    except (TypeError, ValueError):
        limit = 50
    qs = OrganizationRestoreLog.objects.select_related("organization", "restored_by").order_by("-created_at")
    if org_id:
        try:
            qs = qs.filter(organization_id=int(org_id))
        except (TypeError, ValueError):
            pass
    return JsonResponse({"items": [_serialize_org_restore_log(row) for row in qs[:limit]]})


@login_required
@require_http_methods(["POST"])
def system_backup_manager_run(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        log = queue_system_backup(requested_by=request.user, trigger="manual")
    except BackupManagerError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)

    try:
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            threading.Thread(target=run_system_backup_job, args=(log.id,), daemon=True).start()
        else:
            run_system_backup_job.delay(log.id)
    except Exception as exc:
        SystemBackupLog.objects.filter(id=log.id).update(status="failed", error_message=f"Failed to start task: {exc}")
        return JsonResponse({"detail": "job_start_failed"}, status=500)

    return JsonResponse({"queued": True, "log_id": log.id})


@login_required
@require_http_methods(["POST"])
def organization_backup_run(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    org_id = payload.get("org_id")
    if not org_id:
        return JsonResponse({"detail": "org_id_required"}, status=400)
    org = Organization.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({"detail": "org_not_found"}, status=404)
    try:
        log = queue_org_backup(org, requested_by=request.user, trigger="manual")
    except OrgBackupManagerError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    try:
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            threading.Thread(target=run_org_backup_job, args=(log.id,), daemon=True).start()
        else:
            run_org_backup_job.delay(log.id)
    except Exception as exc:
        OrganizationBackupLog.objects.filter(id=log.id).update(status="failed", error_message=f"Failed to start task: {exc}")
        return JsonResponse({"detail": "job_start_failed"}, status=500)
    return JsonResponse({"queued": True, "log_id": log.id})


@login_required
@require_http_methods(["POST"])
def organization_backup_run_all(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            threading.Thread(target=run_org_backup_all_job, args=(request.user.id,), daemon=True).start()
        else:
            run_org_backup_all_job.delay(request.user.id)
    except Exception:
        return JsonResponse({"detail": "job_start_failed"}, status=500)
    return JsonResponse({"queued": True})


@login_required
@require_http_methods(["GET"])
def organization_restore_available_backups(request):
    error = _require_saas_admin(request)
    if error:
        return error
    org_id = request.GET.get("org_id")
    if not org_id:
        return JsonResponse({"detail": "org_id_required"}, status=400)
    org = Organization.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({"detail": "org_not_found"}, status=404)
    try:
        files = list_org_backups_from_drive(org)
    except OrgBackupManagerError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"items": files})


@login_required
@require_http_methods(["POST"])
def organization_restore_run(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    org_id = payload.get("org_id")
    backup_file_id = str(payload.get("backup_file_id") or "").strip()
    backup_file_name = str(payload.get("backup_file_name") or "").strip()
    if not org_id or not backup_file_id:
        return JsonResponse({"detail": "org_id_and_backup_file_id_required"}, status=400)
    org = Organization.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({"detail": "org_not_found"}, status=404)
    try:
        log = queue_org_restore(org, backup_file_id=backup_file_id, backup_file_name=backup_file_name, restored_by=request.user)
    except OrgBackupManagerError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    try:
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            threading.Thread(target=run_org_restore_job, args=(log.id,), daemon=True).start()
        else:
            run_org_restore_job.delay(log.id)
    except Exception as exc:
        OrganizationRestoreLog.objects.filter(id=log.id).update(status="failed", errors=f"Failed to start task: {exc}")
        return JsonResponse({"detail": "job_start_failed"}, status=500)
    return JsonResponse({"queued": True, "log_id": log.id})


@login_required
@require_http_methods(["GET"])
def system_backup_google_auth_start(request):
    error = _require_saas_admin(request)
    if error:
        return error
    settings_obj = SystemBackupManagerSettings.get_solo()
    callback_url = request.build_absolute_uri("/api/saas-admin/system-backup-manager/google-drive/callback")
    try:
        auth_url = build_google_oauth_authorize_url(settings_obj, callback_url)
    except GoogleDriveAuthError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({"auth_url": auth_url})


@login_required
@require_http_methods(["GET"])
def system_backup_google_auth_callback(request):
    error = _require_saas_admin(request)
    if error:
        return error
    settings_obj = SystemBackupManagerSettings.get_solo()
    code = (request.GET.get("code") or "").strip()
    oauth_state = (request.GET.get("state") or "").strip()
    oauth_error = (request.GET.get("error") or "").strip()
    if oauth_error:
        return HttpResponse(f"<h3>Google Drive connection failed</h3><p>{oauth_error}</p>")
    try:
        exchange_google_oauth_code(settings_obj, code=code, state=oauth_state)
        return HttpResponse(
            "<html><body style='font-family:sans-serif'><h3>Google Drive connected.</h3>"
            "<p>You can close this tab and return to Work Zilla SaaS Admin.</p>"
            "<script>if(window.opener){window.opener.location.reload();}</script>"
            "</body></html>"
        )
    except GoogleDriveAuthError as exc:
        return HttpResponse(f"<h3>Google Drive connection failed</h3><p>{exc}</p>", status=400)


@login_required
@require_http_methods(["POST"])
def system_backup_google_disconnect(request):
    error = _require_saas_admin(request)
    if error:
        return error
    settings_obj = SystemBackupManagerSettings.get_solo()
    settings_obj.google_access_token = ""
    settings_obj.google_refresh_token = ""
    settings_obj.google_token_expiry = None
    settings_obj.oauth_state = ""
    settings_obj.oauth_state_created_at = None
    settings_obj.save(update_fields=[
        "google_access_token",
        "google_refresh_token",
        "google_token_expiry",
        "oauth_state",
        "oauth_state_created_at",
        "updated_at",
    ])
    return JsonResponse({"ok": True, "settings": _serialize_settings(settings_obj)})


@login_required
@require_http_methods(["GET", "PUT", "POST"])
def blackblaze_backup_settings(request):
    error = _require_saas_admin(request)
    if error:
        return error

    try:
        bb_settings = BlackblazeBackupSettings.get_solo()
    except (ProgrammingError, OperationalError):
        return JsonResponse({"detail": "blackblaze_tables_not_migrated"}, status=503)
    if request.method == "GET":
        return JsonResponse(_serialize_blackblaze_settings())

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    bb_settings.is_active = bool(payload.get("is_active", bb_settings.is_active))
    bb_settings.db_enabled = bool(payload.get("db_enabled", bb_settings.db_enabled))
    bb_settings.script_enabled = bool(payload.get("script_enabled", bb_settings.script_enabled))
    try:
        bb_settings.db_interval_hours = max(1, min(24, int(payload.get("db_interval_hours", bb_settings.db_interval_hours))))
        bb_settings.db_retention_days = max(1, min(30, int(payload.get("db_retention_days", bb_settings.db_retention_days))))
        bb_settings.script_daily_hour_local = max(0, min(23, int(payload.get("script_daily_hour_local", bb_settings.script_daily_hour_local))))
        bb_settings.script_daily_minute_local = max(0, min(59, int(payload.get("script_daily_minute_local", bb_settings.script_daily_minute_local))))
        bb_settings.script_retention_days = max(1, min(30, int(payload.get("script_retention_days", bb_settings.script_retention_days))))
    except (TypeError, ValueError):
        return JsonResponse({"detail": "invalid_schedule_values"}, status=400)
    # Saving schedule/settings should not keep showing an old runtime backup error.
    # Runtime errors (example: pg_dump missing) will be set again only when a backup job runs.
    bb_settings.last_error_message = ""
    bb_settings.save()
    return JsonResponse(_serialize_blackblaze_settings())


@login_required
@require_http_methods(["POST"])
def blackblaze_backup_run(request):
    error = _require_saas_admin(request)
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    backup_type = str(payload.get("backup_type") or "").strip().lower()
    if backup_type not in ("db", "script"):
        return JsonResponse({"detail": "backup_type_required"}, status=400)

    try:
        BlackblazeBackupSettings.get_solo()
    except (ProgrammingError, OperationalError):
        return JsonResponse({"detail": "blackblaze_tables_not_migrated"}, status=503)

    try:
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            artifact = run_blackblaze_backup(backup_type)
            return JsonResponse({"queued": True, "artifact_id": str(artifact.id)})
        task = run_blackblaze_backup_job.delay(backup_type)
        return JsonResponse({"queued": True, "task_id": str(task.id)})
    except Exception as exc:
        return JsonResponse({"detail": str(exc)}, status=400)


@login_required
@require_http_methods(["GET"])
def blackblaze_backup_files(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        BlackblazeBackupSettings.get_solo()
    except (ProgrammingError, OperationalError):
        return JsonResponse({"grouped": {"db": {}, "script": {}}, "detail": "blackblaze_tables_not_migrated"}, status=200)
    days = request.GET.get("days") or 7
    try:
        days = max(1, min(30, int(days)))
    except (TypeError, ValueError):
        days = 7
    return JsonResponse({"grouped": grouped_artifacts_last_days(days)})


@login_required
@require_http_methods(["GET"])
def blackblaze_backup_download(request, artifact_id):
    error = _require_saas_admin(request)
    if error:
        return error

    try:
        artifact = BlackblazeBackupArtifact.objects.filter(id=artifact_id, status="completed").first()
    except (ProgrammingError, OperationalError):
        return JsonResponse({"detail": "blackblaze_tables_not_migrated"}, status=503)
    if not artifact or not artifact.storage_path:
        raise Http404

    media_settings = GlobalMediaStorageSettings.get_solo()
    storage = None
    if media_settings.storage_mode == "object" and media_settings.is_object_configured():
        storage = storage_utils._build_object_storage(media_settings)
        if storage:
            storage.location = ""
    if storage is None:
        storage = default_storage
    try:
        file_handle = storage.open(artifact.storage_path, "rb")
    except Exception:
        raise Http404

    response = FileResponse(file_handle, content_type="application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{artifact.file_name or "backup.bin"}"'
    return response
