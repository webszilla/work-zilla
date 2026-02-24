from collections import defaultdict
from datetime import timedelta

from django.db.models import Sum, Count
from django.utils import timezone

from core.models import EventMetric, Organization, PendingTransfer
from .models import Product


def build_observability_summary(days=7, org_id=None, product_slug=None):
    days = max(1, min(int(days or 7), 60))
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days - 1)

    metrics = EventMetric.objects.filter(date__gte=start_date, date__lte=end_date)
    if org_id:
        metrics = metrics.filter(organization_id=org_id)
    if product_slug:
        metrics = metrics.filter(product_slug=product_slug)

    series_qs = (
        metrics.values("date", "event_type")
        .annotate(count=Sum("count"))
        .order_by("date", "event_type")
    )
    totals = defaultdict(int)
    by_day_map = {}
    series_map = defaultdict(int)
    for row in series_qs:
        date_str = row["date"].strftime("%Y-%m-%d")
        event_key = row["event_type"].split(":", 1)[0]
        count = int(row["count"] or 0)
        totals[event_key] += count
        series_map[(date_str, event_key)] += count
        day_counts = by_day_map.setdefault(date_str, {})
        day_counts[event_key] = day_counts.get(event_key, 0) + count

    event_types = sorted(totals.keys())
    series = [
        {"date": date_str, "event_type": event_type, "count": count}
        for (date_str, event_type), count in sorted(series_map.items())
    ]
    by_day = []
    for offset in range(days):
        current_date = start_date + timedelta(days=offset)
        date_str = current_date.strftime("%Y-%m-%d")
        counts = by_day_map.get(date_str, {})
        if event_types:
            counts = {event_type: counts.get(event_type, 0) for event_type in event_types}
        by_day.append({"date": date_str, "counts": counts})

    transfers = PendingTransfer.objects.filter(status="pending")
    if org_id:
        transfers = transfers.filter(organization_id=org_id)
    if product_slug:
        transfers = transfers.filter(plan__product__slug=product_slug)
    pending_transfers = (
        transfers
        .filter(organization__isnull=False)
        .values("organization_id", "organization__name")
        .annotate(count=Count("id"))
        .order_by("-count", "organization__name")[:20]
    )
    pending_payload = [
        {
            "org_id": row["organization_id"],
            "org_name": row["organization__name"] or "-",
            "count": row["count"],
        }
        for row in pending_transfers
    ]

    orgs = list(
        Organization.objects
        .order_by("name")
        .values("id", "name")
    )
    products = list(
        Product.objects.filter(status="active").values_list("slug", flat=True)
    )

    return {
        "days": days,
        "filters": {
            "org_id": org_id,
            "product": product_slug,
        },
        "orgs": orgs,
        "products": products,
        "totals": dict(totals),
        "series": series,
        "by_day": by_day,
        "pending_transfers": pending_payload,
    }
