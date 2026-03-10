import hashlib
import re
from datetime import timedelta
from urllib.parse import quote

from django.db import DatabaseError
from django.utils import timezone
from django.shortcuts import get_object_or_404, render

from .models import (
    CatalogueCategory,
    CataloguePage,
    CatalogueProduct,
    DigitalCard,
    DigitalCardEntry,
    DigitalCardFeedback,
    DigitalCardVisit,
    WhatsappSettings,
)
from apps.backend.storage.storage_backend import storage_url


def _normalize_external_url(raw):
    value = str(raw or "").strip()
    if not value:
        return ""
    lowered = value.lower()
    if lowered in {"about:blank", "javascript:void(0)", "javascript:void(0);"}:
        return ""
    if value == "#":
        return "#"
    if value == "/":
        return "/"
    if lowered.startswith("javascript:"):
        return ""
    if value.startswith(("http://", "https://", "mailto:", "tel:")):
        return value
    if value.startswith("//"):
        return f"https:{value}"
    return f"https://{value}"


def _normalize_card_theme_mode(value, fallback="auto"):
    raw = str(value or "").strip().lower()
    if raw in ("auto", "dark", "light"):
        return raw
    if raw in ("gradient", "flat"):
        return fallback
    return fallback


def _normalize_social_links_items(raw):
    if isinstance(raw, dict):
        source = raw.get("items") if isinstance(raw.get("items"), list) else [
            {"label": key, "icon": key, "url": value} for key, value in raw.items() if isinstance(value, str)
        ]
    elif isinstance(raw, list):
        source = raw
    else:
        source = []
    items = []
    for row in source:
        if not isinstance(row, dict):
            continue
        raw_url = str(row.get("url") or "").strip()
        url = _normalize_external_url(raw_url)
        if not url:
            continue
        items.append({
            "type": str(row.get("type") or "preset").strip().lower() or "preset",
            "label": str(row.get("label") or row.get("icon") or "Link").strip(),
            "icon": str(row.get("icon") or "").strip().lower(),
            "url": url,
            "icon_size": max(12, min(64, int(row.get("icon_size") or 20))) if str(row.get("icon_size") or "").strip() else 20,
            "custom_icon_data": str(row.get("custom_icon_data") or "").strip(),
        })
    return items


def _client_ip(request):
    forwarded = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real_ip = str(request.META.get("HTTP_X_REAL_IP") or "").strip()
    if real_ip:
        return real_ip
    return str(request.META.get("REMOTE_ADDR") or "").strip()


def _visitor_country(request):
    for key in ("HTTP_CF_IPCOUNTRY", "HTTP_X_COUNTRY_CODE", "GEOIP_COUNTRY_CODE"):
        value = str(request.META.get(key) or "").strip()
        if value:
            return value[:120]
    return "Unknown"


def _track_card_visit(request, *, org, card_entry, public_slug):
    if not org:
        return
    try:
        cutoff = timezone.now() - timedelta(days=365)
        DigitalCardVisit.objects.filter(organization=org, visited_at__lt=cutoff).delete()
        ip = _client_ip(request)
        user_agent = str(request.META.get("HTTP_USER_AGENT") or "").strip()
        visitor_key = hashlib.sha1(f"{ip}|{user_agent}".encode("utf-8")).hexdigest() if (ip or user_agent) else ""
        page_path = str(getattr(request, "path", "") or "")[:300]
        page_url = str(request.build_absolute_uri() or "")[:2000]
        DigitalCardVisit.objects.create(
            organization=org,
            card_entry=card_entry,
            public_slug=str(public_slug or "")[:220],
            visitor_ip=ip[:80],
            visitor_country=_visitor_country(request),
            visitor_key=visitor_key[:120],
            user_agent=user_agent[:400],
            page_path=page_path,
            page_url=page_url,
        )
    except DatabaseError:
        # Do not block public card rendering if analytics table is not ready.
        return


def _card_visit_count(*, org, card_entry, public_slug):
    if not org:
        return 0
    try:
        queryset = DigitalCardVisit.objects.filter(organization=org)
        if card_entry:
            queryset = queryset.filter(card_entry=card_entry)
        else:
            queryset = queryset.filter(public_slug=public_slug)
        return queryset.count()
    except DatabaseError:
        return 0


def public_digital_card(request, public_slug):
    card_entry = (
        DigitalCardEntry.objects.select_related("company_profile", "organization")
        .filter(public_slug=public_slug, is_active=True)
        .first()
    )
    if card_entry:
        company_profile = card_entry.company_profile
        digital_card = DigitalCard.objects.filter(company_profile=company_profile).first() if company_profile else None
        org = card_entry.organization
    else:
        digital_card = get_object_or_404(
            DigitalCard.objects.select_related("company_profile", "company_profile__organization"),
            public_slug=public_slug,
            is_active=True,
        )
        company_profile = digital_card.company_profile
        org = company_profile.organization if company_profile else None
    wa_settings = WhatsappSettings.objects.filter(organization=company_profile.organization).first() if company_profile else None
    catalogue_page = CataloguePage.objects.filter(company_profile=company_profile).first() if company_profile else None
    items = list(
        CatalogueProduct.objects.filter(organization=company_profile.organization, is_active=True).order_by("category", "sort_order", "id")
    ) if company_profile else []
    categories = list(
        CatalogueCategory.objects.filter(organization=company_profile.organization, is_active=True).order_by("sort_order", "name", "id")
    ) if company_profile else []
    grouped_items = []
    used_category_names = set()
    for category in categories:
        category_items = [item for item in items if (item.category or "").strip() == category.name]
        if not category_items:
            continue
        grouped_items.append({"name": category.name, "items": category_items})
        used_category_names.add(category.name)
    uncategorized = [item for item in items if not (item.category or "").strip() or (item.category or "").strip() not in used_category_names]
    if uncategorized:
        grouped_items.append({"name": "General", "items": uncategorized})
    company_social_links_items = _normalize_social_links_items(getattr(company_profile, "social_links", {}) or {})
    card_social_links_items = _normalize_social_links_items(getattr(card_entry, "social_links", {}) or {}) if card_entry else []
    social_links_items = company_social_links_items or card_social_links_items
    gallery_items = []
    if catalogue_page and isinstance(catalogue_page.gallery_items, list):
        for row in catalogue_page.gallery_items:
            if not isinstance(row, dict):
                continue
            storage_key = str(row.get("storage_key") or "").strip()
            image_url = str(row.get("image_url") or "").strip()
            if storage_key:
                resolved = storage_url(storage_key)
                if resolved:
                    image_url = resolved
            if not image_url:
                continue
            gallery_items.append({
                "id": str(row.get("id") or ""),
                "title": str(row.get("title") or "").strip(),
                "image_url": image_url,
            })
    public_url = request.build_absolute_uri()
    _track_card_visit(request, org=org, card_entry=card_entry, public_slug=public_slug)
    view_count = _card_visit_count(org=org, card_entry=card_entry, public_slug=public_slug)
    resolved_address = (
        (card_entry.address if card_entry and card_entry.address else "")
        or (company_profile.address if company_profile else "")
    )
    address_lines = [part.strip() for part in re.split(r"[\r\n]+", str(resolved_address or "")) if part.strip()]
    address_details = [
        {
            "text": line,
            "map_url": f"https://www.google.com/maps/search/?api=1&query={quote(line, safe='')}",
        }
        for line in address_lines
    ]
    context = {
        "public_slug": public_slug,
        "company": company_profile,
        "digital_card": digital_card,
        "card_entry": card_entry,
        "card_owner_org": org,
        "public_url": public_url,
        "view_count": view_count,
        "save_contact_count": int(getattr(card_entry, "save_contact_count", 0) or 0) if card_entry else 0,
        "catalogue_page": catalogue_page,
        "wa_settings": wa_settings,
        "highlights": ((company_profile.product_highlights if company_profile else []) or []) if isinstance((company_profile.product_highlights if company_profile else []), list) else [],
        "highlights_html": (company_profile.product_highlights if company_profile and isinstance(company_profile.product_highlights, str) else "") or "",
        "catalogue_items": items,
        "grouped_items": grouped_items,
        "theme_color": (
            (card_entry.theme_color if card_entry else "")
            or (digital_card.theme_color if digital_card else "")
            or (company_profile.theme_color if company_profile else "#22c55e")
        ),
        "theme_secondary_color": (
            (getattr(card_entry, "theme_secondary_color", "") if card_entry else "")
            or "#0f172a"
        ),
        "theme_mode": _normalize_card_theme_mode((getattr(card_entry, "theme_mode", "") if card_entry else ""), "auto"),
        "logo_radius_px": (getattr(card_entry, "logo_radius_px", 28) if card_entry else 28) or 28,
        "social_links_items": social_links_items,
        "address_details": address_details,
        "website_url": _normalize_external_url(
            (card_entry.website if card_entry and card_entry.website else "")
            or (company_profile.website if company_profile else "")
        ),
        "gallery_items": gallery_items,
        "feedback_items": [
            {
                "full_name": item.full_name or "Anonymous",
                "rating": max(1, min(5, int(item.rating or 0))),
                "message": item.message or "",
                "created_at": item.created_at,
            }
            for item in DigitalCardFeedback.objects.filter(
                organization=org,
                public_slug=public_slug,
                is_approved=True,
                is_deleted=False,
            ).order_by("-created_at", "-id")[:8]
        ],
    }
    return render(request, "whatsapp_automation/public_card.html", context)


def public_catalogue(request, public_slug):
    catalogue_page = get_object_or_404(
        CataloguePage.objects.select_related("company_profile", "company_profile__organization"),
        public_slug=public_slug,
        is_active=True,
    )
    company_profile = catalogue_page.company_profile
    items = list(
        CatalogueProduct.objects.filter(organization=company_profile.organization, is_active=True)
        .order_by("category", "sort_order", "id")
    )
    categories = list(
        CatalogueCategory.objects.filter(organization=company_profile.organization, is_active=True)
        .order_by("sort_order", "name", "id")
    )
    digital_card = DigitalCard.objects.filter(company_profile=company_profile).first()
    grouped_items = []
    used_category_names = set()
    for category in categories:
        category_items = [item for item in items if (item.category or "").strip() == category.name]
        if not category_items:
            continue
        grouped_items.append({
            "name": category.name,
            "items": category_items,
        })
        used_category_names.add(category.name)
    uncategorized = [item for item in items if not (item.category or "").strip() or (item.category or "").strip() not in used_category_names]
    if uncategorized:
        grouped_items.append({
            "name": "General",
            "items": uncategorized,
        })
    context = {
        "public_slug": public_slug,
        "company": company_profile,
        "catalogue_page": catalogue_page,
        "digital_card": digital_card,
        "items": items,
        "grouped_items": grouped_items,
        "theme_color": (company_profile.theme_color if company_profile else "#22c55e"),
    }
    return render(request, "whatsapp_automation/public_catalogue.html", context)
