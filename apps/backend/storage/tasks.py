from django.db import transaction

from .storage_backend import storage_delete
from .models import StorageFile


@transaction.atomic
def purge_deleted_files(limit=200):
    rows = list(StorageFile.objects.filter(is_deleted=True)[:limit])
    for row in rows:
        storage_delete(row.storage_key)
        row.delete()
    return len(rows)
