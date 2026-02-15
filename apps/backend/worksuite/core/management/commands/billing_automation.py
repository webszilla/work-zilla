from django.core.management.base import BaseCommand
from django.utils import timezone

from core.email_utils import send_templated_email
from core.models import Subscription
from core.subscription_utils import (
    is_subscription_active,
    maybe_expire_subscription,
    normalize_subscription_end_date,
)
from core.observability import log_event


class Command(BaseCommand):
    help = "Expire subscriptions and send renewal reminders."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print actions without saving.")
        parser.add_argument("--no-reminders", action="store_true", help="Skip renewal reminder emails.")

    def handle(self, *args, **options):
        now = timezone.now()
        dry_run = options["dry_run"]
        send_reminders = not options["no_reminders"]

        expired_count = 0
        reminder_count = 0

        subs = (
            Subscription.objects
            .filter(status="active")
            .select_related("organization", "user", "plan")
        )

        for sub in subs:
            normalize_subscription_end_date(sub, now=now)
            if not is_subscription_active(sub, now=now):
                if not dry_run:
                    maybe_expire_subscription(sub, now=now)
                    log_event(
                        "subscription_expired",
                        status="expired",
                        org=sub.organization,
                        user=sub.user,
                        product_slug=getattr(getattr(sub.plan, "product", None), "slug", ""),
                        meta={
                            "subscription_id": sub.id,
                            "plan_id": sub.plan_id,
                            "billing_cycle": sub.billing_cycle,
                            "end_date": sub.end_date.isoformat() if sub.end_date else None,
                        },
                    )
                expired_count += 1
                continue

            if not send_reminders or not sub.end_date:
                continue

            remaining_days = (sub.end_date - now).total_seconds() / 86400
            days_left = max(int(round(remaining_days)), 0)
            reminder_days = {7, 3, 2, 1}
            if days_left not in reminder_days:
                continue

            if sub.last_renewal_reminder_at:
                since_last = (now - sub.last_renewal_reminder_at).total_seconds() / 86400
                if since_last < 1:
                    continue

            owner = sub.organization.owner if sub.organization else None
            recipient = owner.email if owner else (sub.user.email if sub.user else "")
            recipient_name = owner.first_name if owner else (sub.user.first_name if sub.user else "")
            if not recipient:
                continue

            if not dry_run:
                send_templated_email(
                    recipient,
                    "Subscription Expiring Soon",
                    "emails/subscription_expiring.txt",
                    {
                        "name": recipient_name or "User",
                        "plan_name": sub.plan.name if sub.plan else "-",
                        "billing_cycle": sub.billing_cycle or "monthly",
                        "end_date": sub.end_date.strftime("%Y-%m-%d"),
                        "days_left": days_left,
                    },
                )
                sub.last_renewal_reminder_at = now
                sub.save(update_fields=["last_renewal_reminder_at"])
                log_event(
                    "renewal_reminder_sent",
                    status="success",
                    org=sub.organization,
                    user=sub.user,
                    product_slug=getattr(getattr(sub.plan, "product", None), "slug", ""),
                    meta={
                        "subscription_id": sub.id,
                        "plan_id": sub.plan_id,
                        "billing_cycle": sub.billing_cycle,
                        "end_date": sub.end_date.isoformat() if sub.end_date else None,
                    },
                )
            reminder_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Expired: {expired_count}, reminders: {reminder_count}, dry_run={dry_run}"
            )
        )
