import uuid
from typing import Optional

from django.conf import settings
from django.utils import timezone

from .models import BackupRecord, BackupAuditLog


def log_backup_event(
    *,
    organization,
    action: str,
    product=None,
    user=None,
    status: str = "ok",
    message: str = "",
    backup_id: Optional[uuid.UUID] = None,
    request_id: Optional[uuid.UUID] = None,
    trace_id: str = "",
    actor_type: str = "system",
    ip_address: Optional[str] = None,
    user_agent: str = "",
    event_meta: Optional[dict] = None,
):
    try:
        BackupAuditLog.objects.create(
            organization=organization,
            product=product,
            user=user,
            action=action,
            status=status,
            message=(message or "")[:2000],
            backup_id=backup_id,
            request_id=request_id,
            trace_id=(trace_id or "")[:64],
            actor_type=actor_type,
            ip_address=ip_address,
            user_agent=(user_agent or "")[:1000],
            event_meta=event_meta or {},
        )
    except Exception:
        pass


def request_backup(*, organization, product, user, request_id=None, trace_id="", ip_address=None, user_agent=""):
    backup = BackupRecord.objects.create(
        organization=organization,
        product=product,
        requested_by=user,
        status="queued",
        request_id=request_id,
        expires_at=timezone.now() + timezone.timedelta(hours=getattr(settings, "BACKUP_ZIP_TTL_HOURS", 24)),
        download_url_expires_at=timezone.now() + timezone.timedelta(hours=getattr(settings, "BACKUP_ZIP_TTL_HOURS", 24)),
    )
    log_backup_event(
        organization=organization,
        product=product,
        user=user,
        action="backup_requested",
        status="ok",
        backup_id=backup.id,
        request_id=request_id,
        trace_id=trace_id,
        actor_type="user",
        ip_address=ip_address,
        user_agent=user_agent,
        event_meta={"backup_id": str(backup.id)},
    )
    return backup


def mark_backup_started(backup: BackupRecord):
    backup.status = "running"
    backup.started_at = timezone.now()
    backup.save(update_fields=["status", "started_at"])


def mark_backup_failed(backup: BackupRecord, message: str = ""):
    backup.status = "failed"
    backup.error_message = (message or "")[:2000]
    backup.completed_at = timezone.now()
    backup.save(update_fields=["status", "error_message", "completed_at"])


def mark_backup_completed(
    backup: BackupRecord,
    *,
    storage_path: str,
    manifest_path: str,
    checksum_path: str,
    checksum_sha256: str,
    size_bytes: int,
):
    backup.status = "completed"
    backup.storage_path = storage_path
    backup.manifest_path = manifest_path
    backup.checksum_path = checksum_path
    backup.checksum_sha256 = checksum_sha256
    backup.size_bytes = size_bytes or 0
    backup.completed_at = timezone.now()
    backup.save(update_fields=[
        "status",
        "storage_path",
        "manifest_path",
        "checksum_path",
        "checksum_sha256",
        "size_bytes",
        "completed_at",
    ])


def ensure_download_token(backup: BackupRecord):
    if backup.download_token:
        return backup.download_token
    token = uuid.uuid4().hex
    backup.download_token = token
    backup.save(update_fields=["download_token"])
    return token
