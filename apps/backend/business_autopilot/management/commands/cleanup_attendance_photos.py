from django.core.management.base import BaseCommand

from apps.backend.business_autopilot.api_views import cleanup_expired_attendance_photos


class Command(BaseCommand):
    help = "Delete expired attendance proof photos while keeping attendance records."

    def handle(self, *args, **options):
        deleted_count = cleanup_expired_attendance_photos()
        self.stdout.write(self.style.SUCCESS(f"Deleted {deleted_count} expired attendance photo(s)."))
