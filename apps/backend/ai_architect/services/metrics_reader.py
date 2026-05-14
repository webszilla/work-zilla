from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

try:
    # Worksuite core app exposes PendingTransfer.
    from core.models import PendingTransfer
except Exception:  # pragma: no cover
    PendingTransfer = None


def get_saas_admin_metrics_summary() -> dict:
    """
    Returns aggregate-only metrics for SaaS Admin questions (no PII).
    Safe to include in AI context.
    """
    if PendingTransfer is None:
        return {"available": False, "reason": "PendingTransfer model not available"}

    now = timezone.localtime(timezone.now())
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)

    month_qs = PendingTransfer.objects.filter(
        status="approved",
        paid_on__gte=month_start.date(),
        paid_on__lt=month_end.date(),
    )
    today_qs = PendingTransfer.objects.filter(
        status="approved",
        paid_on__gte=today_start.date(),
        paid_on__lt=tomorrow_start.date(),
    )

    # Avoid importing Django aggregates via timezone.models; instead compute with ORM in a minimal way.
    # Use lightweight Python aggregation over query values (aggregate-only, no PII).
    month_by = {}
    for row in month_qs.values("currency", "amount"):
        currency = str(row.get("currency") or "INR").upper()
        month_by[currency] = month_by.get(currency, 0.0) + float(row.get("amount") or 0)

    today_by = {}
    for row in today_qs.values("currency", "amount"):
        currency = str(row.get("currency") or "INR").upper()
        today_by[currency] = today_by.get(currency, 0.0) + float(row.get("amount") or 0)

    return {
        "available": True,
        "range": {
            "month_start": month_start.date().isoformat(),
            "month_end": (month_end.date() - timedelta(days=1)).isoformat(),
            "today": today_start.date().isoformat(),
        },
        "this_month_sales_by_currency": {k: round(v, 2) for k, v in month_by.items()},
        "today_sales_by_currency": {k: round(v, 2) for k, v in today_by.items()},
        "notes": "Sales computed from approved PendingTransfer rows using paid_on date.",
    }
