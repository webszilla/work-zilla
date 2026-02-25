from django.conf import settings
from django.db import models
from django.utils.text import slugify

from core.models import Organization


def _company_logo_upload_to(instance, filename):
    return f"whatsapp_automation/org_{instance.organization_id}/company/{filename}"


def _catalogue_image_upload_to(instance, filename):
    return f"whatsapp_automation/org_{instance.organization_id}/catalogue/{filename}"


class CompanyProfile(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="wa_company_profile")
    company_name = models.CharField(max_length=200, blank=True, default="")
    logo = models.ImageField(upload_to=_company_logo_upload_to, null=True, blank=True)
    phone = models.CharField(max_length=40, blank=True, default="")
    whatsapp_number = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    social_links = models.JSONField(default=dict, blank=True)
    theme_color = models.CharField(max_length=20, blank=True, default="#22c55e")
    product_highlights = models.JSONField(default=list, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wa_company_profile_updates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("organization_id",)

    def __str__(self):
        return f"CompanyProfile org={self.organization_id}"


class DigitalCard(models.Model):
    company_profile = models.OneToOneField(CompanyProfile, on_delete=models.CASCADE, related_name="digital_card")
    public_slug = models.SlugField(max_length=220, unique=True)
    theme_color = models.CharField(max_length=20, blank=True, default="#22c55e")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"DigitalCard {self.public_slug}"


class DigitalCardEntry(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_digital_card_entries")
    company_profile = models.ForeignKey(
        CompanyProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="digital_card_entries",
    )
    public_slug = models.SlugField(max_length=220, unique=True)
    card_title = models.CharField(max_length=200, blank=True, default="")
    person_name = models.CharField(max_length=200, blank=True, default="")
    role_title = models.CharField(max_length=200, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    whatsapp_number = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    social_links = models.JSONField(default=dict, blank=True)
    theme_color = models.CharField(max_length=20, blank=True, default="#22c55e")
    template_style = models.CharField(max_length=20, blank=True, default="design1")
    custom_domain = models.CharField(max_length=255, blank=True, default="")
    custom_domain_active = models.BooleanField(default=False)
    logo_image_data = models.TextField(blank=True, default="")
    hero_banner_image_data = models.TextField(blank=True, default="")
    logo_size = models.PositiveSmallIntegerField(default=96)
    icon_size_pt = models.PositiveSmallIntegerField(default=14)
    font_size_pt = models.PositiveSmallIntegerField(default=16)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wa_digital_card_entries_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wa_digital_card_entries_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.organization_id}:{self.public_slug}"


class CataloguePage(models.Model):
    company_profile = models.OneToOneField(CompanyProfile, on_delete=models.CASCADE, related_name="catalogue_page")
    public_slug = models.SlugField(max_length=220, unique=True)
    about_title = models.CharField(max_length=120, blank=True, default="About Us")
    about_content = models.TextField(blank=True, default="")
    services_title = models.CharField(max_length=120, blank=True, default="Services")
    services_content = models.TextField(blank=True, default="")
    contact_title = models.CharField(max_length=120, blank=True, default="Contact")
    contact_note = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CataloguePage {self.public_slug}"


class WhatsappSettings(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="wa_settings")
    company_profile = models.OneToOneField(
        CompanyProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="whatsapp_settings",
    )
    welcome_message = models.TextField(
        blank=True,
        default="Hi 👋 Welcome to our business.\nReply:\n1 - View Products\n2 - Price Details\n3 - Contact Support",
    )
    auto_reply_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"WhatsappSettings org={self.organization_id}"


class AutomationRule(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_automation_rules")
    keyword = models.CharField(max_length=120, blank=True, default="")
    reply_message = models.TextField(blank=True, default="")
    is_default = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.organization_id}:{self.keyword or 'default'}"


class CatalogueProduct(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_catalogue_products")
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to=_catalogue_image_upload_to, null=True, blank=True)
    price = models.CharField(max_length=80, blank=True, default="")
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=120, blank=True, default="")
    order_button_enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.organization_id}:{self.title}"


def build_unique_public_slug(model_cls, base_text, fallback_prefix="page"):
    base = slugify(base_text or "")[:180] or f"{fallback_prefix}"
    candidate = base
    counter = 2
    while model_cls.objects.filter(public_slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: max(1, 220 - len(suffix))]}{suffix}"
        counter += 1
    return candidate
