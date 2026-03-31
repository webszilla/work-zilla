from django.core.management.base import BaseCommand

from apps.backend.business_autopilot.api_views import _dispatch_due_crm_meeting_reminders


class Command(BaseCommand):
    help = "Send due CRM meeting reminder emails."

    def handle(self, *args, **options):
        result = _dispatch_due_crm_meeting_reminders()
        checked = int(result.get("checked") or 0)
        sent = int(result.get("sent") or 0)
        self.stdout.write(self.style.SUCCESS(f"CRM meeting reminders processed: checked={checked}, sent={sent}"))
