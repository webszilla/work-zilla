from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone

from core.email_utils import send_templated_email
from core.models import Organization, PendingTransfer, UserProfile
from saas_admin.models import MonitorOrgProductEntitlement, Product


def _sum_by_currency(queryset):
    rows = queryset.values("currency").annotate(total=Sum("amount")).order_by("currency")
    return {row["currency"] or "INR": float(row["total"] or 0) for row in rows}


def _format_currency_totals(totals):
    if not totals:
        return ["INR 0"]
    return [f"{currency} {amount:.2f}" for currency, amount in totals.items()]


class Command(BaseCommand):
    help = "Send weekly SaaS admin sales + signup report."

    def handle(self, *args, **options):
        india_tz = ZoneInfo("Asia/Kolkata")
        now = timezone.now().astimezone(india_tz)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)
        year_start = now - timedelta(days=365)

        recipients = set()
        superusers = User.objects.filter(is_superuser=True).exclude(email="").values_list("email", flat=True)
        recipients.update(superusers)
        saas_admins = (
            UserProfile.objects
            .filter(role__in=("superadmin", "super_admin"), user__email__isnull=False)
            .exclude(user__email="")
            .values_list("user__email", flat=True)
        )
        recipients.update(saas_admins)

        if not recipients:
            self.stdout.write("No SaaS admin recipients found.")
            return

        org_transfers = PendingTransfer.objects.filter(status="approved", organization__isnull=False)
        overall_sales = {
            "week": _sum_by_currency(org_transfers.filter(updated_at__gte=week_start)),
            "month": _sum_by_currency(org_transfers.filter(updated_at__gte=month_start)),
            "year": _sum_by_currency(org_transfers.filter(updated_at__gte=year_start)),
            "all_time": _sum_by_currency(org_transfers),
        }

        overall_signups = {
            "week": Organization.objects.filter(created_at__gte=week_start).count(),
            "month": Organization.objects.filter(created_at__gte=month_start).count(),
            "year": Organization.objects.filter(created_at__gte=year_start).count(),
            "all_time": Organization.objects.count(),
        }

        product_rows = []
        products = Product.objects.all().order_by("sort_order", "name")
        for product in products:
            org_ids = list(
                MonitorOrgProductEntitlement.objects
                .filter(product=product)
                .values_list("organization_id", flat=True)
            )
            product_transfers = org_transfers.filter(organization_id__in=org_ids)
            product_sales = {
                "week": _sum_by_currency(product_transfers.filter(updated_at__gte=week_start)),
                "month": _sum_by_currency(product_transfers.filter(updated_at__gte=month_start)),
                "year": _sum_by_currency(product_transfers.filter(updated_at__gte=year_start)),
                "all_time": _sum_by_currency(product_transfers),
            }
            entitlements = MonitorOrgProductEntitlement.objects.filter(product=product)
            product_signups = {
                "week": entitlements.filter(enabled_at__gte=week_start).count(),
                "month": entitlements.filter(enabled_at__gte=month_start).count(),
                "year": entitlements.filter(enabled_at__gte=year_start).count(),
                "all_time": entitlements.count(),
            }
            product_rows.append({
                "name": product.name,
                "sales": {key: _format_currency_totals(value) for key, value in product_sales.items()},
                "signups": product_signups,
            })

        context = {
            "generated_at": now.strftime("%Y-%m-%d %H:%M"),
            "overall_sales": {key: _format_currency_totals(value) for key, value in overall_sales.items()},
            "overall_signups": overall_signups,
            "products": product_rows,
        }

        send_templated_email(
            sorted(recipients),
            "Weekly SaaS Admin Report",
            "emails/saas_weekly_report.txt",
            context
        )
        self.stdout.write(f"Weekly report sent to {len(recipients)} recipients.")
