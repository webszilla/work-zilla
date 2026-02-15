from django.conf import settings
from django.utils import timezone
import uuid
import os

from apps.backend.core_platform.storage import DynamicMediaStorage


storage_backend = DynamicMediaStorage()


def _safe_part(value, fallback):
    raw = str(value or "").strip().lower()
    if not raw:
        return fallback
    clean = "".join(ch if ch.isalnum() else "-" for ch in raw)
    clean = "-".join(part for part in clean.split("-") if part)
    return clean or fallback


def _resolve_org(org_or_id):
    if hasattr(org_or_id, "id"):
        org_id = getattr(org_or_id, "id", None)
        org_name = getattr(org_or_id, "name", "")
    else:
        org_id = org_or_id
        org_name = ""
    return org_id, org_name


def _resolve_user_id(user_or_id):
    if hasattr(user_or_id, "id"):
        return getattr(user_or_id, "id", None)
    return user_or_id


def build_storage_key(org, user, root_folder_name="sync", original_filename=""):
    org_id, org_name = _resolve_org(org)
    user_id = _resolve_user_id(user)
    org_part = f"{_safe_part(org_name, 'org')}-{org_id or 'unknown'}"
    root_part = _safe_part(root_folder_name, "sync")
    ext = os.path.splitext(str(original_filename or ""))[1].strip().lower()
    ext = ext[:12] if ext.startswith(".") else ""
    uid = uuid.uuid4()
    return f"media-storage/{org_part}/media-storage/{root_part}/{user_id or 'user'}-{uid}{ext}"


def storage_exists(key):
    try:
        return storage_backend.exists(key)
    except Exception:
        return False


def storage_save(key, file_obj):
    return storage_backend.save(key, file_obj)


def storage_open(key, mode="rb"):
    return storage_backend.open(key, mode)


def storage_delete(key):
    try:
        storage_backend.delete(key)
        return True
    except Exception:
        return False


def storage_url(key, expires_seconds=900):
    try:
        return storage_backend.url(key, expire=expires_seconds)
    except Exception:
        try:
            return storage_backend.url(key)
        except Exception:
            return ""
