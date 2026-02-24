import os
import threading
from collections import Counter

from celery import shared_task
from django.conf import settings
from django.core.files import File
from django.core.files.storage import FileSystemStorage
from django.utils import timezone

from core.models import Organization
from .models import GlobalMediaStorageSettings, MediaStoragePullJob
from .org_backup_manager import run_org_backup_pipeline, run_org_restore_pipeline, queue_org_backup
from .system_backup_manager import run_system_backup_pipeline, trigger_due_scheduled_backup


def _iter_local_media_files(local_root):
    if not local_root or not os.path.exists(local_root):
        return
    for root, _, files in os.walk(local_root):
        for filename in files:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, local_root).replace(os.sep, "/")
            yield full_path, rel_path


@shared_task
def pull_local_media_job(job_id):
    job = MediaStoragePullJob.objects.filter(id=job_id).first()
    if not job:
        return

    settings_obj = GlobalMediaStorageSettings.get_solo()
    if settings_obj.storage_mode != "object" or not settings_obj.is_object_configured():
        job.status = "failed"
        job.error_message = "Object storage not configured."
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at"])
        return

    local_root = str(getattr(settings, "MEDIA_ROOT", "") or "")
    local_storage = FileSystemStorage(location=local_root, base_url=settings.MEDIA_URL)
    if not local_root or not os.path.exists(local_root):
        job.status = "failed"
        job.error_message = "Local media folder not found."
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at"])
        return

    try:
        from apps.backend.core_platform import storage as storage_utils
    except Exception:
        job.status = "failed"
        job.error_message = "Object storage backend unavailable."
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at"])
        return

    dest_storage = storage_utils._build_object_storage(settings_obj)
    if not dest_storage:
        job.status = "failed"
        job.error_message = "Object storage backend unavailable."
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at"])
        return
    dest_storage.location = ""

    file_list = list(_iter_local_media_files(local_root))
    total = len(file_list)
    job.total_files = total
    job.status = "running"
    job.started_at = timezone.now()
    job.save(update_fields=["total_files", "status", "started_at"])

    copied = 0
    skipped = 0
    existing = 0
    ext_counts = Counter()
    for index, (full_path, rel_path) in enumerate(file_list, start=1):
        job.current_path = rel_path
        if not job.overwrite:
            if dest_storage.exists(rel_path):
                existing += 1
                skipped += 1
                if index % 25 == 0:
                    MediaStoragePullJob.objects.filter(id=job.id).update(
                        current_path=job.current_path,
                        copied_files=copied,
                        skipped_files=skipped,
                        existing_files=existing,
                    )
                continue
        try:
            with local_storage.open(rel_path, "rb") as handle:
                dest_storage.save(rel_path, File(handle))
            copied += 1
            ext = os.path.splitext(rel_path)[1].lower().lstrip(".") or "unknown"
            ext_counts[ext] += 1
            if job.delete_local:
                try:
                    os.remove(full_path)
                except OSError:
                    pass
        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            job.finished_at = timezone.now()
            job.copied_files = copied
            job.skipped_files = skipped
            job.save(update_fields=["status", "error_message", "finished_at", "copied_files", "skipped_files"])
            return

        if index % 25 == 0:
            MediaStoragePullJob.objects.filter(id=job.id).update(
                current_path=job.current_path,
                copied_files=copied,
                skipped_files=skipped,
                existing_files=existing,
            )

    if job.delete_local:
        for root, dirs, _ in os.walk(local_root, topdown=False):
            for name in dirs:
                path = os.path.join(root, name)
                try:
                    os.rmdir(path)
                except OSError:
                    pass

    job.status = "completed"
    job.finished_at = timezone.now()
    job.copied_files = copied
    job.skipped_files = skipped
    job.existing_files = existing
    job.file_type_counts = dict(ext_counts)
    job.current_path = ""
    job.save(update_fields=["status", "finished_at", "copied_files", "skipped_files", "existing_files", "file_type_counts", "current_path"])


@shared_task(name="saas_admin.system_backup_run")
def run_system_backup_job(log_id):
    return run_system_backup_pipeline(log_id)


@shared_task(name="saas_admin.system_backup_scheduler_tick")
def run_system_backup_scheduler_tick():
    result = trigger_due_scheduled_backup()
    if not result.get("queued"):
        return result

    broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
    log_id = result.get("log_id")
    if not log_id:
        return {"queued": False, "reason": "missing_log_id"}
    if broker_url.startswith("memory://"):
        threading.Thread(target=run_system_backup_job, args=(log_id,), daemon=True).start()
    else:
        run_system_backup_job.delay(log_id)
    return {"queued": True, "log_id": log_id}


@shared_task(name="saas_admin.org_backup_run")
def run_org_backup_job(log_id):
    return run_org_backup_pipeline(log_id)


@shared_task(name="saas_admin.org_restore_run")
def run_org_restore_job(log_id):
    return run_org_restore_pipeline(log_id)


@shared_task(name="saas_admin.org_backup_all")
def run_org_backup_all_job(requested_by_user_id=None):
    queued = 0
    skipped = 0
    errors = []
    broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
    for org in Organization.objects.order_by("id"):
        try:
            log = queue_org_backup(org, requested_by=None, trigger="bulk_manual")
            queued += 1
            if broker_url.startswith("memory://"):
                threading.Thread(target=run_org_backup_job, args=(log.id,), daemon=True).start()
            else:
                run_org_backup_job.delay(log.id)
        except Exception as exc:
            skipped += 1
            if len(errors) < 20:
                errors.append(f"{org.id}: {exc}")
    return {"queued": queued, "skipped": skipped, "errors": errors}
