import json
import os
import shutil
import zipfile

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from .models import BackupRecord
from .backup_pipeline import _compute_sha256
from .registry import get_restorers
from .services import log_backup_event


def _read_manifest(extract_dir):
    manifest_path = os.path.join(extract_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise RuntimeError("manifest_missing")
    with open(manifest_path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def restore_backup_package(backup: BackupRecord, *, user=None):
    if backup.status not in ("completed", "expired"):
        raise RuntimeError("backup_not_ready")

    tmp_dir = os.path.join(str(settings.MEDIA_ROOT), "temp", "restore_work", str(backup.id))
    os.makedirs(tmp_dir, exist_ok=True)
    try:
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=user,
            action="restore_started",
            status="ok",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
        )

        with default_storage.open(backup.storage_path, "rb") as handle:
            zip_path = os.path.join(tmp_dir, "backup.zip")
            with open(zip_path, "wb") as out:
                out.write(handle.read())

        if backup.checksum_sha256:
            actual = _compute_sha256(zip_path)
            if actual != backup.checksum_sha256:
                raise RuntimeError("checksum_mismatch")

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        manifest = _read_manifest(tmp_dir)
        if manifest.get("organization_id") != backup.organization_id:
            raise RuntimeError("org_mismatch")
        if manifest.get("product_id") != backup.product_id:
            raise RuntimeError("product_mismatch")

        for restorer in get_restorers():
            restorer(backup.organization_id, backup.product_id, tmp_dir, manifest)
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=user,
            action="restore_completed",
            status="ok",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
        )
        return {"status": "ok"}
    except Exception as exc:
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=user,
            action="restore_failed",
            status="error",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
            message=str(exc),
        )
        raise
    finally:
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
