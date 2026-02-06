try:
    from celery import shared_task
except Exception:  # pragma: no cover
    def shared_task(*args, **kwargs):
        def decorator(fn):
            return fn
        return decorator

from .models import BackupRecord
from .restore_pipeline import restore_backup_package


@shared_task(bind=True)
def restore_backup_task(self, backup_id, user_id=None):
    backup = (
        BackupRecord.objects
        .select_related("organization", "product", "requested_by")
        .filter(id=backup_id)
        .first()
    )
    if not backup:
        return {"status": "not_found"}
    return restore_backup_package(backup, user=backup.requested_by)
