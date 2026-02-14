from dataclasses import dataclass
from django.utils import timezone

from .models import StorageFile, StorageFolder
from .storage_backend import storage_delete


@dataclass
class StorageEvent:
    name: str
    payload: dict


def emit_event(name, **payload):
    return StorageEvent(name=name, payload=payload)


def emit_security_event(action, org_id=None, user_id=None, request=None, **extra):
    payload = {
        "org_id": org_id,
        "user_id": user_id,
        "action": action,
        "timestamp": timezone.now().isoformat(),
    }
    if request:
        payload["ip"] = request.META.get("REMOTE_ADDR")
    payload.update(extra)
    return StorageEvent(name="security_event", payload=payload)


def soft_delete_folder(folder):
    if folder.is_deleted:
        return
    files = list(StorageFile.objects.filter(folder=folder, is_deleted=False).only("storage_key"))
    for item in files:
        hard_delete_file(item.storage_key)
    folder.is_deleted = True
    folder.save(update_fields=["is_deleted"])
    StorageFile.objects.filter(folder=folder, is_deleted=False).update(is_deleted=True)
    children = StorageFolder.objects.filter(parent=folder, is_deleted=False)
    for child in children:
        soft_delete_folder(child)


def hard_delete_file(storage_key):
    return storage_delete(storage_key)
