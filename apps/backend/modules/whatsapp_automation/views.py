from django.shortcuts import get_object_or_404, render

from .models import CataloguePage, CatalogueProduct, DigitalCard, WhatsappSettings


def public_digital_card(request, public_slug):
    digital_card = get_object_or_404(
        DigitalCard.objects.select_related("company_profile", "company_profile__organization"),
        public_slug=public_slug,
        is_active=True,
    )
    company_profile = digital_card.company_profile
    wa_settings = WhatsappSettings.objects.filter(organization=company_profile.organization).first()
    catalogue_page = CataloguePage.objects.filter(company_profile=company_profile).first()
    context = {
        "public_slug": public_slug,
        "company": company_profile,
        "digital_card": digital_card,
        "catalogue_page": catalogue_page,
        "wa_settings": wa_settings,
        "highlights": (company_profile.product_highlights if company_profile else []) or [],
        "theme_color": (digital_card.theme_color or company_profile.theme_color if company_profile else "#22c55e"),
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
