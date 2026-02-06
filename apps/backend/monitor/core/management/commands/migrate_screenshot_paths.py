import os
import shutil

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Screenshot
from saas_admin.models import GlobalMediaStorageSettings


class Command(BaseCommand):
    help = "Move local screenshot files into org-scoped folders and update DB paths."

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

        qs = Screenshot.objects.select_related("employee", "employee__org").only(
            "id", "image", "employee_id", "employee__org_id"
        )

        for shot in qs.iterator():
            if not shot.image:
                skipped += 1
                continue
            org_id = getattr(shot.employee, "org_id", None)
            if not org_id:
                skipped += 1
                continue
            current_name = shot.image.name or ""
            filename = os.path.basename(current_name) or current_name
            target_name = f"screenshots/{org_id}/{filename}"
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
                shot.image.name = target_name
                shot.save(update_fields=["image"])
            moved += 1

        self.stdout.write(f"Moved: {moved}, Skipped: {skipped}")
