from datetime import datetime

from django.utils import timezone
from zoneinfo import ZoneInfo


def _format_datetime(value):
    if not value:
        return ""
    dt = value
    if isinstance(dt, datetime):
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        dt = timezone.localtime(dt, ZoneInfo("Asia/Kolkata"))
    return dt.strftime("%Y-%m-%d %H:%M:%S") if hasattr(dt, "strftime") else ""


def serialize_notification(item):
    return {
        "id": item.id,
        "title": item.title,
        "message": item.message or "",
        "event_type": item.event_type,
        "organization_id": item.organization_id,
        "organization_name": item.organization.name if item.organization else "",
        "created_at": _format_datetime(item.created_at),
        "is_read": bool(item.is_read),
    }
