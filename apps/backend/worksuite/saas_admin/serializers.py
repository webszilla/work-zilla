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
    org_owner = item.organization.owner if item.organization and getattr(item.organization, "owner", None) else None
    org_admin_name = ""
    org_admin_email = ""
    if org_owner:
        org_admin_name = (
            f"{getattr(org_owner, 'first_name', '')} {getattr(org_owner, 'last_name', '')}".strip()
            or getattr(org_owner, "username", "")
            or ""
        )
        org_admin_email = getattr(org_owner, "email", "") or ""
    return {
        "id": item.id,
        "title": item.title,
        "message": item.message or "",
        "event_type": item.event_type,
        "audience": getattr(item, "audience", "saas_admin"),
        "channel": getattr(item, "channel", "system"),
        "product_slug": getattr(item, "product_slug", "") or "",
        "organization_id": item.organization_id,
        "organization_name": item.organization.name if item.organization else "",
        "org_admin_name": org_admin_name,
        "org_admin_email": org_admin_email,
        "created_at": _format_datetime(item.created_at),
        "is_read": bool(item.is_read),
    }
