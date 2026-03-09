import json
import re
import html
import csv
import io
import base64
import uuid
import mimetypes
import os
from datetime import timedelta

from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.db import DatabaseError
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse, HttpResponseForbidden, JsonResponse
from django.core.files.base import ContentFile
from django.utils.text import slugify
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from dashboard import views as dashboard_views
from core.models import AdminNotification, Subscription, ThemeSettings, UserProfile
from apps.backend.storage.models import StorageFile, StorageFolder
from apps.backend.storage.storage_backend import (
    build_storage_key,
    storage_delete,
    storage_save,
    storage_url,
)

from .models import (
    AutomationRule,
    CatalogueCategory,
    CataloguePage,
    CatalogueProduct,
    CompanyProfile,
    DigitalCard,
    DigitalCardEntry,
    DigitalCardEnquiry,
    DigitalCardFeedback,
    DigitalCardVisit,
    MarketingCampaign,
    MarketingCampaignDelivery,
    MarketingContact,
    WhatsappSettings,
)
from apps.backend.common_auth.utils.whatsapp import send_whatsapp_message


def _get_org(request):
    return dashboard_views.get_active_org(request)


def _cleanup_old_digital_card_visits(org):
    cutoff = timezone.now() - timedelta(days=365)
    DigitalCardVisit.objects.filter(organization=org, visited_at__lt=cutoff).delete()


def _cleanup_old_feedback_enquiries(org):
    cutoff = timezone.now() - timedelta(days=365)
    DigitalCardFeedback.objects.filter(organization=org, created_at__lt=cutoff).delete()
    DigitalCardEnquiry.objects.filter(organization=org, created_at__lt=cutoff).delete()


def _is_org_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    if not profile:
        return False
    return profile.role in ("company_admin", "superadmin", "super_admin")


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return None


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y", "on"}:
        return True
    if text in {"false", "0", "no", "n", "off", ""}:
        return False
    return default


def _normalize_whatsapp_text(value):
    text = str(value or "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _html_to_whatsapp_text(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    text = re.sub(r"<\s*(script|style)\b[^>]*>.*?<\s*/\s*\1\s*>", "", raw, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<\s*br\s*/?\s*>", "\n", text, flags=re.IGNORECASE)
    # Some contenteditable outputs keep the first line as plain text and wrap next lines in <div>/<p>.
    # Converting opening block tags to newlines preserves Enter-based line breaks consistently.
    text = re.sub(r"<\s*(p|div|section|article|h[1-6]|pre)\b[^>]*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*(p|div|section|article|h[1-6]|pre)\s*>", "", text, flags=re.IGNORECASE)

    text = re.sub(
        r"<\s*a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)<\s*/\s*a\s*>",
        lambda match: f"{_normalize_whatsapp_text(re.sub(r'<[^>]+>', '', match.group(2)))} ({match.group(1).strip()})",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"<\s*(strong|b)\b[^>]*>(.*?)<\s*/\s*(strong|b)\s*>",
        lambda match: f"*{_normalize_whatsapp_text(re.sub(r'<[^>]+>', '', match.group(2)))}*",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"<\s*(em|i)\b[^>]*>(.*?)<\s*/\s*(em|i)\s*>",
        lambda match: f"_{_normalize_whatsapp_text(re.sub(r'<[^>]+>', '', match.group(2)))}_",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"<\s*(del|strike|s)\b[^>]*>(.*?)<\s*/\s*(del|strike|s)\s*>",
        lambda match: f"~{_normalize_whatsapp_text(re.sub(r'<[^>]+>', '', match.group(2)))}~",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(
        r"<\s*code\b[^>]*>(.*?)<\s*/\s*code\s*>",
        lambda match: f"`{_normalize_whatsapp_text(re.sub(r'<[^>]+>', '', match.group(1)))}`",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(r"<\s*li\b[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/\s*li\s*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return _normalize_whatsapp_text(text)


def _save_company_logo_from_data_url(profile, data_url):
    raw = str(data_url or "").strip()
    if not raw:
        return
    if not raw.startswith("data:") or ";base64," not in raw:
        raise ValueError("invalid_logo_data")
    header, b64_data = raw.split(",", 1)
    mime_part = header[5:].split(";", 1)[0].strip().lower()
    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/svg+xml": "svg",
    }
    ext = ext_map.get(mime_part)
    if not ext:
        raise ValueError("unsupported_logo_type")
    try:
        file_bytes = base64.b64decode(b64_data, validate=True)
    except Exception as exc:
        raise ValueError("invalid_logo_data") from exc
    if len(file_bytes) > 500 * 1024:
        raise ValueError("logo_too_large")
    filename = f"company-logo-{uuid.uuid4().hex[:12]}.{ext}"
    profile.logo.save(filename, ContentFile(file_bytes), save=False)


def _ensure_storage_root_folder(org, owner):
    folder = StorageFolder.objects.filter(
        organization=org,
        owner=owner,
        parent__isnull=True,
        is_deleted=False,
    ).first()
    if folder:
        return folder
    return StorageFolder.objects.create(
        organization=org,
        parent=None,
        name="Root",
        owner=owner,
        created_by=owner,
        is_deleted=False,
    )


def _delete_object_storage_asset(org, storage_key):
    key = str(storage_key or "").strip()
    if not key:
        return
    storage_delete(key)
    StorageFile.objects.filter(organization=org, storage_key=key).delete()


def _parse_image_data_url(data_url, *, max_bytes, field_name):
    raw = str(data_url or "").strip()
    if not raw:
        return None
    if not raw.startswith("data:") or ";base64," not in raw:
        raise ValueError(f"invalid_{field_name}_data")
    header, b64_data = raw.split(",", 1)
    mime_part = header[5:].split(";", 1)[0].strip().lower()
    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/svg+xml": "svg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
    }
    ext = ext_map.get(mime_part)
    if not ext:
        raise ValueError(f"unsupported_{field_name}_type")
    try:
        file_bytes = base64.b64decode(b64_data, validate=True)
    except Exception as exc:
        raise ValueError(f"invalid_{field_name}_data") from exc
    if len(file_bytes) > max_bytes:
        raise ValueError(f"{field_name}_too_large")
    return {
        "bytes": file_bytes,
        "mime": mime_part,
        "ext": ext,
    }


def _save_card_asset_to_object_storage(*, org, owner, data_url, field_name, filename_prefix, max_bytes):
    parsed = _parse_image_data_url(data_url, max_bytes=max_bytes, field_name=field_name)
    if not parsed:
        return None
    filename = f"{filename_prefix}-{uuid.uuid4().hex[:12]}.{parsed['ext']}"
    storage_key = build_storage_key(
        org,
        owner,
        root_folder_name="digital-card",
        original_filename=filename,
    )
    content = ContentFile(parsed["bytes"], name=filename)
    storage_save(storage_key, content)
    folder = _ensure_storage_root_folder(org, owner)
    StorageFile.objects.create(
        organization=org,
        folder=folder,
        owner=owner,
        original_filename=filename,
        storage_key=storage_key,
        size_bytes=len(parsed["bytes"]),
        content_type=parsed["mime"],
    )
    return {
        "storage_key": storage_key,
        "url": storage_url(storage_key),
    }


def _resolve_card_asset_url(storage_key, fallback_value=""):
    key = str(storage_key or "").strip()
    if key:
        url = storage_url(key)
        if url:
            return url
    return str(fallback_value or "").strip()


def _normalize_social_links_items(raw):
    items = []
    if isinstance(raw, dict):
        raw_items = raw.get("items")
        if isinstance(raw_items, list):
            source = raw_items
        else:
            # legacy format: {"instagram": "https://..."}
            source = [{"label": key, "icon": key, "url": value} for key, value in raw.items() if isinstance(value, str)]
    elif isinstance(raw, list):
        source = raw
    else:
        source = []

    for entry in source:
        if not isinstance(entry, dict):
            continue
        url = str(entry.get("url") or "").strip()
        if not url:
            continue
        item_type = str(entry.get("type") or "preset").strip().lower()
        if item_type not in ("preset", "custom"):
            item_type = "preset"
        icon = str(entry.get("icon") or "").strip().lower()
        label = str(entry.get("label") or icon or "Link").strip()
        custom_icon_data = str(entry.get("custom_icon_data") or "").strip()
        custom_icon_mime = str(entry.get("custom_icon_mime") or "").strip()
        try:
            icon_size = int(entry.get("icon_size") or 20)
        except (TypeError, ValueError):
            icon_size = 20
        icon_size = max(12, min(64, icon_size))
        item = {
            "type": item_type,
            "label": label,
            "icon": icon or label.lower().replace(" ", "-"),
            "url": url,
            "icon_size": icon_size,
        }
        if item_type == "custom":
            if custom_icon_data:
                item["custom_icon_data"] = custom_icon_data
            if custom_icon_mime:
                item["custom_icon_mime"] = custom_icon_mime
        items.append(item)
    return items


def _serialize_social_links(raw):
    items = _normalize_social_links_items(raw)
    return {
        "items": items,
    }


def _company_payload(obj):
    digital_card = DigitalCard.objects.filter(company_profile=obj).first()
    catalogue_page = CataloguePage.objects.filter(company_profile=obj).first()
    product_highlights = obj.product_highlights or []
    return {
        "company_name": obj.company_name or "",
        "logo_url": obj.logo.url if obj.logo else "",
        "phone": obj.phone or "",
        "whatsapp_number": obj.whatsapp_number or "",
        "email": obj.email or "",
        "website": obj.website or "",
        "address": obj.address or "",
        "country": obj.country or "",
        "state": obj.state or "",
        "postal_code": obj.postal_code or "",
        "description": obj.description or "",
        "social_links": _serialize_social_links(obj.social_links or {}),
        "social_links_items": _normalize_social_links_items(obj.social_links or {}),
        "theme_color": obj.theme_color or "#22c55e",
        "product_highlights": product_highlights if isinstance(product_highlights, list) else [],
        "product_highlights_html": product_highlights if isinstance(product_highlights, str) else "",
        "digital_card_slug": digital_card.public_slug if digital_card else "",
        "catalogue_slug": catalogue_page.public_slug if catalogue_page else "",
        "digital_card_url": f"/card/{digital_card.public_slug}/" if digital_card else "",
        "catalogue_url": f"/catalogue/{catalogue_page.public_slug}/" if catalogue_page else "",
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
    }


def _settings_payload(obj, company_profile=None):
    welcome = (obj.welcome_message or "").strip()
    if not welcome and company_profile and company_profile.company_name:
        welcome = (
            f"Hi 👋 Welcome to {company_profile.company_name}.\n"
            "Reply:\n1 - View Products\n2 - Price Details\n3 - Contact Support"
        )
    return {
        "auto_reply_enabled": bool(obj.auto_reply_enabled),
        "welcome_message": welcome
        or "Hi 👋 Welcome to our business.\nReply:\n1 - View Products\n2 - Price Details\n3 - Contact Support",
    }


def _rule_payload(obj):
    return {
        "id": obj.id,
        "keyword": obj.keyword or "",
        "reply_message": obj.reply_message or "",
        "is_default": bool(obj.is_default),
        "sort_order": obj.sort_order or 0,
        "is_active": bool(obj.is_active),
    }


def _normalize_phone_number(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) < 8 or len(digits) > 15:
        return ""
    return digits


def _contact_payload(obj):
    return {
        "id": obj.id,
        "name": obj.name or "",
        "phone_number": obj.phone_number or "",
        "email": obj.email or "",
        "tags": obj.tags or "",
        "is_opted_in": bool(obj.is_opted_in),
        "has_opted_out": bool(obj.has_opted_out),
        "opt_in_source": obj.opt_in_source or "",
        "consent_note": obj.consent_note or "",
        "opt_in_at": obj.opt_in_at.isoformat() if obj.opt_in_at else "",
        "opted_out_at": obj.opted_out_at.isoformat() if obj.opted_out_at else "",
        "last_message_at": obj.last_message_at.isoformat() if obj.last_message_at else "",
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
    }


def _campaign_payload(obj):
    return {
        "id": obj.id,
        "name": obj.name or "",
        "template_name": obj.template_name or "",
        "template_variables": obj.template_variables or [],
        "status": obj.status or MarketingCampaign.STATUS_DRAFT,
        "total_contacts": int(obj.total_contacts or 0),
        "sent_count": int(obj.sent_count or 0),
        "failed_count": int(obj.failed_count or 0),
        "skipped_count": int(obj.skipped_count or 0),
        "compliance_note": obj.compliance_note or "",
        "created_at": obj.created_at.isoformat() if obj.created_at else "",
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
    }


def _delivery_payload(obj):
    return {
        "id": obj.id,
        "campaign_id": obj.campaign_id,
        "contact_id": obj.contact_id,
        "phone_number": obj.phone_number or "",
        "status": obj.status or "",
        "error_code": obj.error_code or "",
        "error_message": obj.error_message or "",
        "attempted_at": obj.attempted_at.isoformat() if obj.attempted_at else "",
    }


def _parse_template_variables(raw):
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str):
        parts = [part.strip() for part in raw.split(",")]
        return [part for part in parts if part]
    return []


def _is_valid_template_name(value):
    text = str(value or "").strip()
    if not text:
        return False
    return bool(re.fullmatch(r"[a-z0-9_]{3,180}", text))


def _failure_rate_guard(org):
    window_since = timezone.now() - timedelta(days=7)
    qs = MarketingCampaignDelivery.objects.filter(organization=org, attempted_at__gte=window_since)
    total = qs.count()
    if total < 20:
        return True, 0.0
    failed = qs.filter(status=MarketingCampaignDelivery.STATUS_FAILED).count()
    ratio = failed / float(total or 1)
    return ratio <= 0.20, ratio


def _campaign_send_to_contacts(campaign, contacts):
    sent = 0
    failed = 0
    skipped = 0
    for contact in contacts:
        phone = _normalize_phone_number(contact.phone_number)
        if not phone:
            MarketingCampaignDelivery.objects.create(
                campaign=campaign,
                organization=campaign.organization,
                contact=contact,
                phone_number=contact.phone_number or "",
                status=MarketingCampaignDelivery.STATUS_SKIPPED,
                error_code="invalid_number",
                error_message="Invalid phone number format.",
            )
            skipped += 1
            continue
        if not contact.is_opted_in or contact.has_opted_out:
            MarketingCampaignDelivery.objects.create(
                campaign=campaign,
                organization=campaign.organization,
                contact=contact,
                phone_number=phone,
                status=MarketingCampaignDelivery.STATUS_SKIPPED,
                error_code="consent_required",
                error_message="Contact is not eligible (opt-in required / opted-out).",
            )
            skipped += 1
            continue
        ok = send_whatsapp_message(
            to=phone,
            template_name=campaign.template_name,
            variables=campaign.template_variables or [],
        )
        if ok:
            MarketingCampaignDelivery.objects.create(
                campaign=campaign,
                organization=campaign.organization,
                contact=contact,
                phone_number=phone,
                status=MarketingCampaignDelivery.STATUS_SENT,
            )
            contact.last_message_at = timezone.now()
            contact.save(update_fields=["last_message_at", "updated_at"])
            sent += 1
        else:
            MarketingCampaignDelivery.objects.create(
                campaign=campaign,
                organization=campaign.organization,
                contact=contact,
                phone_number=phone,
                status=MarketingCampaignDelivery.STATUS_FAILED,
                error_code="provider_send_failed",
                error_message="WhatsApp template send failed.",
            )
            failed += 1
    campaign.total_contacts = len(contacts)
    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.skipped_count = skipped
    if failed and sent:
        campaign.status = MarketingCampaign.STATUS_PARTIAL
    elif failed and not sent:
        campaign.status = MarketingCampaign.STATUS_FAILED
    elif sent and not failed:
        campaign.status = MarketingCampaign.STATUS_SENT
    else:
        campaign.status = MarketingCampaign.STATUS_BLOCKED
    campaign.save(update_fields=[
        "total_contacts",
        "sent_count",
        "failed_count",
        "skipped_count",
        "status",
        "updated_at",
    ])


def _catalogue_payload(obj):
    return {
        "id": obj.id,
        "title": obj.title,
        "image_url": obj.image.url if obj.image else "",
        "item_type": obj.item_type or CatalogueProduct.ITEM_TYPE_PRODUCT,
        "price": obj.price or "",
        "description": obj.description or "",
        "category": obj.category or "",
        "order_button_enabled": bool(obj.order_button_enabled),
        "call_button_enabled": bool(obj.call_button_enabled),
        "whatsapp_button_enabled": bool(obj.whatsapp_button_enabled),
        "enquiry_button_enabled": bool(obj.enquiry_button_enabled),
        "sort_order": obj.sort_order or 0,
        "is_active": bool(obj.is_active),
    }


def _catalogue_category_payload(obj, *, product_count=0, service_count=0):
    return {
        "id": obj.id,
        "name": obj.name or "",
        "sort_order": obj.sort_order or 0,
        "is_active": bool(obj.is_active),
        "product_count": product_count,
        "service_count": service_count,
    }


def _catalogue_page_payload(obj, company_profile=None):
    company_profile = company_profile or getattr(obj, "company_profile", None)
    raw_gallery_items = getattr(obj, "gallery_items", []) if obj else []
    gallery_items = []
    if isinstance(raw_gallery_items, list):
        for row in raw_gallery_items:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()[:120]
            storage_key = str(row.get("storage_key") or "").strip()
            image_url = str(row.get("image_url") or "").strip()
            if storage_key:
                resolved_url = storage_url(storage_key)
                if resolved_url:
                    image_url = resolved_url
            if not image_url:
                continue
            gallery_items.append({
                "id": str(row.get("id") or uuid.uuid4().hex[:10]),
                "title": title,
                "image_url": image_url,
                "storage_key": storage_key,
            })
    return {
        "public_slug": obj.public_slug if obj else "",
        "is_active": bool(obj.is_active) if obj else True,
        "about_title": (obj.about_title if obj else "") or "About Us",
        "about_content": (obj.about_content if obj else "") or "",
        "services_title": (obj.services_title if obj else "") or "Services",
        "services_content": (obj.services_content if obj else "") or "",
        "contact_title": (obj.contact_title if obj else "") or "Contact",
        "contact_note": (obj.contact_note if obj else "") or "",
        "gallery_title": (obj.gallery_title if obj else "") or "Gallery",
        "gallery_items": gallery_items,
        "contact": {
            "phone": (company_profile.phone if company_profile else "") or "",
            "whatsapp_number": (company_profile.whatsapp_number if company_profile else "") or "",
            "email": (company_profile.email if company_profile else "") or "",
            "website": (company_profile.website if company_profile else "") or "",
            "address": (company_profile.address if company_profile else "") or "",
        },
    }


def _wa_subscription(org):
    sub = (
        Subscription.objects
        .select_related("plan", "plan__product")
        .filter(
            organization=org,
            status__in=("active", "trialing"),
            plan__product__slug="whatsapp-automation",
        )
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return None
    try:
        dashboard_views.normalize_subscription_end_date(sub)
        if not dashboard_views.is_subscription_active(sub):
            dashboard_views.maybe_expire_subscription(sub)
            return None
    except Exception:
        # Keep endpoint resilient; status filter still protects common cases.
        pass
    return sub


WA_KEYWORD_RULE_LIMIT_DEFAULTS = {
    "free": 10,
    "basic": 20,
    "starter": 20,
    "plus": 50,
    "growth": 50,
    "professional": 100,
    "pro": 100,
}


def _wa_plan_tier_key(plan_name):
    key = str(plan_name or "").strip().lower()
    if "professional" in key:
        return "professional"
    if "plus" in key:
        return "plus"
    if "growth" in key:
        return "growth"
    if "basic" in key:
        return "basic"
    if "starter" in key:
        return "starter"
    if "pro" in key:
        return "pro"
    return "free"


def _to_positive_int_or_none(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if parsed <= 0:
        return None
    return parsed


def _default_wa_keyword_limit(plan_name):
    tier_key = _wa_plan_tier_key(plan_name)
    return WA_KEYWORD_RULE_LIMIT_DEFAULTS.get(tier_key, WA_KEYWORD_RULE_LIMIT_DEFAULTS["free"])


def _wa_keyword_rule_limit(org):
    sub = _wa_subscription(org)
    if sub and sub.plan:
        features = sub.plan.features or {}
        configured = (
            features.get("wa_keyword_rules_limit")
            if isinstance(features, dict)
            else None
        )
        if configured is None and isinstance(features, dict):
            configured = features.get("keyword_rules_limit")
        parsed = _to_positive_int_or_none(configured)
        if parsed is not None:
            return parsed
        return _default_wa_keyword_limit(sub.plan.name)
    return WA_KEYWORD_RULE_LIMIT_DEFAULTS["free"]


def _digital_card_limit_payload(org):
    included_cards = 1
    sub = _wa_subscription(org)
    addon_cards = 0
    if sub and sub.plan and sub.plan.allow_addons:
        addon_cards = int(sub.addon_count or 0)
    allowed_total = max(1, included_cards + addon_cards)
    used_total = DigitalCardEntry.objects.filter(organization=org).count()
    return {
        "included_cards": included_cards,
        "addon_cards": addon_cards,
        "allowed_total": allowed_total,
        "used_total": used_total,
        "remaining_cards": max(0, allowed_total - used_total),
        "can_create": used_total < allowed_total,
    }


def _wa_summary_payload(org):
    sub = _wa_subscription(org)
    renewal_date = None
    if sub:
        renewal_date = getattr(sub, "renewal_date", None) or getattr(sub, "end_date", None)

    inbox_qs = AdminNotification.objects.filter(
        is_deleted=False,
        audience="org_admin",
        organization=org,
    )
    return {
        "digital_card_users": DigitalCardEntry.objects.filter(organization=org).count(),
        "inbox_notifications": inbox_qs.count(),
        "unread_inbox_notifications": inbox_qs.filter(is_read=False).count(),
        "plan_renewal_date": renewal_date.isoformat() if renewal_date else "",
        "media_library_count": StorageFile.objects.filter(organization=org, is_deleted=False).count(),
    }


def _build_unique_card_entry_slug(base_text):
    from .models import build_unique_public_slug

    candidate = build_unique_public_slug(DigitalCardEntry, base_text, fallback_prefix="card")
    while DigitalCard.objects.filter(public_slug=candidate).exists():
        candidate = build_unique_public_slug(DigitalCardEntry, f"{base_text}-{candidate}", fallback_prefix="card")
    return candidate


def _card_entry_prefill(company_profile, default_slug="", source_entry=None):
    social_links_items = _normalize_social_links_items(getattr(company_profile, "social_links", {}) or {}) if company_profile else []
    if source_entry:
        return {
            "id": None,
            "card_title": source_entry.card_title or "",
            "person_name": source_entry.person_name or "",
            "role_title": source_entry.role_title or "",
            "phone": source_entry.phone or "",
            "whatsapp_number": source_entry.whatsapp_number or "",
            "telephone_number": source_entry.telephone_number or "",
            "email": source_entry.email or "",
            "website": source_entry.website or "",
            "address": source_entry.address or "",
            "description": source_entry.description or "",
            "theme_color": source_entry.theme_color or "#22c55e",
            "theme_secondary_color": getattr(source_entry, "theme_secondary_color", "") or "#0f172a",
            "theme_mode": (getattr(source_entry, "theme_mode", "") or "gradient"),
            "template_style": getattr(source_entry, "template_style", "") or "design1",
            "social_links_items": _normalize_social_links_items(source_entry.social_links or {}),
            "logo_image_data": _resolve_card_asset_url(
                getattr(source_entry, "logo_storage_key", ""),
                source_entry.logo_image_data or "",
            ),
            "hero_banner_image_data": _resolve_card_asset_url(
                getattr(source_entry, "hero_banner_storage_key", ""),
                source_entry.hero_banner_image_data or "",
            ),
            "logo_size": int(source_entry.logo_size or 96),
            "logo_radius_px": int(getattr(source_entry, "logo_radius_px", 28) or 28),
            "icon_size_pt": int(getattr(source_entry, "icon_size_pt", 14) or 14),
            "font_size_pt": int(getattr(source_entry, "font_size_pt", 16) or 16),
            "public_slug": default_slug or "",
            "is_primary": False,
        }
    return {
        "id": None,
        "card_title": (company_profile.company_name if company_profile else "") or "",
        "person_name": (company_profile.company_name if company_profile else "") or "",
        "role_title": "Business Owner",
        "phone": (company_profile.phone if company_profile else "") or "",
        "whatsapp_number": (company_profile.whatsapp_number if company_profile else "") or "",
        "telephone_number": "",
        "email": (company_profile.email if company_profile else "") or "",
        "website": (company_profile.website if company_profile else "") or "",
        "address": (company_profile.address if company_profile else "") or "",
        "description": (company_profile.description if company_profile else "") or "",
        "theme_color": (company_profile.theme_color if company_profile else "") or "#22c55e",
        "theme_secondary_color": "#0f172a",
        "theme_mode": "gradient",
        "template_style": "design1",
        "social_links_items": social_links_items,
        "logo_image_data": "",
        "hero_banner_image_data": "",
        "logo_size": 96,
        "logo_radius_px": 28,
        "icon_size_pt": 14,
        "font_size_pt": 16,
        "public_slug": default_slug or "",
        "is_primary": False,
    }


def _serialize_card_entry(obj):
    custom_domain = str(getattr(obj, "custom_domain", "") or "").strip()
    logo_image_url = _resolve_card_asset_url(getattr(obj, "logo_storage_key", ""), obj.logo_image_data or "")
    hero_banner_url = _resolve_card_asset_url(
        getattr(obj, "hero_banner_storage_key", ""),
        obj.hero_banner_image_data or "",
    )
    return {
        "id": obj.id,
        "public_slug": obj.public_slug,
        "public_url": f"/card/{obj.public_slug}/",
        "custom_domain": custom_domain,
        "custom_url": f"https://{custom_domain}/" if custom_domain else "",
        "custom_domain_active": bool(getattr(obj, "custom_domain_active", False)),
        "card_title": obj.card_title or "",
        "person_name": obj.person_name or "",
        "role_title": obj.role_title or "",
        "phone": obj.phone or "",
        "whatsapp_number": obj.whatsapp_number or "",
        "telephone_number": obj.telephone_number or "",
        "email": obj.email or "",
        "website": obj.website or "",
        "address": obj.address or "",
        "description": obj.description or "",
        "theme_color": obj.theme_color or "#22c55e",
        "theme_secondary_color": getattr(obj, "theme_secondary_color", "") or "#0f172a",
        "theme_mode": (getattr(obj, "theme_mode", "") or "gradient"),
        "template_style": (getattr(obj, "template_style", "") or "design1"),
        "social_links_items": _normalize_social_links_items(obj.social_links or {}),
        "logo_image_data": logo_image_url,
        "hero_banner_image_data": hero_banner_url,
        "logo_size": int(obj.logo_size or 96),
        "logo_radius_px": int(getattr(obj, "logo_radius_px", 28) or 28),
        "icon_size_pt": int(getattr(obj, "icon_size_pt", 14) or 14),
        "font_size_pt": int(getattr(obj, "font_size_pt", 16) or 16),
        "is_primary": bool(getattr(obj, "is_primary", False)),
        "is_active": bool(obj.is_active),
        "sort_order": int(obj.sort_order or 0),
        "created_at": obj.created_at.isoformat() if obj.created_at else "",
        "updated_at": obj.updated_at.isoformat() if obj.updated_at else "",
    }


_DOMAIN_RE = re.compile(r"^(?=.{3,255}$)([a-zA-Z0-9-]{1,63}\.)+[A-Za-z]{2,63}$")


def _normalize_domain(value):
    domain = str(value or "").strip().lower()
    for prefix in ("http://", "https://"):
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    domain = domain.split("/")[0].strip().strip(".")
    return domain


def _dns_settings_payload(request, custom_domain=""):
    custom_domain = _normalize_domain(custom_domain)
    theme_settings = ThemeSettings.get_active()
    configured_host = _normalize_domain(theme_settings.public_server_domain)
    app_host = configured_host or request.get_host().split(":")[0].strip().lower()
    configured_ip = str(theme_settings.public_server_ip or "").strip()
    card_path = "/card/<your-card-slug>/"
    is_subdomain = custom_domain.count(".") >= 2 and not custom_domain.startswith("www.")
    records = []
    if custom_domain:
        if is_subdomain or custom_domain.startswith("www."):
            label = custom_domain.split(".", 1)[0]
            records.append({"type": "CNAME", "host": label, "value": app_host, "ttl": "Auto"})
        else:
            records.append({
                "type": "A",
                "host": "@",
                "value": configured_ip or "YOUR_SERVER_PUBLIC_IP",
                "ttl": "Auto",
            })
            records.append({"type": "CNAME", "host": "www", "value": custom_domain, "ttl": "Auto"})
    return {
        "app_host_target": app_host,
        "server_ip_target": configured_ip or "YOUR_SERVER_PUBLIC_IP",
        "custom_domain": custom_domain,
        "records": records,
        "notes": [
            "After DNS propagation, map your web server/reverse proxy to accept this host.",
            f"Target card path on Work Zilla server: {card_path}",
            "Keep SSL certificate enabled for custom domain.",
        ] if custom_domain else [],
    }


def _ensure_default_card_entry(org, company_profile=None, user=None):
    if DigitalCardEntry.objects.filter(organization=org).exists():
        return
    company_profile = company_profile or CompanyProfile.objects.filter(organization=org).first()
    legacy_card = DigitalCard.objects.filter(company_profile=company_profile).first() if company_profile else None
    base_text = (company_profile.company_name if company_profile and company_profile.company_name else org.name) or "card"
    public_slug = legacy_card.public_slug if legacy_card and legacy_card.public_slug else _build_unique_card_entry_slug(base_text)
    if DigitalCardEntry.objects.filter(public_slug=public_slug).exists():
        public_slug = _build_unique_card_entry_slug(base_text)
    prefill = _card_entry_prefill(company_profile, default_slug=public_slug)
    DigitalCardEntry.objects.create(
        organization=org,
        company_profile=company_profile,
        public_slug=public_slug,
        card_title=prefill["card_title"],
        person_name=prefill["person_name"],
        role_title=prefill["role_title"],
        phone=prefill["phone"],
        whatsapp_number=prefill["whatsapp_number"],
        telephone_number=prefill["telephone_number"],
        email=prefill["email"],
        website=prefill["website"],
        address=prefill["address"],
        description=prefill["description"],
        social_links={"items": prefill["social_links_items"]},
        theme_color=prefill["theme_color"],
        theme_secondary_color=prefill["theme_secondary_color"],
        theme_mode=prefill.get("theme_mode") or "gradient",
        logo_radius_px=prefill["logo_radius_px"],
        is_primary=True,
        created_by=user,
        updated_by=user,
    )


def _mime_from_data_url(data_url, fallback="image/*"):
    raw = str(data_url or "").strip()
    if raw.startswith("data:"):
        return raw[5:].split(";", 1)[0].strip().lower() or fallback
    return fallback


@login_required
@require_http_methods(["GET", "PUT"])
def company_profile_settings(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    profile, _ = CompanyProfile.objects.get_or_create(organization=org)
    if request.method == "GET":
        return JsonResponse({"company_profile": _company_payload(profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    for field in (
        "company_name",
        "phone",
        "whatsapp_number",
        "email",
        "website",
        "address",
        "country",
        "state",
        "postal_code",
        "description",
        "theme_color",
    ):
        if field in data:
            setattr(profile, field, str(data.get(field) or "").strip())
    if "logo_data_url" in data:
        try:
            logo_data_url = str(data.get("logo_data_url") or "").strip()
            if logo_data_url:
                _save_company_logo_from_data_url(profile, logo_data_url)
        except ValueError as exc:
            code = str(exc)
            message_map = {
                "unsupported_logo_type": "Only JPG, PNG, SVG logo files are supported.",
                "logo_too_large": "Company logo size must be under 2 MB.",
                "invalid_logo_data": "Invalid company logo data.",
            }
            return JsonResponse({"logo": [code], "error": message_map.get(code, "Invalid company logo.")}, status=400)
    if "social_links_items" in data and isinstance(data.get("social_links_items"), list):
        profile.social_links = {"items": _normalize_social_links_items(data.get("social_links_items") or [])}
    elif "social_links" in data:
        social_links = data.get("social_links")
        if isinstance(social_links, dict):
            profile.social_links = _serialize_social_links(social_links)
        elif isinstance(social_links, list):
            profile.social_links = {"items": _normalize_social_links_items(social_links)}
    if "product_highlights_html" in data:
        profile.product_highlights = str(data.get("product_highlights_html") or "").strip()
    elif "product_highlights" in data and isinstance(data.get("product_highlights"), list):
        profile.product_highlights = [str(item).strip() for item in data.get("product_highlights") if str(item).strip()]
    profile.updated_by = request.user
    profile.save()
    return JsonResponse({"company_profile": _company_payload(profile)})


@login_required
@require_http_methods(["GET", "PUT"])
def whatsapp_settings_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    settings_obj, _ = WhatsappSettings.objects.get_or_create(organization=org)
    company_profile = CompanyProfile.objects.filter(organization=org).first()
    if request.method == "GET":
        return JsonResponse({"settings": _settings_payload(settings_obj, company_profile=company_profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    if "auto_reply_enabled" in data:
        settings_obj.auto_reply_enabled = _to_bool(data.get("auto_reply_enabled"), default=True)
    if "welcome_message" in data:
        settings_obj.welcome_message = str(data.get("welcome_message") or "").strip()
    settings_obj.save()
    return JsonResponse({"settings": _settings_payload(settings_obj, company_profile=company_profile)})


@login_required
@require_http_methods(["GET"])
def whatsapp_dashboard_summary_api(request):
    org = _get_org(request)
    if not org:
        return HttpResponseForbidden("No active organization selected.")
    return JsonResponse({"summary": _wa_summary_payload(org)})


@login_required
@require_http_methods(["GET", "POST"])
def automation_rules_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    keyword_rules_limit = _wa_keyword_rule_limit(org)
    if request.method == "GET":
        rows = AutomationRule.objects.filter(organization=org)
        return JsonResponse({
            "rules": [_rule_payload(row) for row in rows],
            "keyword_rules_limit": keyword_rules_limit,
            "keyword_rules_used": rows.count(),
        })
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    rule_id = data.get("id")
    if rule_id:
        rule = AutomationRule.objects.filter(id=rule_id, organization=org).first()
        if not rule:
            return JsonResponse({"error": "not_found"}, status=404)
    else:
        used_rules = AutomationRule.objects.filter(organization=org).count()
        if used_rules >= keyword_rules_limit:
            return JsonResponse(
                {
                    "error": "keyword_limit_reached",
                    "detail": f"Keyword rule limit reached for your plan ({keyword_rules_limit}).",
                    "keyword_rules_limit": keyword_rules_limit,
                    "keyword_rules_used": used_rules,
                },
                status=400,
            )
        rule = AutomationRule(organization=org)
    keyword = str(data.get("keyword") or "").strip()[:120]
    if not keyword:
        return JsonResponse({"keyword": ["required"]}, status=400)
    reply_message = _html_to_whatsapp_text(data.get("reply_message") or "")
    if not reply_message:
        return JsonResponse({"reply_message": ["required"]}, status=400)
    if len(reply_message) > 350:
        return JsonResponse(
            {
                "reply_message": ["max_length_exceeded"],
                "message": "Reply message supports up to 350 characters.",
                "max_length": 350,
            },
            status=400,
        )
    rule.keyword = keyword
    rule.reply_message = reply_message
    rule.is_default = _to_bool(data.get("is_default", False), default=False)
    rule.sort_order = int(data.get("sort_order") or 0)
    rule.is_active = _to_bool(data.get("is_active", True), default=True)
    if rule.is_default:
        AutomationRule.objects.filter(organization=org, is_default=True).exclude(id=rule.id).update(is_default=False)
    rule.save()
    return JsonResponse({"rule": _rule_payload(rule)})


@login_required
@require_http_methods(["DELETE"])
def automation_rule_detail_api(request, rule_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    deleted, _ = AutomationRule.objects.filter(id=rule_id, organization=org).delete()
    if not deleted:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET", "POST"])
def marketing_contacts_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        try:
            rows = MarketingContact.objects.filter(organization=org).order_by("-updated_at", "-id")
            return JsonResponse({"contacts": [_contact_payload(row) for row in rows]})
        except DatabaseError:
            # Keep WhatsApp Automation page usable even if migration is pending.
            return JsonResponse({"contacts": [], "warning": "marketing_tables_unavailable"})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    phone = _normalize_phone_number(data.get("phone_number"))
    if not phone:
        return JsonResponse({"phone_number": ["invalid"]}, status=400)
    name = str(data.get("name") or "").strip()[:160]
    email = str(data.get("email") or "").strip()
    tags = str(data.get("tags") or "").strip()[:240]
    is_opted_in = _to_bool(data.get("is_opted_in"), default=False)
    has_opted_out = _to_bool(data.get("has_opted_out"), default=False)
    opt_in_source = str(data.get("opt_in_source") or "").strip()[:120]
    consent_note = str(data.get("consent_note") or "").strip()
    row, created = MarketingContact.objects.get_or_create(
        organization=org,
        phone_number=phone,
        defaults={"name": name},
    )
    row.name = name or row.name
    row.email = email
    row.tags = tags
    row.is_opted_in = bool(is_opted_in and not has_opted_out)
    row.has_opted_out = bool(has_opted_out)
    row.opt_in_source = opt_in_source
    row.consent_note = consent_note
    now = timezone.now()
    if row.is_opted_in and not row.opt_in_at:
        row.opt_in_at = now
    if row.has_opted_out and not row.opted_out_at:
        row.opted_out_at = now
    if not row.has_opted_out:
        row.opted_out_at = None
        row.opt_out_reason = ""
    row.save()
    return JsonResponse({"contact": _contact_payload(row), "created": created})


@login_required
@require_http_methods(["PATCH", "DELETE"])
def marketing_contact_detail_api(request, contact_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    row = MarketingContact.objects.filter(id=contact_id, organization=org).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    if request.method == "DELETE":
        row.delete()
        return JsonResponse({"status": "deleted"})
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    if "name" in data:
        row.name = str(data.get("name") or "").strip()[:160]
    if "phone_number" in data:
        phone = _normalize_phone_number(data.get("phone_number"))
        if not phone:
            return JsonResponse({"phone_number": ["invalid"]}, status=400)
        exists = MarketingContact.objects.filter(organization=org, phone_number=phone).exclude(id=row.id).exists()
        if exists:
            return JsonResponse({"phone_number": ["already_exists"]}, status=400)
        row.phone_number = phone
    if "email" in data:
        row.email = str(data.get("email") or "").strip()
    if "tags" in data:
        row.tags = str(data.get("tags") or "").strip()[:240]
    if "is_opted_in" in data:
        requested_opt_in = _to_bool(data.get("is_opted_in"), default=False)
        row.is_opted_in = bool(requested_opt_in and not row.has_opted_out)
        if row.is_opted_in and not row.opt_in_at:
            row.opt_in_at = timezone.now()
    if "has_opted_out" in data:
        row.has_opted_out = _to_bool(data.get("has_opted_out"), default=False)
        if row.has_opted_out:
            row.opted_out_at = timezone.now()
            row.is_opted_in = False
            row.opt_out_reason = str(data.get("opt_out_reason") or "STOP").strip()[:160]
        else:
            row.opted_out_at = None
            row.opt_out_reason = ""
    if "consent_note" in data:
        row.consent_note = str(data.get("consent_note") or "").strip()
    if "opt_in_source" in data:
        row.opt_in_source = str(data.get("opt_in_source") or "").strip()[:120]
    row.save()
    return JsonResponse({"contact": _contact_payload(row)})


@login_required
@require_http_methods(["POST"])
def marketing_contacts_opt_out_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    phone = _normalize_phone_number(data.get("phone_number"))
    if not phone:
        return JsonResponse({"phone_number": ["invalid"]}, status=400)
    reason = str(data.get("reason") or "STOP").strip()[:160] or "STOP"
    row = MarketingContact.objects.filter(organization=org, phone_number=phone).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    row.has_opted_out = True
    row.is_opted_in = False
    row.opt_out_reason = reason
    row.opted_out_at = timezone.now()
    row.save(update_fields=["has_opted_out", "is_opted_in", "opt_out_reason", "opted_out_at", "updated_at"])
    return JsonResponse({"status": "ok", "contact": _contact_payload(row)})


@login_required
@require_http_methods(["POST"])
def marketing_contacts_import_csv_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    csv_text = str(data.get("csv_text") or "")
    if not csv_text.strip():
        return JsonResponse({"csv_text": ["required"]}, status=400)
    reader = csv.DictReader(io.StringIO(csv_text))
    created = 0
    updated = 0
    skipped = 0
    for item in reader:
        if not isinstance(item, dict):
            skipped += 1
            continue
        phone = _normalize_phone_number(item.get("phone_number") or item.get("phone") or item.get("mobile"))
        if not phone:
            skipped += 1
            continue
        name = str(item.get("name") or "").strip()[:160]
        email = str(item.get("email") or "").strip()
        tags = str(item.get("tags") or "").strip()[:240]
        raw_opt_in = str(item.get("is_opted_in") or item.get("opt_in") or "false").strip().lower()
        is_opted_in = raw_opt_in in {"true", "1", "yes", "y"}
        opt_in_source = str(item.get("opt_in_source") or "csv_import").strip()[:120]
        consent_note = str(item.get("consent_note") or "").strip()
        row, was_created = MarketingContact.objects.get_or_create(
            organization=org,
            phone_number=phone,
            defaults={"name": name},
        )
        row.name = name or row.name
        row.email = email
        row.tags = tags
        row.opt_in_source = opt_in_source
        row.consent_note = consent_note
        if is_opted_in and not row.has_opted_out:
            row.is_opted_in = True
            if not row.opt_in_at:
                row.opt_in_at = timezone.now()
        row.save()
        if was_created:
            created += 1
        else:
            updated += 1
    return JsonResponse({"status": "ok", "created": created, "updated": updated, "skipped": skipped})


@login_required
@require_http_methods(["GET", "POST"])
def marketing_campaigns_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        try:
            rows = MarketingCampaign.objects.filter(organization=org).order_by("-created_at", "-id")[:50]
            recent_deliveries = (
                MarketingCampaignDelivery.objects
                .filter(organization=org)
                .select_related("campaign", "contact")
                .order_by("-attempted_at", "-id")[:100]
            )
            return JsonResponse({
                "campaigns": [_campaign_payload(row) for row in rows],
                "recent_deliveries": [_delivery_payload(row) for row in recent_deliveries],
            })
        except DatabaseError:
            return JsonResponse({
                "campaigns": [],
                "recent_deliveries": [],
                "warning": "marketing_tables_unavailable",
            })
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    name = str(data.get("name") or "").strip()[:180]
    template_name = str(data.get("template_name") or "").strip()[:180]
    if not name:
        return JsonResponse({"name": ["required"]}, status=400)
    if not template_name:
        return JsonResponse({"template_name": ["required"]}, status=400)
    if not _is_valid_template_name(template_name):
        return JsonResponse(
            {
                "template_name": ["invalid_format"],
                "detail": "Use approved WhatsApp template name format: lowercase letters, numbers, underscore.",
            },
            status=400,
        )
    compliance_note = str(data.get("compliance_note") or "").strip()
    if "stop" not in compliance_note.lower():
        return JsonResponse(
            {
                "compliance_note": ["must_include_stop_instruction"],
                "detail": "Compliance note must include STOP opt-out instruction.",
            },
            status=400,
        )
    template_variables = _parse_template_variables(data.get("template_variables"))
    contact_ids = data.get("contact_ids") if isinstance(data.get("contact_ids"), list) else []
    contacts_qs = MarketingContact.objects.filter(organization=org)
    if contact_ids:
        contacts_qs = contacts_qs.filter(id__in=contact_ids)
    contacts = list(contacts_qs.order_by("id"))
    if not contacts:
        return JsonResponse({"contact_ids": ["no_contacts_selected"]}, status=400)
    allowed_to_send, ratio = _failure_rate_guard(org)
    campaign = MarketingCampaign.objects.create(
        organization=org,
        name=name,
        template_name=template_name,
        template_variables=template_variables,
        compliance_note=compliance_note,
        created_by=request.user,
        status=MarketingCampaign.STATUS_DRAFT,
    )
    send_now = _to_bool(data.get("send_now"), default=True)
    if not send_now:
        campaign.total_contacts = len(contacts)
        campaign.save(update_fields=["total_contacts", "updated_at"])
        return JsonResponse({"campaign": _campaign_payload(campaign), "status": "draft_saved"})
    if not allowed_to_send:
        campaign.status = MarketingCampaign.STATUS_BLOCKED
        campaign.failed_count = len(contacts)
        campaign.total_contacts = len(contacts)
        campaign.save(update_fields=["status", "failed_count", "total_contacts", "updated_at"])
        return JsonResponse(
            {
                "campaign": _campaign_payload(campaign),
                "detail": f"Campaign blocked due to high failure rate ({round(ratio * 100, 1)}%).",
            },
            status=400,
        )
    _campaign_send_to_contacts(campaign, contacts)
    return JsonResponse({"campaign": _campaign_payload(campaign)})


@login_required
@require_http_methods(["POST"])
def marketing_campaign_retry_failed_api(request, campaign_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    campaign = MarketingCampaign.objects.filter(id=campaign_id, organization=org).first()
    if not campaign:
        return JsonResponse({"error": "not_found"}, status=404)
    allowed_to_send, ratio = _failure_rate_guard(org)
    if not allowed_to_send:
        return JsonResponse(
            {"error": "blocked", "detail": f"Retry blocked due to high failure rate ({round(ratio * 100, 1)}%)."},
            status=400,
        )
    failed_contact_ids = list(
        MarketingCampaignDelivery.objects
        .filter(campaign=campaign, status=MarketingCampaignDelivery.STATUS_FAILED, contact__isnull=False)
        .values_list("contact_id", flat=True)
        .distinct()
    )
    contacts = list(MarketingContact.objects.filter(organization=org, id__in=failed_contact_ids))
    if not contacts:
        return JsonResponse({"status": "ok", "detail": "No failed contacts to retry.", "campaign": _campaign_payload(campaign)})
    _campaign_send_to_contacts(campaign, contacts)
    return JsonResponse({"status": "ok", "campaign": _campaign_payload(campaign)})


@login_required
@require_http_methods(["POST"])
def automation_preview_reply(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    incoming = str(data.get("message") or "").strip()
    is_first_message = bool(data.get("is_first_message", False))
    settings_obj, _ = WhatsappSettings.objects.get_or_create(organization=org)
    company_profile = CompanyProfile.objects.filter(organization=org).first()
    if not settings_obj.auto_reply_enabled:
        return JsonResponse({"reply": "", "matched_rule": None, "auto_reply_enabled": False})
    rules = list(AutomationRule.objects.filter(organization=org, is_active=True))
    matched = None
    lower_incoming = incoming.lower()
    if lower_incoming:
        for rule in rules:
            keyword = (rule.keyword or "").strip().lower()
            if keyword and keyword in lower_incoming:
                matched = rule
                break
    if not matched:
        matched = next((rule for rule in rules if rule.is_default), None)
    if matched:
        return JsonResponse({
            "reply": matched.reply_message or "",
            "matched_rule": _rule_payload(matched),
            "auto_reply_enabled": True,
            "is_first_message": is_first_message,
        })
    default_welcome = _settings_payload(settings_obj, company_profile=company_profile).get("welcome_message", "")
    return JsonResponse({
        "reply": default_welcome,
        "matched_rule": None,
        "auto_reply_enabled": True,
        "is_first_message": is_first_message,
    })


@login_required
@require_http_methods(["GET", "POST"])
def catalogue_products_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        rows = CatalogueProduct.objects.filter(organization=org)
        return JsonResponse({"products": [_catalogue_payload(row) for row in rows]})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    row_id = data.get("id")
    if row_id:
        row = CatalogueProduct.objects.filter(id=row_id, organization=org).first()
        if not row:
            return JsonResponse({"error": "not_found"}, status=404)
    else:
        if CatalogueProduct.objects.filter(organization=org).count() >= 50:
            return JsonResponse(
                {
                    "error": "catalogue_limit_reached",
                    "message": "Maximum 50 catalogue products allowed.",
                    "max_items": 50,
                },
                status=400,
            )
        row = CatalogueProduct(organization=org)
    title = str(data.get("title") or "").strip()
    if not title:
        return JsonResponse({"title": ["required"]}, status=400)
    row.title = title
    item_type = str(data.get("item_type") or CatalogueProduct.ITEM_TYPE_PRODUCT).strip().lower()
    if item_type not in {CatalogueProduct.ITEM_TYPE_PRODUCT, CatalogueProduct.ITEM_TYPE_SERVICE}:
        item_type = CatalogueProduct.ITEM_TYPE_PRODUCT
    row.item_type = item_type
    row.price = str(data.get("price") or "").strip()
    row.description = str(data.get("description") or "").strip()
    category_name = str(data.get("category") or "").strip()
    if category_name:
        if (
            not CatalogueCategory.objects.filter(organization=org, name=category_name).exists()
            and CatalogueCategory.objects.filter(organization=org).count() >= 25
        ):
            return JsonResponse(
                {
                    "error": "category_limit_reached",
                    "message": "Maximum 25 categories allowed.",
                    "max_categories": 25,
                },
                status=400,
            )
        category_obj, _ = CatalogueCategory.objects.get_or_create(
            organization=org,
            name=category_name,
            defaults={"sort_order": CatalogueCategory.objects.filter(organization=org).count()},
        )
        row.category = category_obj.name
    else:
        row.category = ""
    incoming_image = str(data.get("image_data_url") or "").strip()
    if "image_data_url" in data:
        if incoming_image.startswith("data:"):
            try:
                parsed = _parse_image_data_url(
                    incoming_image,
                    max_bytes=1024 * 1024,
                    field_name="catalogue_image",
                )
            except ValueError as exc:
                code = str(exc)
                message_map = {
                    "unsupported_catalogue_image_type": "Only image files (JPG, PNG, SVG, WEBP, GIF, AVIF) are allowed.",
                    "catalogue_image_too_large": "Image size must be under 1 MB.",
                    "invalid_catalogue_image_data": "Invalid catalogue image data.",
                }
                return JsonResponse({"image_data_url": [code], "message": message_map.get(code, "Invalid image.")}, status=400)
            filename = f"catalogue-item-{uuid.uuid4().hex[:12]}.{parsed['ext']}"
            row.image.save(filename, ContentFile(parsed["bytes"]), save=False)
        elif not incoming_image:
            if row.image:
                row.image.delete(save=False)
            row.image = None
    row.order_button_enabled = bool(data.get("order_button_enabled", True))
    row.call_button_enabled = bool(data.get("call_button_enabled", True))
    row.whatsapp_button_enabled = bool(data.get("whatsapp_button_enabled", True))
    row.enquiry_button_enabled = bool(data.get("enquiry_button_enabled", True))
    row.sort_order = int(data.get("sort_order") or 0)
    row.is_active = bool(data.get("is_active", True))
    row.save()
    return JsonResponse({"product": _catalogue_payload(row)})


@login_required
@require_http_methods(["DELETE"])
def catalogue_product_detail_api(request, product_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    deleted, _ = CatalogueProduct.objects.filter(id=product_id, organization=org).delete()
    if not deleted:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET", "PUT"])
def catalogue_page_settings_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    company_profile, _ = CompanyProfile.objects.get_or_create(organization=org)
    catalogue_page = CataloguePage.objects.filter(company_profile=company_profile).first()
    if not catalogue_page:
        # Auto-create should usually happen from signals, but keep API resilient.
        from .models import build_unique_public_slug
        catalogue_page = CataloguePage.objects.create(
            company_profile=company_profile,
            public_slug=build_unique_public_slug(CataloguePage, company_profile.company_name or org.name, fallback_prefix="catalogue"),
        )
    if request.method == "GET":
        return JsonResponse({"catalogue_page": _catalogue_page_payload(catalogue_page, company_profile=company_profile)})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    for field in ("about_title", "about_content", "services_title", "services_content", "contact_title", "contact_note", "gallery_title"):
        if field in data:
            setattr(catalogue_page, field, str(data.get(field) or "").strip())
    if "gallery_items" in data:
        incoming = data.get("gallery_items")
        if not isinstance(incoming, list):
            return JsonResponse({"gallery_items": ["invalid"]}, status=400)
        if len(incoming) > 30:
            return JsonResponse({"gallery_items": ["max_count_exceeded"], "message": "Maximum 30 gallery images allowed."}, status=400)
        existing_items = catalogue_page.gallery_items if isinstance(catalogue_page.gallery_items, list) else []
        existing_keys = {
            str(row.get("storage_key") or "").strip()
            for row in existing_items
            if isinstance(row, dict) and str(row.get("storage_key") or "").strip()
        }
        next_items = []
        kept_keys = set()
        for row in incoming:
            if not isinstance(row, dict):
                continue
            title = str(row.get("title") or "").strip()[:120]
            row_id = str(row.get("id") or uuid.uuid4().hex[:10])
            image_data_url = str(row.get("image_data_url") or "").strip()
            storage_key = str(row.get("storage_key") or "").strip()
            image_url = str(row.get("image_url") or "").strip()
            if image_data_url:
                try:
                    saved = _save_card_asset_to_object_storage(
                        org=org,
                        owner=request.user,
                        data_url=image_data_url,
                        field_name="gallery_image",
                        filename_prefix=f"{catalogue_page.public_slug or 'catalogue'}-gallery",
                        max_bytes=1024 * 1024,
                    )
                except ValueError as exc:
                    code = str(exc)
                    message_map = {
                        "unsupported_gallery_image_type": "Only image files (JPG, PNG, SVG, WEBP, GIF, AVIF) are allowed.",
                        "gallery_image_too_large": "Gallery image size must be under 1 MB.",
                        "invalid_gallery_image_data": "Invalid gallery image data.",
                    }
                    return JsonResponse({"gallery_items": [code], "message": message_map.get(code, "Invalid gallery image.")}, status=400)
                except Exception:
                    saved = None
                if saved:
                    # Keep storage key even when URL resolution is unavailable.
                    # This ensures delete flow can permanently remove the file from
                    # both local and object storage backends.
                    storage_key = str(saved.get("storage_key") or "").strip()
                    resolved_url = str(saved.get("url") or "").strip()
                    image_url = resolved_url or image_data_url
                else:
                    image_url = image_data_url
            elif storage_key:
                resolved = storage_url(storage_key)
                if resolved:
                    image_url = resolved
            if not image_url:
                continue
            if storage_key:
                kept_keys.add(storage_key)
            next_items.append({
                "id": row_id,
                "title": title,
                "storage_key": storage_key,
                "image_url": image_url,
            })
        removed_keys = existing_keys - kept_keys
        for key in removed_keys:
            _delete_object_storage_asset(org, key)
        catalogue_page.gallery_items = next_items
    if "is_active" in data:
        catalogue_page.is_active = bool(data.get("is_active"))
    catalogue_page.save()
    return JsonResponse({"catalogue_page": _catalogue_page_payload(catalogue_page, company_profile=company_profile)})


@login_required
@require_http_methods(["GET", "POST"])
def catalogue_categories_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if request.method == "GET":
        rows = list(CatalogueCategory.objects.filter(organization=org))
        products = list(CatalogueProduct.objects.filter(organization=org))
        counts = {}
        for row in products:
            key = (row.category or "").strip().lower()
            if not key:
                continue
            bucket = counts.setdefault(key, {"product_count": 0, "service_count": 0})
            if row.item_type == CatalogueProduct.ITEM_TYPE_SERVICE:
                bucket["service_count"] += 1
            else:
                bucket["product_count"] += 1
        return JsonResponse(
            {
                "categories": [
                    _catalogue_category_payload(
                        row,
                        product_count=counts.get((row.name or "").strip().lower(), {}).get("product_count", 0),
                        service_count=counts.get((row.name or "").strip().lower(), {}).get("service_count", 0),
                    )
                    for row in rows
                ]
            }
        )

    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    name = str(data.get("name") or "").strip()
    if not name:
        return JsonResponse({"name": ["required"]}, status=400)
    row_id = data.get("id")
    if row_id:
        row = CatalogueCategory.objects.filter(id=row_id, organization=org).first()
        if not row:
            return JsonResponse({"error": "not_found"}, status=404)
        previous_name = row.name
    else:
        if CatalogueCategory.objects.filter(organization=org).count() >= 25:
            return JsonResponse(
                {
                    "error": "category_limit_reached",
                    "message": "Maximum 25 categories allowed.",
                    "max_categories": 25,
                },
                status=400,
            )
        row = CatalogueCategory(organization=org)
        previous_name = ""
    row.name = name
    row.sort_order = int(data.get("sort_order") or row.sort_order or 0)
    row.is_active = bool(data.get("is_active", True))
    row.save()
    if previous_name and previous_name != row.name:
        CatalogueProduct.objects.filter(organization=org, category=previous_name).update(category=row.name)
    product_count = CatalogueProduct.objects.filter(
        organization=org,
        category=row.name,
        item_type=CatalogueProduct.ITEM_TYPE_PRODUCT,
    ).count()
    service_count = CatalogueProduct.objects.filter(
        organization=org,
        category=row.name,
        item_type=CatalogueProduct.ITEM_TYPE_SERVICE,
    ).count()
    return JsonResponse({"category": _catalogue_category_payload(row, product_count=product_count, service_count=service_count)})


@login_required
@require_http_methods(["DELETE"])
def catalogue_category_detail_api(request, category_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    row = CatalogueCategory.objects.filter(id=category_id, organization=org).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    CatalogueProduct.objects.filter(organization=org, category=row.name).update(category="")
    row.delete()
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET", "POST"])
def digital_card_entries_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)

    company_profile, _ = CompanyProfile.objects.get_or_create(organization=org)
    _ensure_default_card_entry(org, company_profile=company_profile, user=request.user)

    if request.method == "GET":
        query = str(request.GET.get("q") or "").strip()
        scope = str(request.GET.get("scope") or "all").strip().lower()
        if scope not in {"all", "primary", "other"}:
            scope = "all"
        try:
            page = max(1, int(request.GET.get("page") or 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.GET.get("page_size") or 10)
        except (TypeError, ValueError):
            page_size = 10
        page_size = max(5, min(50, page_size))
        qs = DigitalCardEntry.objects.filter(organization=org)
        if scope == "primary":
            qs = qs.filter(is_primary=True)
        elif scope == "other":
            qs = qs.filter(is_primary=False)
        if query:
            qs = qs.filter(
                Q(card_title__icontains=query)
                | Q(person_name__icontains=query)
                | Q(role_title__icontains=query)
                | Q(email__icontains=query)
                | Q(phone__icontains=query)
                | Q(public_slug__icontains=query)
            )
        total = qs.count()
        start = (page - 1) * page_size
        rows = list(qs.order_by("-is_primary", "sort_order", "id")[start:start + page_size])
        total_pages = (total + page_size - 1) // page_size if total else 1
        legacy_card = DigitalCard.objects.filter(company_profile=company_profile).first()
        primary_entry = (
            DigitalCardEntry.objects
            .filter(organization=org, is_primary=True)
            .order_by("sort_order", "id")
            .first()
        )
        return JsonResponse({
            "items": [{**_serialize_card_entry(row), "dns_settings": _dns_settings_payload(request, row.custom_domain)} for row in rows],
            "default_prefill": _card_entry_prefill(
                company_profile,
                default_slug=(legacy_card.public_slug if legacy_card else ""),
                source_entry=primary_entry,
            ),
            "limit": _digital_card_limit_payload(org),
            "dns_defaults": _dns_settings_payload(request, ""),
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
            },
            "scope": scope,
        })

    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)

    row_id = data.get("id")
    is_create = not bool(row_id)
    if row_id:
        row = DigitalCardEntry.objects.filter(id=row_id, organization=org).first()
        if not row:
            return JsonResponse({"error": "not_found"}, status=404)
    else:
        limit = _digital_card_limit_payload(org)
        if not limit["can_create"]:
            return JsonResponse(
                {
                    "error": "addon_required",
                    "message": "Extra digital card requires add-on user purchase.",
                    "limit": limit,
                },
                status=403,
            )
        row = DigitalCardEntry(organization=org, company_profile=company_profile, created_by=request.user)

    public_slug = str(data.get("public_slug") or "").strip()
    slug_source = public_slug or data.get("card_title") or data.get("person_name") or company_profile.company_name or org.name
    if is_create and not public_slug:
        public_slug = _build_unique_card_entry_slug(slug_source)
    elif public_slug:
        if DigitalCardEntry.objects.filter(public_slug=public_slug).exclude(id=row.id).exists() or DigitalCard.objects.filter(public_slug=public_slug).exists():
            public_slug = _build_unique_card_entry_slug(slug_source)
    else:
        public_slug = _build_unique_card_entry_slug(slug_source)

    row.public_slug = public_slug
    row.card_title = str(data.get("card_title") or "").strip()
    row.person_name = str(data.get("person_name") or "").strip()
    row.role_title = str(data.get("role_title") or "").strip()
    row.phone = str(data.get("phone") or "").strip()
    row.whatsapp_number = str(data.get("whatsapp_number") or "").strip()
    row.telephone_number = str(data.get("telephone_number") or "").strip()
    row.email = str(data.get("email") or "").strip()
    row.website = str(data.get("website") or "").strip()
    row.address = str(data.get("address") or "").strip()
    row.description = str(data.get("description") or "").strip()
    row.theme_color = str(data.get("theme_color") or "#22c55e").strip() or "#22c55e"
    row.theme_secondary_color = str(data.get("theme_secondary_color") or "#0f172a").strip() or "#0f172a"
    theme_mode = str(data.get("theme_mode") or "gradient").strip().lower()
    if theme_mode not in ("gradient", "flat"):
        theme_mode = "gradient"
    row.theme_mode = theme_mode
    template_style = str(data.get("template_style") or "design1").strip().lower()
    if template_style not in ("design1", "design2", "design3", "design4", "design5", "design6", "design7", "design8"):
        template_style = "design1"
    row.template_style = template_style
    custom_domain = _normalize_domain(data.get("custom_domain"))
    if custom_domain and not _DOMAIN_RE.match(custom_domain):
        return JsonResponse({"custom_domain": ["invalid_domain"]}, status=400)
    if custom_domain and DigitalCardEntry.objects.filter(custom_domain=custom_domain).exclude(id=row.id).exists():
        return JsonResponse({"custom_domain": ["already_mapped"]}, status=400)
    row.custom_domain = custom_domain
    row.custom_domain_active = bool(custom_domain and data.get("custom_domain_active", False))
    try:
        row.logo_size = max(48, min(180, int(data.get("logo_size") or row.logo_size or 96)))
    except (TypeError, ValueError):
        row.logo_size = 96
    try:
        row.logo_radius_px = max(0, min(999, int(data.get("logo_radius_px") or getattr(row, "logo_radius_px", 28) or 28)))
    except (TypeError, ValueError):
        row.logo_radius_px = 28
    try:
        row.icon_size_pt = max(8, min(36, int(data.get("icon_size_pt") or getattr(row, "icon_size_pt", 14) or 14)))
    except (TypeError, ValueError):
        row.icon_size_pt = 14
    try:
        row.font_size_pt = max(10, min(36, int(data.get("font_size_pt") or getattr(row, "font_size_pt", 16) or 16)))
    except (TypeError, ValueError):
        row.font_size_pt = 16
    row.is_primary = bool(data.get("is_primary", False))
    incoming_logo_image = str(data.get("logo_image_data") or "").strip()
    incoming_banner_image = str(data.get("hero_banner_image_data") or "").strip()
    previous_logo_key = str(getattr(row, "logo_storage_key", "") or "").strip()
    previous_banner_key = str(getattr(row, "hero_banner_storage_key", "") or "").strip()
    current_logo_url = _resolve_card_asset_url(previous_logo_key, row.logo_image_data or "")
    current_banner_url = _resolve_card_asset_url(previous_banner_key, row.hero_banner_image_data or "")
    try:
        if incoming_logo_image.startswith("data:"):
            saved_logo = _save_card_asset_to_object_storage(
                org=org,
                owner=request.user,
                data_url=incoming_logo_image,
                field_name="logo",
                filename_prefix=f"{public_slug or 'card'}-logo",
                max_bytes=800000,
            )
            row.logo_storage_key = saved_logo["storage_key"]
            row.logo_image_data = saved_logo["url"]
            if previous_logo_key and previous_logo_key != row.logo_storage_key:
                _delete_object_storage_asset(org, previous_logo_key)
        elif not incoming_logo_image:
            row.logo_storage_key = ""
            row.logo_image_data = ""
            if previous_logo_key:
                _delete_object_storage_asset(org, previous_logo_key)
        elif incoming_logo_image != current_logo_url:
            row.logo_image_data = incoming_logo_image
            row.logo_storage_key = ""
            if previous_logo_key:
                _delete_object_storage_asset(org, previous_logo_key)

        if incoming_banner_image.startswith("data:"):
            saved_banner = _save_card_asset_to_object_storage(
                org=org,
                owner=request.user,
                data_url=incoming_banner_image,
                field_name="hero_banner",
                filename_prefix=f"{public_slug or 'card'}-banner",
                max_bytes=3000000,
            )
            row.hero_banner_storage_key = saved_banner["storage_key"]
            row.hero_banner_image_data = saved_banner["url"]
            if previous_banner_key and previous_banner_key != row.hero_banner_storage_key:
                _delete_object_storage_asset(org, previous_banner_key)
        elif not incoming_banner_image:
            row.hero_banner_storage_key = ""
            row.hero_banner_image_data = ""
            if previous_banner_key:
                _delete_object_storage_asset(org, previous_banner_key)
        elif incoming_banner_image != current_banner_url:
            row.hero_banner_image_data = incoming_banner_image
            row.hero_banner_storage_key = ""
            if previous_banner_key:
                _delete_object_storage_asset(org, previous_banner_key)
    except ValueError as exc:
        code = str(exc)
        if code in {"unsupported_logo_type", "logo_too_large", "invalid_logo_data"}:
            return JsonResponse({"logo_image_data": [code]}, status=400)
        if code in {"unsupported_hero_banner_type", "hero_banner_too_large", "invalid_hero_banner_data"}:
            return JsonResponse({"hero_banner_image_data": [code]}, status=400)
        return JsonResponse({"error": code}, status=400)
    social_links_items = data.get("social_links_items")
    if isinstance(social_links_items, list):
        row.social_links = {"items": _normalize_social_links_items(social_links_items)}
    row.is_active = bool(data.get("is_active", True))
    try:
        row.sort_order = max(0, int(data.get("sort_order") or 0))
    except (TypeError, ValueError):
        row.sort_order = 0
    row.updated_by = request.user
    if not (row.card_title or row.person_name):
        return JsonResponse({"card_title": ["required"], "person_name": ["required"]}, status=400)
    row.save()
    if row.is_primary:
        DigitalCardEntry.objects.filter(organization=org).exclude(id=row.id).update(is_primary=False)
    elif not DigitalCardEntry.objects.filter(organization=org, is_primary=True).exists():
        row.is_primary = True
        row.save(update_fields=["is_primary", "updated_at"])
    return JsonResponse({
        "item": {**_serialize_card_entry(row), "dns_settings": _dns_settings_payload(request, row.custom_domain)},
        "limit": _digital_card_limit_payload(org),
    })


@login_required
@require_http_methods(["GET"])
def digital_card_visitor_analytics_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    _cleanup_old_digital_card_visits(org)
    range_key = str(request.GET.get("range") or "week").strip().lower()
    if range_key not in {"day", "week", "month"}:
        range_key = "week"
    days_map = {"day": 1, "week": 7, "month": 30}
    now = timezone.now()
    start_at = now - timedelta(days=days_map[range_key])

    query = str(request.GET.get("q") or "").strip()
    try:
        page = max(1, int(request.GET.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get("page_size") or 10)
    except (TypeError, ValueError):
        page_size = 10
    page_size = max(5, min(50, page_size))

    base_qs = DigitalCardVisit.objects.filter(organization=org, visited_at__gte=start_at)
    if query:
        base_qs = base_qs.filter(
            Q(visitor_country__icontains=query)
            | Q(visitor_ip__icontains=query)
            | Q(page_url__icontains=query)
            | Q(page_path__icontains=query)
            | Q(public_slug__icontains=query)
        )

    total_visits = base_qs.count()
    unique_visitors = base_qs.exclude(visitor_key="").values("visitor_key").distinct().count()
    if not unique_visitors:
        unique_visitors = base_qs.exclude(visitor_ip="").values("visitor_ip").distinct().count()

    chart_rows = (
        base_qs
        .annotate(day=TruncDate("visited_at"))
        .values("day")
        .annotate(visits=Count("id"))
        .order_by("day")
    )
    chart = [
        {
            "day": row["day"].isoformat() if row.get("day") else "",
            "label": row["day"].strftime("%d %b") if row.get("day") else "",
            "visits": int(row.get("visits") or 0),
        }
        for row in chart_rows
    ]

    total = total_visits
    start = (page - 1) * page_size
    rows = list(base_qs.order_by("-visited_at", "-id")[start:start + page_size])
    total_pages = (total + page_size - 1) // page_size if total else 1

    return JsonResponse(
        {
            "summary": {
                "range": range_key,
                "days": days_map[range_key],
                "total_visits": total_visits,
                "unique_visitors": unique_visitors,
            },
            "chart": chart,
            "items": [
                {
                    "id": row.id,
                    "visited_at": row.visited_at.isoformat() if row.visited_at else "",
                    "public_slug": row.public_slug or "",
                    "visitor_country": row.visitor_country or "Unknown",
                    "visitor_ip": row.visitor_ip or "",
                    "page_path": row.page_path or "",
                    "page_url": row.page_url or "",
                }
                for row in rows
            ],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
            },
        }
    )


@login_required
@require_http_methods(["GET"])
def digital_card_slug_check_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    raw_slug = str(request.GET.get("slug") or "").strip()
    normalized_slug = slugify(raw_slug)[:220]
    try:
        card_id = int(request.GET.get("id") or 0)
    except (TypeError, ValueError):
        card_id = 0
    if not normalized_slug:
        return JsonResponse(
            {
                "ok": False,
                "available": False,
                "normalized_slug": "",
                "suggested_slug": _build_unique_card_entry_slug(org.name or "card"),
                "message": "Enter a slug to check availability.",
            }
        )

    qs = DigitalCardEntry.objects.filter(public_slug=normalized_slug)
    if card_id:
        qs = qs.exclude(id=card_id)
    exists_in_entries = qs.exists()
    exists_in_legacy = DigitalCard.objects.filter(public_slug=normalized_slug).exists()
    available = not (exists_in_entries or exists_in_legacy)
    suggested = normalized_slug if available else _build_unique_card_entry_slug(normalized_slug)
    return JsonResponse(
        {
            "ok": True,
            "available": available,
            "normalized_slug": normalized_slug,
            "suggested_slug": suggested,
            "message": "Slug is available." if available else "Slug already exists. Use suggested slug.",
        }
    )


@login_required
@require_http_methods(["GET", "DELETE"])
def digital_card_entry_detail_api(request, card_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    row = DigitalCardEntry.objects.filter(id=card_id, organization=org).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    if request.method == "GET":
        item = _serialize_card_entry(row)
        item["dns_settings"] = _dns_settings_payload(request, row.custom_domain)
        return JsonResponse({"item": item})
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    was_primary = bool(row.is_primary)
    deleted, _ = DigitalCardEntry.objects.filter(id=card_id, organization=org).delete()
    if not deleted:
        return JsonResponse({"error": "not_found"}, status=404)
    if was_primary:
        replacement = (
            DigitalCardEntry.objects
            .filter(organization=org)
            .order_by("sort_order", "id")
            .first()
        )
        if replacement and not replacement.is_primary:
            replacement.is_primary = True
            replacement.save(update_fields=["is_primary", "updated_at"])
    return JsonResponse({"status": "deleted", "limit": _digital_card_limit_payload(org)})


def _serialize_card_feedback(row):
    return {
        "id": row.id,
        "public_slug": row.public_slug or "",
        "full_name": row.full_name or "Anonymous",
        "rating": int(row.rating or 0),
        "message": row.message or "",
        "is_approved": bool(row.is_approved),
        "created_at": row.created_at.isoformat() if row.created_at else "",
    }


def _serialize_card_enquiry(row):
    return {
        "id": row.id,
        "public_slug": row.public_slug or "",
        "full_name": row.full_name or "",
        "phone_number": row.phone_number or "",
        "email": row.email or "",
        "message": row.message or "",
        "status": row.status or "new",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


@require_http_methods(["POST"])
@csrf_exempt
def public_card_feedback_submit_api(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    public_slug = str(data.get("public_slug") or "").strip()
    if not public_slug:
        return JsonResponse({"error": "public_slug_required"}, status=400)
    card_entry = DigitalCardEntry.objects.filter(public_slug=public_slug, is_active=True).select_related("organization").first()
    if not card_entry or not card_entry.organization_id:
        return JsonResponse({"error": "not_found"}, status=404)
    full_name = str(data.get("full_name") or "").strip()[:160]
    message = str(data.get("message") or "").strip()[:800]
    try:
        rating = int(data.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    rating = max(1, min(5, rating))
    if not message:
        return JsonResponse({"error": "message_required"}, status=400)
    row = DigitalCardFeedback.objects.create(
        organization=card_entry.organization,
        card_entry=card_entry,
        public_slug=public_slug,
        full_name=full_name,
        rating=rating,
        message=message,
        is_approved=True,
    )
    return JsonResponse({"status": "ok", "item": _serialize_card_feedback(row)})


@require_http_methods(["POST"])
@csrf_exempt
def public_card_enquiry_submit_api(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    public_slug = str(data.get("public_slug") or "").strip()
    if not public_slug:
        return JsonResponse({"error": "public_slug_required"}, status=400)
    card_entry = DigitalCardEntry.objects.filter(public_slug=public_slug, is_active=True).select_related("organization").first()
    if not card_entry or not card_entry.organization_id:
        return JsonResponse({"error": "not_found"}, status=404)
    full_name = str(data.get("full_name") or "").strip()[:160]
    phone_number = str(data.get("phone_number") or "").strip()[:40]
    email = str(data.get("email") or "").strip()[:254]
    message = str(data.get("message") or "").strip()[:1200]
    if not full_name:
        return JsonResponse({"error": "name_required"}, status=400)
    if not message:
        return JsonResponse({"error": "message_required"}, status=400)
    row = DigitalCardEnquiry.objects.create(
        organization=card_entry.organization,
        card_entry=card_entry,
        public_slug=public_slug,
        full_name=full_name,
        phone_number=phone_number,
        email=email,
        message=message,
        status=DigitalCardEnquiry.STATUS_NEW,
    )
    return JsonResponse({"status": "ok", "item": _serialize_card_enquiry(row)})


@login_required
@require_http_methods(["GET"])
def digital_card_feedback_inbox_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    _cleanup_old_feedback_enquiries(org)
    try:
        page = max(1, int(request.GET.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get("page_size") or 20)
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(5, min(50, page_size))
    query = str(request.GET.get("q") or "").strip()
    queryset = DigitalCardFeedback.objects.filter(organization=org, is_deleted=False)
    if query:
        queryset = queryset.filter(
            Q(full_name__icontains=query) | Q(message__icontains=query) | Q(public_slug__icontains=query)
        )
    total = queryset.count()
    start = (page - 1) * page_size
    rows = list(queryset.order_by("-created_at", "-id")[start:start + page_size])
    total_pages = (total + page_size - 1) // page_size if total else 1
    return JsonResponse(
        {
            "items": [_serialize_card_feedback(row) for row in rows],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
            },
            "retention_note": "Only last 1 year feedback entries are maintained. Older entries are auto removed.",
        }
    )


@login_required
@require_http_methods(["DELETE"])
def digital_card_feedback_detail_api(request, feedback_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    row = DigitalCardFeedback.objects.filter(id=feedback_id, organization=org).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    row.is_deleted = True
    row.save(update_fields=["is_deleted", "updated_at"])
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET"])
def digital_card_enquiry_inbox_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    _cleanup_old_feedback_enquiries(org)
    try:
        page = max(1, int(request.GET.get("page") or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get("page_size") or 20)
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(5, min(50, page_size))
    status_filter = str(request.GET.get("status") or "all").strip().lower()
    if status_filter not in {"all", "new", "following", "completed"}:
        status_filter = "all"
    query = str(request.GET.get("q") or "").strip()
    queryset = DigitalCardEnquiry.objects.filter(organization=org, is_deleted=False)
    if status_filter != "all":
        queryset = queryset.filter(status=status_filter)
    if query:
        queryset = queryset.filter(
            Q(full_name__icontains=query)
            | Q(phone_number__icontains=query)
            | Q(email__icontains=query)
            | Q(message__icontains=query)
            | Q(public_slug__icontains=query)
        )
    counts = {
        "new": DigitalCardEnquiry.objects.filter(organization=org, is_deleted=False, status="new").count(),
        "following": DigitalCardEnquiry.objects.filter(organization=org, is_deleted=False, status="following").count(),
        "completed": DigitalCardEnquiry.objects.filter(organization=org, is_deleted=False, status="completed").count(),
    }
    counts["all"] = counts["new"] + counts["following"] + counts["completed"]
    total = queryset.count()
    start = (page - 1) * page_size
    rows = list(queryset.order_by("-created_at", "-id")[start:start + page_size])
    total_pages = (total + page_size - 1) // page_size if total else 1
    return JsonResponse(
        {
            "items": [_serialize_card_enquiry(row) for row in rows],
            "counts": counts,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total,
                "total_pages": total_pages,
            },
            "retention_note": "Only last 1 year enquiry entries are maintained. Older entries are auto removed.",
        }
    )


@login_required
@require_http_methods(["PATCH"])
def digital_card_enquiry_status_api(request, enquiry_id):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    if not _is_org_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    row = DigitalCardEnquiry.objects.filter(id=enquiry_id, organization=org, is_deleted=False).first()
    if not row:
        return JsonResponse({"error": "not_found"}, status=404)
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "invalid_json"}, status=400)
    next_status = str(data.get("status") or "").strip().lower()
    if next_status not in {"new", "following", "completed"}:
        return JsonResponse({"error": "invalid_status"}, status=400)
    row.status = next_status
    row.save(update_fields=["status", "updated_at"])
    return JsonResponse({"status": "ok", "item": _serialize_card_enquiry(row)})


@login_required
@require_http_methods(["GET"])
def digital_card_enquiry_export_api(request):
    org = _get_org(request)
    if not org:
        return JsonResponse({"error": "organization_required", "redirect": "/select-organization/"}, status=403)
    _cleanup_old_feedback_enquiries(org)
    status_filter = str(request.GET.get("status") or "all").strip().lower()
    if status_filter not in {"all", "new", "following", "completed"}:
        status_filter = "all"
    queryset = DigitalCardEnquiry.objects.filter(organization=org, is_deleted=False)
    if status_filter != "all":
        queryset = queryset.filter(status=status_filter)
    rows = list(queryset.order_by("-created_at", "-id"))
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Status", "Name", "Phone", "Email", "Message", "Card Slug"])
    for row in rows:
        writer.writerow(
            [
                row.created_at.isoformat() if row.created_at else "",
                row.status,
                row.full_name,
                row.phone_number,
                row.email,
                row.message,
                row.public_slug,
            ]
        )
    csv_content = output.getvalue()
    output.close()
    response = HttpResponse(csv_content, content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="digital-card-enquiries-{status_filter}.csv"'
    return response
