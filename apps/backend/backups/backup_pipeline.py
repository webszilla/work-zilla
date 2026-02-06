import hashlib
import json
import os
import shutil
import zipfile
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from .models import BackupRecord
from .registry import get_exporters
from .scope import (
    expand_include_prefixes,
    get_exclude_prefixes,
    should_include_path,
)
from .storage import build_backup_paths, resolve_local_path, temp_workdir
from .services import (
    log_backup_event,
    mark_backup_completed,
    mark_backup_failed,
    mark_backup_started,
    ensure_download_token,
)


def _iter_storage_files(prefix: str):
    stack = [prefix]
    while stack:
        current = stack.pop()
        try:
            dirs, files = default_storage.listdir(current)
        except Exception:
            continue
        for name in files:
            yield f"{current}{name}" if current.endswith("/") else f"{current}/{name}"
        for name in dirs:
            next_prefix = f"{current}{name}/" if current.endswith("/") else f"{current}/{name}/"
            stack.append(next_prefix)


def _copy_file_to_dir(storage_key: str, target_dir: str):
    target_path = os.path.join(target_dir, storage_key.replace("/", os.sep))
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with default_storage.open(storage_key, "rb") as src, open(target_path, "wb") as dst:
        shutil.copyfileobj(src, dst)
    return target_path


def _build_manifest(backup: BackupRecord, data_sections: list, file_list: list):
    return {
        "backup_id": str(backup.id),
        "organization_id": backup.organization_id,
        "product_id": backup.product_id,
        "created_at": timezone.now().isoformat(),
        "sections": data_sections,
        "files": file_list,
        "exclude_prefixes": get_exclude_prefixes(),
    }


def _compute_sha256(file_path: str) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def generate_backup_package(backup: BackupRecord):
    workdir = temp_workdir(backup.id)
    data_dir = os.path.join(workdir, "data")
    files_dir = os.path.join(workdir, "files")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(files_dir, exist_ok=True)

    try:
        mark_backup_started(backup)
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=backup.requested_by,
            action="backup_started",
            status="ok",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
        )

        data_sections = []
        for exporter in get_exporters():
            try:
                section = exporter(backup.organization_id, backup.product_id, data_dir)
                if section:
                    data_sections.append(section)
            except Exception as exc:
                data_sections.append({"exporter": getattr(exporter, "__name__", "exporter"), "error": str(exc)})

        include_prefixes = expand_include_prefixes(backup.organization_id, backup.product_id)
        exclude_prefixes = get_exclude_prefixes()
        file_list = []

        for prefix in include_prefixes:
            for storage_key in _iter_storage_files(prefix):
                if not should_include_path(storage_key, include_prefixes, exclude_prefixes):
                    continue
                _copy_file_to_dir(storage_key, files_dir)
                file_list.append(storage_key)

        manifest = _build_manifest(backup, data_sections, file_list)
        manifest_path = os.path.join(workdir, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2)

        backup_paths = build_backup_paths(
            backup.organization_id,
            backup.product_id,
            backup.id,
            timezone.now(),
        )

        zip_path = os.path.join(workdir, "backup.zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(workdir):
                for fname in files:
                    if fname.endswith(".zip"):
                        continue
                    full = os.path.join(root, fname)
                    rel = os.path.relpath(full, workdir)
                    zf.write(full, rel)

        max_bytes = getattr(settings, "BACKUP_MAX_SIZE_MB", 5120) * 1024 * 1024
        zip_size = os.path.getsize(zip_path)
        if max_bytes and zip_size > max_bytes:
            raise RuntimeError(f"Backup exceeds size limit ({zip_size} bytes).")

        sha256 = _compute_sha256(zip_path)
        sha_path = os.path.join(workdir, "backup.sha256")
        with open(sha_path, "w", encoding="utf-8") as handle:
            handle.write(sha256)

        with open(zip_path, "rb") as handle:
            default_storage.save(backup_paths["zip"], handle)
        with open(manifest_path, "rb") as handle:
            default_storage.save(backup_paths["manifest"], handle)
        with open(sha_path, "rb") as handle:
            default_storage.save(backup_paths["sha256"], handle)

        zip_local = resolve_local_path(backup_paths["zip"])
        size_bytes = zip_local.stat().st_size if zip_local.exists() else 0

        mark_backup_completed(
            backup,
            storage_path=backup_paths["zip"],
            manifest_path=backup_paths["manifest"],
            checksum_path=backup_paths["sha256"],
            checksum_sha256=sha256,
            size_bytes=size_bytes,
        )
        token = ensure_download_token(backup)
        backup.download_url = f"/api/backup/download/{backup.id}?token={token}"
        backup.download_url_expires_at = backup.expires_at
        backup.save(update_fields=["download_url", "download_url_expires_at"])
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=backup.requested_by,
            action="backup_completed",
            status="ok",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
            event_meta={"size_bytes": size_bytes},
        )
    except Exception as exc:
        mark_backup_failed(backup, str(exc))
        log_backup_event(
            organization=backup.organization,
            product=backup.product,
            user=backup.requested_by,
            action="backup_failed",
            status="error",
            backup_id=backup.id,
            request_id=backup.request_id,
            actor_type="system",
            message=str(exc),
        )
        raise
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass
