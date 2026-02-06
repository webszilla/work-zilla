import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import Organization

from apps.backend.retention.models import RetentionStatus
from apps.backend.retention.utils.retention import (
    evaluate_tenant_status,
    run_cleanup_handlers,
)


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Apply global retention policies to all tenants."

    def handle(self, *args, **options):
        now = timezone.now()
        total = 0
        transitioned = 0
        deleted = 0

        for org in Organization.objects.all().iterator():
            total += 1
            previous = None
            existing = (
                org.retention_status
                if hasattr(org, "retention_status")
                else None
            )
            if existing:
                previous = existing.status
            retention = evaluate_tenant_status(org, now=now)
            if retention.status == RetentionStatus.PENDING_DELETE:
                if retention.deleted_at:
                    continue
                ok = run_cleanup_handlers(org)
                if not ok:
                    logger.warning("Retention cleanup failed; will retry", extra={"org_id": org.id})
                    continue
                retention.status = RetentionStatus.DELETED
                retention.deleted_at = now
                retention.save(update_fields=["status", "deleted_at"])
                deleted += 1
                logger.info("Tenant deleted via retention policy", extra={"org_id": org.id})
                continue
            if previous and previous != retention.status:
                logger.info(
                    "Retention status changed",
                    extra={"org_id": org.id, "from_status": previous, "to_status": retention.status},
                )
            transitioned += 1

        logger.info(
            "Retention policy run completed",
            extra={"total": total, "transitioned": transitioned, "deleted": deleted},
        )
