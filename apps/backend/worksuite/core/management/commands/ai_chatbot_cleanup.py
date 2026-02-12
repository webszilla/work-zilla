from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from core.models import ChatConversation, ChatMessage, Subscription


class Command(BaseCommand):
    help = "Clean up AI Chatbot chat history based on plan limits."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Show counts without deleting.")

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        subs = (
            Subscription.objects
            .filter(plan__product__slug="ai-chatbot", status__in=("active", "trialing"))
            .select_related("plan", "organization")
            .order_by("organization_id", "-start_date")
        )
        seen_orgs = set()
        total_messages = 0
        total_conversations = 0
        for sub in subs:
            org = sub.organization
            if not org or org.id in seen_orgs:
                continue
            seen_orgs.add(org.id)
            limits = sub.plan.limits or {}
            retention_days = limits.get("chat_history_days") or 30
            try:
                retention_days = int(retention_days)
            except (TypeError, ValueError):
                retention_days = 30
            if retention_days <= 0:
                continue
            cutoff = timezone.now() - timedelta(days=retention_days)
            msg_qs = ChatMessage.objects.filter(
                conversation__organization=org,
                created_at__lt=cutoff,
            )
            msg_count = msg_qs.count()
            conv_qs = ChatConversation.objects.filter(
                organization=org,
            ).filter(
                Q(last_message_at__lt=cutoff) | Q(last_message_at__isnull=True)
            )
            conv_count = conv_qs.count()
            total_messages += msg_count
            total_conversations += conv_count

            if dry_run:
                self.stdout.write(
                    f"[DRY-RUN] Org {org.id} ({org.name}): {msg_count} messages, {conv_count} conversations"
                )
                continue

            if msg_count:
                msg_qs.delete()
            if conv_count:
                conv_qs.delete()
            self.stdout.write(
                f"Org {org.id} ({org.name}): deleted {msg_count} messages, {conv_count} conversations"
            )

        if dry_run:
            self.stdout.write(
                f"[DRY-RUN] Total: {total_messages} messages, {total_conversations} conversations"
            )
        else:
            self.stdout.write(
                f"Total deleted: {total_messages} messages, {total_conversations} conversations"
            )
