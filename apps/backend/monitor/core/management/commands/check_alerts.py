from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.db.models import Sum
from django.template.loader import render_to_string
from django.utils import timezone

from core.models import AlertRule, EventMetric


class Command(BaseCommand):
    help = "Evaluate alert rules and send spike notifications."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Only print alerts, do not send emails.")

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)
        now = timezone.now()

        for rule in AlertRule.objects.filter(is_enabled=True).order_by("id"):
            window_minutes = max(1, int(rule.window_minutes or 60))
            cooldown_minutes = max(1, int(rule.cooldown_minutes or 60))
            window_start = now - timedelta(minutes=window_minutes)

            if rule.last_alerted_at:
                since = now - rule.last_alerted_at
                if since.total_seconds() < cooldown_minutes * 60:
                    continue

            metrics = EventMetric.objects.filter(
                event_type=rule.event_type,
                date__gte=window_start.date(),
                date__lte=now.date(),
            )
            if rule.organization_id:
                metrics = metrics.filter(organization_id=rule.organization_id)
            if rule.product_slug:
                metrics = metrics.filter(product_slug=rule.product_slug)

            count = metrics.aggregate(total=Sum("count")).get("total") or 0
            if count < int(rule.threshold_count or 0):
                continue

            recipients = _resolve_recipients(rule)
            if not recipients:
                self.stdout.write(self.style.WARNING(f"No recipients for rule {rule.id}"))
                continue

            context = {
                "rule": rule,
                "count": count,
                "window_minutes": window_minutes,
                "window_start": window_start,
                "window_end": now,
                "org_name": rule.organization.name if rule.organization else "All organizations",
                "product_slug": rule.product_slug or "all",
            }

            if dry_run:
                self.stdout.write(self.style.WARNING(
                    f"[DRY RUN] Alert: {rule.name} count={count} recipients={recipients}"
                ))
            else:
                body = render_to_string("emails/alert_event_spike.txt", context)
                send_mail(
                    subject=f"[Work Zilla Alert] {rule.name}",
                    message=body,
                    from_email=settings.ALERT_EMAIL_FROM,
                    recipient_list=recipients,
                    fail_silently=False,
                )
                rule.last_alerted_at = now
                rule.save(update_fields=["last_alerted_at"])
                self.stdout.write(self.style.SUCCESS(
                    f"Alert sent: {rule.name} count={count}"
                ))


def _resolve_recipients(rule):
    emails = []
    if rule.emails:
        emails.extend([e.strip() for e in rule.emails.split(",") if e.strip()])
    defaults = getattr(settings, "ALERT_EMAIL_TO_DEFAULT", None) or []
    emails.extend(defaults)
    return sorted(set(emails))
