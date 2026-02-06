from django.conf import settings
from django.utils import timezone
import uuid

from apps.backend.platform.storage import DynamicMediaStorage


storage_backend = DynamicMediaStorage()


def build_storage_key(org_id, user_id):
    uid = uuid.uuid4()
    return f"org/{org_id}/user/{user_id}/files/{uid}"


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
