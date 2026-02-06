from django.core.management.base import BaseCommand

from apps.backend.monitoring.alerts import check_alerts


class Command(BaseCommand):
    help = "Check monitoring alerts"

    def handle(self, *args, **options):
        check_alerts()
