from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.files.storage import default_storage

from apps.backend.backups.retention_service import apply_retention_for_org_product
from apps.backend.backups.storage import resolve_local_path
from apps.backend.backups.models import BackupRecord


class Command(BaseCommand):
    help = "Apply backup retention policy and purge expired backups."

    def handle(self, *args, **options):
        pairs = (
            BackupRecord.objects
            .filter(status="completed")
            .values_list("organization_id", "product_id")
            .distinct()
        )

        def delete_local(rec):
            for key in (rec.storage_path, rec.manifest_path, rec.checksum_path):
                if not key:
                    continue
                try:
                    default_storage.delete(key)
                except Exception:
                    path = resolve_local_path(key)
                    if path.exists():
                        path.unlink(missing_ok=True)

        # Expire & purge by TTL
        now = timezone.now()
        expired = BackupRecord.objects.filter(status="completed", expires_at__isnull=False, expires_at__lt=now)
        for rec in expired:
            delete_local(rec)
            rec.status = "expired"
            rec.purged_at = now
            rec.save(update_fields=["status", "purged_at"])

        total_purged = 0
        for org_id, product_id in pairs:
            result = apply_retention_for_org_product(org_id, product_id, delete_callback=delete_local)
            total_purged += result.get("purged", 0)

        self.stdout.write(self.style.SUCCESS(f"Backup retention applied. Purged: {total_purged}"))
