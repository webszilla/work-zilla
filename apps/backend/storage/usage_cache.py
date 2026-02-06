from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import OrgStorageUsage, StorageFile


@transaction.atomic
def get_usage_for_org(org, lock=False):
    if lock:
        usage = OrgStorageUsage.objects.select_for_update().filter(organization=org).first()
    else:
        usage = OrgStorageUsage.objects.filter(organization=org).first()
    if usage:
        return usage
    usage = OrgStorageUsage.objects.create(organization=org, used_storage_bytes=0)
    return usage


@transaction.atomic
def increment_usage(org, delta_bytes):
    usage = get_usage_for_org(org, lock=True)
    usage.used_storage_bytes = max(0, int(usage.used_storage_bytes or 0) + int(delta_bytes or 0))
    usage.last_calculated_at = timezone.now()
    usage.save(update_fields=["used_storage_bytes", "last_calculated_at"])
    return usage


@transaction.atomic
def decrement_usage(org, delta_bytes):
    usage = get_usage_for_org(org, lock=True)
    usage.used_storage_bytes = max(0, int(usage.used_storage_bytes or 0) - int(delta_bytes or 0))
    usage.last_calculated_at = timezone.now()
    usage.save(update_fields=["used_storage_bytes", "last_calculated_at"])
    return usage


@transaction.atomic
def rebuild_usage(org):
    total = (
        StorageFile.objects
        .filter(organization=org, is_deleted=False)
        .aggregate(total=Sum("size_bytes"))
        .get("total")
        or 0
    )
    usage = get_usage_for_org(org, lock=True)
    usage.used_storage_bytes = int(total or 0)
    usage.last_calculated_at = timezone.now()
    usage.save(update_fields=["used_storage_bytes", "last_calculated_at"])
    return usage


def rebuild_all_usage():
    from core.models import Organization
    results = []
    for org in Organization.objects.all():
        results.append(rebuild_usage(org))
    return results
