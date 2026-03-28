try:
    from celery import shared_task
except Exception:  # pragma: no cover
    def shared_task(*args, **kwargs):
        def decorator(fn):
            return fn
        return decorator

from django.contrib.auth import get_user_model

from .models import BackupRecord, OrgGoogleDriveBackupSettings
from .backup_pipeline import generate_backup_package
from .restore_pipeline import restore_backup_package
from .google_drive_service import run_org_google_backup, run_due_org_google_backups


@shared_task
def restore_backup_task(backup_id, user_id=None):
    backup = (
        BackupRecord.objects
        .select_related("organization", "product", "requested_by")
        .filter(id=backup_id)
        .first()
    )
    if not backup:
        return {"status": "not_found"}
    return restore_backup_package(backup, user=backup.requested_by)


@shared_task
def generate_backup_task(backup_id):
    backup = (
        BackupRecord.objects
        .select_related("organization", "product", "requested_by")
        .filter(id=backup_id)
        .first()
    )
    if not backup:
        return {"status": "not_found"}
    generate_backup_package(backup)
    return {"status": "completed", "backup_id": str(backup.id)}


@shared_task
def run_org_google_backup_task(org_id, user_id=None, trigger="manual"):
    settings_obj = (
        OrgGoogleDriveBackupSettings.objects
        .select_related("organization")
        .filter(organization_id=org_id)
        .first()
    )
    if not settings_obj:
        return {"status": "not_found"}
    requested_by = None
    if user_id:
        requested_by = get_user_model().objects.filter(id=user_id).first()
    return run_org_google_backup(settings_obj, requested_by=requested_by, trigger=trigger)


@shared_task
def run_due_org_google_backups_task():
    return run_due_org_google_backups()
