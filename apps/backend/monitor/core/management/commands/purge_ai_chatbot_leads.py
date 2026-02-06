from django.core.management.base import BaseCommand

from core.models import Subscription
from core.subscription_utils import is_subscription_active
from apps.backend.ai_chatbot.services.plan_limits import get_org_retention_days
from apps.backend.ai_chatbot.services.lead_retention import purge_old_leads_for_org


class Command(BaseCommand):
    help = "Purge AI Chatbot enquiry leads based on plan chat history retention days."

    def handle(self, *args, **options):
        subs = (
            Subscription.objects
            .filter(status__in=("active", "trialing"), plan__product__slug="ai-chatbot")
            .select_related("organization")
            .order_by("-start_date")
        )
        seen_orgs = set()
        total_deleted = 0
        for sub in subs:
            if not is_subscription_active(sub):
                continue
            org = sub.organization
            if not org or org.id in seen_orgs:
                continue
            seen_orgs.add(org.id)
            retention_days = get_org_retention_days(org, default_days=30)
            deleted = purge_old_leads_for_org(org, retention_days)
            total_deleted += deleted
            self.stdout.write(
                f"Org {org.id} ({org.name}) retention={retention_days}d -> deleted {deleted}"
            )
        self.stdout.write(f"Total deleted: {total_deleted}")
