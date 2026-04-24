from django.core.management.base import BaseCommand
from django.utils import timezone

from core.email_utils import send_templated_email
from core.models import EmailNotificationLog, Subscription
from core.subscription_utils import (
    get_effective_end_date,
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
        today = timezone.localdate()
        dry_run = options["dry_run"]
        send_reminders = not options["no_reminders"]

        expired_count = 0
        reminder_count = 0
        org_digest_count = 0

        subs = (
            Subscription.objects
            .filter(status__in=("active", "trialing", "expired"))
            .select_related("organization", "organization__owner", "user", "plan", "plan__product")
            .order_by("organization_id", "-end_date", "-id")
        )

        def _resolve_recipient(org, sub):
            owner = org.owner if org else None
            if owner and owner.email:
                return owner.email, (owner.first_name or owner.username or "User"), owner
            if sub and sub.user and sub.user.email:
                return sub.user.email, (sub.user.first_name or sub.user.username or "User"), sub.user
            return "", "User", None

        def _renew_url():
            # Keep as relative URL; frontend can resolve on same domain.
            return "/my-account/billing/renew/"

        def _product_label(sub):
            product = getattr(getattr(sub, "plan", None), "product", None)
            return str(getattr(product, "name", "") or getattr(product, "slug", "") or "Work Zilla").strip() or "Work Zilla"

        def _event_priority(item):
            kind = item.get("kind")
            days = int(item.get("days") or 0)
            if kind == "expired" and days == 0:
                return 0
            if kind == "expired" and days == 1:
                return 1
            if kind == "expired" and days == 7:
                return 2
            if kind == "expires_today":
                return 3
            if kind == "expiring":
                # Smaller days_left is higher priority.
                return 10 + max(days, 0)
            return 99

        by_org = {}
        for sub in subs:
            org = sub.organization
            if not org:
                continue
            by_org.setdefault(org.id, {"org": org, "subs": []})["subs"].append(sub)

        for org_id, bundle in by_org.items():
            org = bundle["org"]
            org_subs = bundle["subs"]

            digest_items = []
            for sub in org_subs:
                normalize_subscription_end_date(sub, now=now)
                effective_end = get_effective_end_date(sub, now=now) or sub.end_date
                end_date_value = effective_end.date() if effective_end else None

                if sub.status in ("active", "trialing"):
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
                        end_date_value = sub.end_date.date() if sub.end_date else end_date_value
                        if send_reminders and end_date_value:
                            digest_items.append(
                                {
                                    "kind": "expired",
                                    "days": 0,
                                    "product": _product_label(sub),
                                    "plan_name": sub.plan.name if sub.plan else "-",
                                    "billing_cycle": sub.billing_cycle or "monthly",
                                    "end_date": end_date_value.isoformat(),
                                    "status": "Expired",
                                }
                            )
                        continue

                    if not send_reminders or not end_date_value:
                        continue
                    days_left = (end_date_value - today).days
                    if days_left == 0:
                        digest_items.append(
                            {
                                "kind": "expires_today",
                                "days": 0,
                                "product": _product_label(sub),
                                "plan_name": sub.plan.name if sub.plan else "-",
                                "billing_cycle": sub.billing_cycle or "monthly",
                                "end_date": end_date_value.isoformat(),
                                "status": "Active",
                            }
                        )
                        continue
                    if days_left in {30, 14, 7, 3, 1}:
                        digest_items.append(
                            {
                                "kind": "expiring",
                                "days": days_left,
                                "product": _product_label(sub),
                                "plan_name": sub.plan.name if sub.plan else "-",
                                "billing_cycle": sub.billing_cycle or "monthly",
                                "end_date": end_date_value.isoformat(),
                                "status": "Active",
                            }
                        )
                    continue

                if sub.status == "expired":
                    if not send_reminders or not end_date_value:
                        continue
                    days_since = (today - end_date_value).days
                    if days_since in {0, 1, 7}:
                        digest_items.append(
                            {
                                "kind": "expired",
                                "days": days_since,
                                "product": _product_label(sub),
                                "plan_name": sub.plan.name if sub.plan else "-",
                                "billing_cycle": sub.billing_cycle or "monthly",
                                "end_date": end_date_value.isoformat(),
                                "status": "Expired",
                            }
                        )

            if not send_reminders or not digest_items:
                continue

            already_sent = EmailNotificationLog.objects.filter(
                organization=org,
                category="subscription",
                scheduled_for=today,
                status="sent",
            ).exists()
            if already_sent:
                continue

            digest_items.sort(key=_event_priority)
            top_item = digest_items[0]
            if top_item.get("kind") == "expired":
                subject = "Subscription Expired - Action Required" if int(top_item.get("days") or 0) == 0 else "Subscription Renewal Pending"
                template_name = "emails/subscription_expired.txt"
            elif top_item.get("kind") == "expires_today":
                subject = "Subscription Expires Today"
                template_name = "emails/subscription_expiring.txt"
            else:
                subject = "Subscription Expiring Soon"
                template_name = "emails/subscription_expiring.txt"

            recipient, recipient_name, recipient_user = _resolve_recipient(org, org_subs[0] if org_subs else None)
            if not recipient:
                continue

            log_row, created = EmailNotificationLog.objects.get_or_create(
                organization=org,
                category="subscription",
                event_key="subscription_digest",
                scheduled_for=today,
                defaults={
                    "to_email": recipient,
                    "status": "queued",
                    "subject": subject,
                    "template_name": template_name,
                    "user": recipient_user,
                    "subscription": org_subs[0] if org_subs else None,
                    "meta": {"items": digest_items},
                },
            )
            if not created and log_row.status == "sent":
                continue

            if not dry_run:
                try:
                    # Use existing templates, but pass extra fields so template can evolve.
                    sent_ok = send_templated_email(
                        recipient,
                        subject,
                        template_name,
                        {
                            "name": recipient_name or "User",
                            "plan_name": top_item.get("plan_name") or "-",
                            "billing_cycle": top_item.get("billing_cycle") or "monthly",
                            "end_date": top_item.get("end_date") or "-",
                            "days_left": int(top_item.get("days") or 0),
                            "renew_url": _renew_url(),
                            "items": digest_items,
                            "org_name": org.name if getattr(org, "name", "") else "Organization",
                        },
                    )
                    log_row.to_email = recipient
                    log_row.subject = subject
                    log_row.template_name = template_name
                    log_row.user = recipient_user
                    log_row.meta = {"items": digest_items}
                    if sent_ok:
                        log_row.status = "sent"
                        log_row.sent_at = now
                        org_digest_count += 1
                        reminder_count += 1
                    else:
                        log_row.status = "failed"
                        log_row.error_message = "send_failed"
                    log_row.save(update_fields=["to_email", "subject", "template_name", "user", "meta", "status", "sent_at", "error_message"])
                except Exception as exc:
                    log_row.status = "failed"
                    log_row.error_message = str(exc)[:8000]
                    log_row.save(update_fields=["status", "error_message"])
            else:
                reminder_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Expired: {expired_count}, reminders: {reminder_count}, digests: {org_digest_count}, dry_run={dry_run}"
            )
        )
