from django.shortcuts import get_object_or_404, render

from .models import CataloguePage, CatalogueProduct, DigitalCard, DigitalCardEntry, WhatsappSettings


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
        url = str(row.get("url") or "").strip()
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
    social_links_raw = (
        getattr(card_entry, "social_links", None)
        if card_entry is not None
        else getattr(company_profile, "social_links", {})
    ) or {}
    context = {
        "public_slug": public_slug,
        "company": company_profile,
        "digital_card": digital_card,
        "card_entry": card_entry,
        "card_owner_org": org,
        "catalogue_page": catalogue_page,
        "wa_settings": wa_settings,
        "highlights": (company_profile.product_highlights if company_profile else []) or [],
        "theme_color": (
            (card_entry.theme_color if card_entry else "")
            or (digital_card.theme_color if digital_card else "")
            or (company_profile.theme_color if company_profile else "#22c55e")
        ),
        "social_links_items": _normalize_social_links_items(social_links_raw),
    }
    return render(request, "whatsapp_automation/public_card.html", context)


def public_catalogue(request, public_slug):
    catalogue_page = get_object_or_404(
        CataloguePage.objects.select_related("company_profile", "company_profile__organization"),
        public_slug=public_slug,
        is_active=True,
    )
    company_profile = catalogue_page.company_profile
    items = CatalogueProduct.objects.filter(organization=company_profile.organization, is_active=True).order_by("sort_order", "id")
    digital_card = DigitalCard.objects.filter(company_profile=company_profile).first()
    services_list = []
    if catalogue_page and catalogue_page.services_content:
        services_list = [line.strip(" -\t") for line in (catalogue_page.services_content or "").splitlines() if line.strip()]
    context = {
        "public_slug": public_slug,
        "company": company_profile,
        "catalogue_page": catalogue_page,
        "digital_card": digital_card,
        "items": items,
        "services_list": services_list,
        "theme_color": (company_profile.theme_color if company_profile else "#22c55e"),
    }
    return render(request, "whatsapp_automation/public_catalogue.html", context)
