from datetime import datetime, timedelta
import re
from urllib.parse import urlencode

from django.utils import timezone
from zoneinfo import ZoneInfo
from core.models import PendingTransfer
from .models import Product


def _format_datetime(value):
    if not value:
        return ""
    dt = value
    if isinstance(dt, datetime):
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        dt = timezone.localtime(dt, ZoneInfo("Asia/Kolkata"))
    return dt.strftime("%Y-%m-%d %H:%M:%S") if hasattr(dt, "strftime") else ""


def _extract_reference_no(message):
    if not message:
        return ""
    match = re.search(r"Reference:\s*([A-Za-z0-9_\-/.]+)", str(message))
    return (match.group(1).strip() if match else "") or ""


def _resolve_payment_transfer(item):
    if not item or item.event_type != "payment_pending" or not item.organization_id:
        return None
    queryset = (
        PendingTransfer.objects
        .select_related("plan", "plan__product")
        .filter(organization_id=item.organization_id)
    )
    if item.product_slug:
        queryset = queryset.filter(plan__product__slug=item.product_slug)

    reference_no = _extract_reference_no(item.message)
    if reference_no:
        by_reference = queryset.filter(reference_no=reference_no).order_by("-created_at", "-id").first()
        if by_reference:
            return by_reference

    if item.created_at:
        window_start = item.created_at - timedelta(hours=6)
        window_end = item.created_at + timedelta(hours=6)
        by_window = (
            queryset
            .filter(created_at__gte=window_start, created_at__lte=window_end)
            .order_by("-created_at", "-id")
            .first()
        )
        if by_window:
            return by_window

    return queryset.order_by("-created_at", "-id").first()


def _resolve_saas_admin_product_slug(raw_slug):
    slug = str(raw_slug or "").strip().lower()
    if not slug:
        return ""
    aliases = {
        "online-storage": "storage",
        "worksuite": "monitor",
        "work-suite": "monitor",
    }
    candidates = [slug]
    mapped = aliases.get(slug)
    if mapped and mapped not in candidates:
        candidates.append(mapped)
    for candidate in candidates:
        if Product.objects.filter(slug=candidate).exists():
            return candidate
    return ""


def _humanize_product_slug(raw_slug):
    slug = str(raw_slug or "").strip().lower()
    if not slug:
        return ""
    label_map = {
        "monitor": "Monitor",
        "work-suite": "Work Suite",
        "worksuite": "Work Suite",
        "whatsapp-automation": "Whatsapp Automation",
        "ai-chatbot": "AI Chatbot",
        "storage": "Online Storage",
        "online-storage": "Online Storage",
        "business-autopilot-erp": "Business Autopilot ERP",
        "imposition-software": "Imposition Software",
    }
    if slug in label_map:
        return label_map[slug]
    return " ".join(part.capitalize() for part in slug.split("-") if part)


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
    transfer = _resolve_payment_transfer(item)
    transfer_product_slug = ""
    transfer_product_name = ""
    if transfer and transfer.plan and transfer.plan.product:
        transfer_product_slug = transfer.plan.product.slug or ""
        transfer_product_name = transfer.plan.product.name or ""
    product_slug = getattr(item, "product_slug", "") or transfer_product_slug or ""
    approval_product_slug = _resolve_saas_admin_product_slug(product_slug)
    product_name = transfer_product_name or _humanize_product_slug(product_slug)
    if approval_product_slug:
        approval_url = f"/saas-admin/products/{approval_product_slug}#pending-transfers"
    else:
        query = {"status": "pending"}
        if product_name:
            query["product"] = product_name
        approval_url = f"/saas-admin/billing?{urlencode(query)}#billing-activity"

    return {
        "id": item.id,
        "title": item.title,
        "message": item.message or "",
        "event_type": item.event_type,
        "audience": getattr(item, "audience", "saas_admin"),
        "channel": getattr(item, "channel", "system"),
        "product_slug": product_slug,
        "organization_id": item.organization_id,
        "organization_name": item.organization.name if item.organization else "",
        "org_admin_name": org_admin_name,
        "org_admin_email": org_admin_email,
        "created_at": _format_datetime(item.created_at),
        "is_read": bool(item.is_read),
        "is_payment_notification": item.event_type == "payment_pending",
        "transfer_id": transfer.id if transfer else None,
        "approval_status": transfer.status if transfer else "",
        "approval_url": approval_url,
    }
