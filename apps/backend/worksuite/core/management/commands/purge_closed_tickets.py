from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.models import OrgSupportTicket


class Command(BaseCommand):
    help = "Purge organization support tickets that stayed closed beyond retention days."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=45, help="Retention days for closed tickets.")
        parser.add_argument("--dry-run", action="store_true", help="Show count without deleting.")

    def handle(self, *args, **options):
        days = max(int(options.get("days") or 45), 1)
        dry_run = bool(options.get("dry_run"))
        cutoff = timezone.now() - timedelta(days=days)
        queryset = OrgSupportTicket.objects.filter(
            status="closed",
            closed_at__isnull=False,
            closed_at__lt=cutoff,
        )
        count = queryset.count()

        if dry_run:
            self.stdout.write(f"[DRY-RUN] {count} closed tickets older than {days} days would be deleted.")
            return

        if not count:
            self.stdout.write("No closed tickets eligible for purge.")
            return

        queryset.delete()
        self.stdout.write(f"Deleted {count} closed tickets older than {days} days.")
