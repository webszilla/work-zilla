from datetime import datetime, timedelta
import re
from urllib.parse import urlencode

from django.db import models
from django.utils import timezone
from zoneinfo import ZoneInfo
from core.models import PendingTransfer


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


def _extract_product_name_from_message(message):
    if not message:
        return ""
    match = re.search(r"submitted a bank transfer for\s+(.+?)\s*\(", str(message), flags=re.IGNORECASE)
    return (match.group(1).strip() if match else "") or ""


def _resolve_payment_transfer(item):
    if not item or item.event_type != "payment_pending" or not item.organization_id:
        return None
    queryset = (
        PendingTransfer.objects
        .select_related("plan", "plan__product")
        .filter(organization_id=item.organization_id)
    )
    raw_slug = str(getattr(item, "product_slug", "") or "").strip().lower()
    if raw_slug:
        if raw_slug in {"monitor", "worksuite", "work-suite"}:
            queryset = queryset.filter(
                (
                    models.Q(plan__product__slug="monitor")
                    | models.Q(plan__product__slug="worksuite")
                    | models.Q(plan__product__slug="work-suite")
                    | models.Q(plan__product__isnull=True)
                )
            )
        elif raw_slug in {"storage", "online-storage"}:
            queryset = queryset.filter(plan__product__slug__in=["storage", "online-storage"])
        else:
            queryset = queryset.filter(plan__product__slug=raw_slug)

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
    if slug in {"monitor", "worksuite", "work-suite"}:
        return "work-suite"
    if slug in {"online-storage", "storage"}:
        return "storage"
    return slug


def _resolve_saas_admin_product_slug_from_name(raw_name):
    name = str(raw_name or "").strip().lower()
    if not name:
        return ""
    if name in {"work suite", "monitor"}:
        return "work-suite"
    if name in {"online storage", "storage"}:
        return "storage"
    return ""


def _humanize_product_slug(raw_slug):
    slug = str(raw_slug or "").strip().lower()
    if not slug:
        return ""
    label_map = {
        "monitor": "Work Suite",
        "work-suite": "Work Suite",
        "worksuite": "Work Suite",
        "whatsapp-automation": "Whatsapp Automation",
        "ai-chatbot": "AI Chatbot",
        "storage": "Online Storage",
        "online-storage": "Online Storage",
        "business-autopilot-erp": "Business Autopilot",
        "imposition-software": "Print Marks",
    }
    if slug in label_map:
        return label_map[slug]
    return " ".join(part.capitalize() for part in slug.split("-") if part)


def _canonical_product_name(raw_name, raw_slug):
    slug = str(raw_slug or "").strip().lower()
    name = str(raw_name or "").strip()
    if slug in {"monitor", "worksuite", "work-suite"}:
        return "Work Suite"
    if name.lower() == "monitor":
        return "Work Suite"
    return name or _humanize_product_slug(slug) or "Product"


def _normalized_payment_message(item, transfer, product_name):
    if not item or item.event_type != "payment_pending" or not transfer:
        return item.message or ""
    org = transfer.organization or getattr(item, "organization", None)
    org_name = getattr(org, "name", "") or "Unknown org"
    plan_name = transfer.plan.name if transfer.plan else "Plan"
    currency = transfer.currency or "INR"
    amount = transfer.amount if transfer.amount is not None else 0
    details = f"{org_name} submitted a bank transfer for {product_name} ({plan_name}). Amount {currency} {amount}."
    submitter = getattr(transfer, "user", None)
    submitter_name = (
        f"{getattr(submitter, 'first_name', '')} {getattr(submitter, 'last_name', '')}".strip()
        or getattr(submitter, "username", "")
        or getattr(submitter, "email", "")
        or ""
    )
    if submitter_name:
        details = f"{details} Submitted by: {submitter_name}."
    org_owner = getattr(org, "owner", None)
    org_admin_name = (
        f"{getattr(org_owner, 'first_name', '')} {getattr(org_owner, 'last_name', '')}".strip()
        or getattr(org_owner, "username", "")
        or getattr(org_owner, "email", "")
        or ""
    )
    if org_admin_name:
        details = f"{details} Org Admin: {org_admin_name}."
    reference_no = transfer.reference_no or _extract_reference_no(item.message)
    if reference_no:
        details = f"{details} Reference: {reference_no}."
    return details


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
    fallback_product_name = transfer_product_name or _extract_product_name_from_message(getattr(item, "message", ""))
    approval_product_slug = _resolve_saas_admin_product_slug(product_slug)
    product_name = _canonical_product_name(fallback_product_name, product_slug)
    if not approval_product_slug:
        approval_product_slug = _resolve_saas_admin_product_slug_from_name(product_name)
    if approval_product_slug:
        approval_url = f"/saas-admin/products/{approval_product_slug}#pending-transfers"
    else:
        query = {"status": "pending"}
        if product_name:
            query["product"] = product_name
        approval_url = f"/saas-admin/billing?{urlencode(query)}#billing-activity"
    message = _normalized_payment_message(item, transfer, product_name)

    return {
        "id": item.id,
        "title": item.title,
        "message": message,
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
