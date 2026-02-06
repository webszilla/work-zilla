from django.db.models import Q
from django.utils import timezone

from .models import BackupRecord
from .retention import retention_candidates, DEFAULT_RETENTION
from .services import log_backup_event
from apps.backend.monitor.saas_admin.models import (
    BackupRetentionSettings,
    OrganizationBackupRetentionOverride,
    ProductBackupRetentionOverride,
)


def _resolve_retention_policy(organization_id, product_id):
    policy = DEFAULT_RETENTION.copy()
    global_settings = BackupRetentionSettings.get_solo()
    policy.update(
        {
            "last_n": global_settings.last_n,
            "daily_days": global_settings.daily_days,
            "weekly_weeks": global_settings.weekly_weeks,
            "monthly_months": global_settings.monthly_months,
        }
    )

    org_override = OrganizationBackupRetentionOverride.objects.filter(organization_id=organization_id).first()
    if org_override:
        for key in ("last_n", "daily_days", "weekly_weeks", "monthly_months"):
            value = getattr(org_override, key, 0)
            if value:
                policy[key] = value

    product_override = ProductBackupRetentionOverride.objects.filter(product_id=product_id).first()
    if product_override:
        for key in ("last_n", "daily_days", "weekly_weeks", "monthly_months"):
            value = getattr(product_override, key, 0)
            if value:
                policy[key] = value

    return policy


def apply_retention_for_org_product(organization_id, product_id, delete_callback=None):
    policy = _resolve_retention_policy(organization_id, product_id)
    records = list(
        BackupRecord.objects.filter(
            organization_id=organization_id,
            product_id=product_id,
            status="completed",
        )
    )
    decisions = retention_candidates(records, policy)
    purge_ids = decisions["purge_ids"]

    if not purge_ids:
        return {"purged": 0, "kept": len(decisions["keep_ids"])}

    purged = 0
    for rec in records:
        if rec.id not in purge_ids:
            continue
        if delete_callback:
            delete_callback(rec)
        log_backup_event(
            organization=rec.organization,
            product=rec.product,
            user=None,
            action="backup_deleted",
            status="ok",
            backup_id=rec.id,
            actor_type="system",
            event_meta={"retention_policy": policy},
        )
        rec.delete()
        purged += 1

    return {"purged": purged, "kept": len(decisions["keep_ids"])}
