import os
from pathlib import Path

from django.conf import settings


def build_backup_paths(organization_id, product_id, backup_id, created_at):
    timestamp = created_at.strftime("%Y-%m-%dT%H-%M-%S")
    year = created_at.strftime("%Y")
    month = created_at.strftime("%m")
    org_part = f"org_{organization_id}"
    product_part = f"product_{product_id}"
    base_prefix = f"backups/{org_part}/{product_part}/{year}/{month}"
    base_name = f"backup_{timestamp}_{backup_id}"
    return {
        "zip": f"{base_prefix}/{base_name}.zip",
        "manifest": f"{base_prefix}/{base_name}.manifest.json",
        "sha256": f"{base_prefix}/{base_name}.sha256",
        "prefix": base_prefix,
    }


def resolve_local_path(key: str) -> Path:
    base = Path(settings.MEDIA_ROOT)
    return base / key


def ensure_local_dir(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def temp_workdir(backup_id) -> Path:
    base = Path(settings.MEDIA_ROOT) / "temp" / "backup_work" / str(backup_id)
    base.mkdir(parents=True, exist_ok=True)
    return base
