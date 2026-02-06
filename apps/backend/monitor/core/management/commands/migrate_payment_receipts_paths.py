import os
import shutil

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import PendingTransfer
from saas_admin.models import GlobalMediaStorageSettings


class Command(BaseCommand):
    help = "Move local payment receipt files into org-scoped folders and update DB paths."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Run even if storage mode is not local.",
        )

    def handle(self, *args, **options):
        settings_obj = GlobalMediaStorageSettings.get_solo()
        if settings_obj.storage_mode != "local" and not options.get("force"):
            self.stdout.write("Storage mode is not local. Aborting. Use --force to override.")
            return

        media_root = str(getattr(settings, "MEDIA_ROOT", "") or "")
        if not media_root or not os.path.isdir(media_root):
            self.stdout.write("MEDIA_ROOT missing or not a directory. Aborting.")
            return

        moved = 0
        skipped = 0

        qs = PendingTransfer.objects.select_related("organization").only(
            "id", "receipt", "organization_id"
        )

        for transfer in qs.iterator():
            if not transfer.receipt:
                skipped += 1
                continue
            org_id = transfer.organization_id
            if not org_id:
                skipped += 1
                continue
            current_name = transfer.receipt.name or ""
            filename = os.path.basename(current_name) or current_name
            target_name = f"payments/{org_id}/{filename}"
            if current_name.replace("\\", "/") == target_name:
                skipped += 1
                continue

            src_path = os.path.join(media_root, current_name.replace("/", os.sep))
            dst_path = os.path.join(media_root, target_name.replace("/", os.sep))
            if not os.path.exists(src_path):
                skipped += 1
                continue

            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            try:
                shutil.move(src_path, dst_path)
            except OSError:
                skipped += 1
                continue

            with transaction.atomic():
                transfer.receipt.name = target_name
                transfer.save(update_fields=["receipt"])
            moved += 1

        self.stdout.write(f"Moved: {moved}, Skipped: {skipped}")

