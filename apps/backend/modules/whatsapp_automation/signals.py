from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CataloguePage, CompanyProfile, DigitalCard, WhatsappSettings, build_unique_public_slug


def _company_display_name(company_profile):
    return (
        (company_profile.company_name or "").strip()
        or (getattr(company_profile.organization, "name", "") or "").strip()
        or f"org-{company_profile.organization_id}"
    )


def _build_default_welcome(company_profile, card_slug, catalogue_slug):
    company_name = _company_display_name(company_profile)
    return (
        f"Hi 👋 Welcome to {company_name}.\n"
        "View our products:\n"
        f"/catalogue/{catalogue_slug}/\n\n"
        "Save our digital card:\n"
        f"/card/{card_slug}/\n\n"
        "Reply anytime for support."
    )


@receiver(post_save, sender=CompanyProfile, dispatch_uid="wa.company_profile.autocreate_assets")
def ensure_company_profile_assets(sender, instance, created, **kwargs):
    company_name = _company_display_name(instance)
    base_slug = company_name

    digital_card = getattr(instance, "digital_card", None)
    if not digital_card:
        DigitalCard.objects.create(
            company_profile=instance,
            public_slug=build_unique_public_slug(DigitalCard, base_slug, fallback_prefix=f"card-{instance.organization_id}"),
            theme_color=(instance.theme_color or "#22c55e"),
            is_active=True,
        )
        digital_card = instance.digital_card
    elif created and not digital_card.theme_color and instance.theme_color:
        digital_card.theme_color = instance.theme_color
        digital_card.save(update_fields=["theme_color", "updated_at"])

    catalogue_page = getattr(instance, "catalogue_page", None)
    if not catalogue_page:
        CataloguePage.objects.create(
            company_profile=instance,
            public_slug=build_unique_public_slug(CataloguePage, base_slug, fallback_prefix=f"catalogue-{instance.organization_id}"),
            is_active=True,
        )
        catalogue_page = instance.catalogue_page

    wa_settings = WhatsappSettings.objects.filter(organization=instance.organization).first()
    if not wa_settings:
        WhatsappSettings.objects.create(
            organization=instance.organization,
            company_profile=instance,
            welcome_message=_build_default_welcome(instance, digital_card.public_slug, catalogue_page.public_slug),
            auto_reply_enabled=True,
        )
    elif wa_settings.company_profile_id is None:
        wa_settings.company_profile = instance
        wa_settings.save(update_fields=["company_profile", "updated_at"])
