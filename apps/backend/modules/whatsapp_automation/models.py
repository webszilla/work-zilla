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
    country = models.CharField(max_length=120, blank=True, default="")
    state = models.CharField(max_length=120, blank=True, default="")
    postal_code = models.CharField(max_length=40, blank=True, default="")
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
    THEME_MODE_GRADIENT = "gradient"
    THEME_MODE_FLAT = "flat"
    THEME_MODE_CHOICES = (
        (THEME_MODE_GRADIENT, "Gradient"),
        (THEME_MODE_FLAT, "Flat"),
    )

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
    telephone_number = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    description = models.TextField(blank=True, default="")
    seo_title = models.CharField(max_length=60, blank=True, default="")
    seo_description = models.CharField(max_length=160, blank=True, default="")
    social_links = models.JSONField(default=dict, blank=True)
    theme_color = models.CharField(max_length=20, blank=True, default="#22c55e")
    theme_secondary_color = models.CharField(max_length=20, blank=True, default="#0f172a")
    theme_mode = models.CharField(max_length=16, choices=THEME_MODE_CHOICES, blank=True, default=THEME_MODE_GRADIENT)
    template_style = models.CharField(max_length=20, blank=True, default="design1")
    custom_domain = models.CharField(max_length=255, blank=True, default="")
    custom_domain_active = models.BooleanField(default=False)
    logo_storage_key = models.TextField(blank=True, default="")
    hero_banner_storage_key = models.TextField(blank=True, default="")
    logo_image_data = models.TextField(blank=True, default="")
    hero_banner_image_data = models.TextField(blank=True, default="")
    logo_size = models.PositiveSmallIntegerField(default=96)
    logo_radius_px = models.PositiveSmallIntegerField(default=28)
    icon_size_pt = models.PositiveSmallIntegerField(default=14)
    font_size_pt = models.PositiveSmallIntegerField(default=16)
    save_contact_count = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)
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


class DigitalCardVisit(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_digital_card_visits")
    card_entry = models.ForeignKey(
        DigitalCardEntry,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="visits",
    )
    public_slug = models.SlugField(max_length=220, blank=True, default="")
    visitor_ip = models.CharField(max_length=80, blank=True, default="")
    visitor_country = models.CharField(max_length=120, blank=True, default="Unknown")
    visitor_key = models.CharField(max_length=120, blank=True, default="")
    user_agent = models.CharField(max_length=400, blank=True, default="")
    page_path = models.CharField(max_length=300, blank=True, default="")
    page_url = models.TextField(blank=True, default="")
    visited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-visited_at", "-id")
        indexes = [
            models.Index(fields=["organization", "visited_at"]),
            models.Index(fields=["organization", "visitor_key", "visited_at"]),
            models.Index(fields=["card_entry", "visited_at"]),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.public_slug}:{self.visited_at.isoformat()}"


class CataloguePage(models.Model):
    company_profile = models.OneToOneField(CompanyProfile, on_delete=models.CASCADE, related_name="catalogue_page")
    public_slug = models.SlugField(max_length=220, unique=True)
    about_title = models.CharField(max_length=120, blank=True, default="About Us")
    about_content = models.TextField(blank=True, default="")
    services_title = models.CharField(max_length=120, blank=True, default="Services")
    services_content = models.TextField(blank=True, default="")
    contact_title = models.CharField(max_length=120, blank=True, default="Contact")
    contact_note = models.TextField(blank=True, default="")
    gallery_title = models.CharField(max_length=120, blank=True, default="Gallery")
    gallery_items = models.JSONField(default=list, blank=True)
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


class CatalogueCategory(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_catalogue_categories")
    name = models.CharField(max_length=120)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "name", "id")
        unique_together = ("organization", "name")

    def __str__(self):
        return f"{self.organization_id}:{self.name}"


class CatalogueProduct(models.Model):
    ITEM_TYPE_PRODUCT = "product"
    ITEM_TYPE_SERVICE = "service"
    ITEM_TYPE_CHOICES = (
        (ITEM_TYPE_PRODUCT, "Product"),
        (ITEM_TYPE_SERVICE, "Service"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_catalogue_products")
    title = models.CharField(max_length=200)
    image = models.ImageField(upload_to=_catalogue_image_upload_to, null=True, blank=True)
    item_type = models.CharField(max_length=20, choices=ITEM_TYPE_CHOICES, default=ITEM_TYPE_PRODUCT)
    price = models.CharField(max_length=80, blank=True, default="")
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=120, blank=True, default="")
    order_button_enabled = models.BooleanField(default=True)
    call_button_enabled = models.BooleanField(default=True)
    whatsapp_button_enabled = models.BooleanField(default=True)
    enquiry_button_enabled = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")

    def __str__(self):
        return f"{self.organization_id}:{self.title}"


class MarketingContact(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_marketing_contacts")
    name = models.CharField(max_length=160, blank=True, default="")
    phone_number = models.CharField(max_length=40)
    email = models.EmailField(blank=True, default="")
    tags = models.CharField(max_length=240, blank=True, default="")
    is_opted_in = models.BooleanField(default=False)
    opt_in_source = models.CharField(max_length=120, blank=True, default="")
    consent_note = models.TextField(blank=True, default="")
    has_opted_out = models.BooleanField(default=False)
    opt_out_reason = models.CharField(max_length=160, blank=True, default="")
    opt_in_at = models.DateTimeField(null=True, blank=True)
    opted_out_at = models.DateTimeField(null=True, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at", "-id")
        indexes = [
            models.Index(fields=["organization", "phone_number"]),
            models.Index(fields=["organization", "is_opted_in", "has_opted_out"]),
        ]
        unique_together = ("organization", "phone_number")

    def __str__(self):
        return f"{self.organization_id}:{self.phone_number}"


class MarketingCampaign(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_SENT = "sent"
    STATUS_PARTIAL = "partial"
    STATUS_BLOCKED = "blocked"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_SENT, "Sent"),
        (STATUS_PARTIAL, "Partial"),
        (STATUS_BLOCKED, "Blocked"),
        (STATUS_FAILED, "Failed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_marketing_campaigns")
    name = models.CharField(max_length=180)
    template_name = models.CharField(max_length=180)
    template_variables = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    total_contacts = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    compliance_note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="wa_marketing_campaigns_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "created_at"]),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.name}"


class MarketingCampaignDelivery(models.Model):
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_SKIPPED = "skipped"
    STATUS_CHOICES = (
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
        (STATUS_SKIPPED, "Skipped"),
    )

    campaign = models.ForeignKey(MarketingCampaign, on_delete=models.CASCADE, related_name="deliveries")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_marketing_deliveries")
    contact = models.ForeignKey(
        MarketingContact,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="campaign_deliveries",
    )
    phone_number = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    error_code = models.CharField(max_length=120, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    attempted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-attempted_at", "-id")
        indexes = [
            models.Index(fields=["organization", "status", "attempted_at"]),
            models.Index(fields=["campaign", "status"]),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.phone_number}:{self.status}"


class DigitalCardFeedback(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_digital_card_feedbacks")
    card_entry = models.ForeignKey(
        DigitalCardEntry,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="feedbacks",
    )
    public_slug = models.SlugField(max_length=220, blank=True, default="")
    full_name = models.CharField(max_length=160, blank=True, default="")
    rating = models.PositiveSmallIntegerField(default=5)
    message = models.TextField(blank=True, default="")
    is_approved = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["organization", "is_approved", "is_deleted"]),
            models.Index(fields=["public_slug", "created_at"]),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.public_slug}:{self.id}"


class DigitalCardEnquiry(models.Model):
    STATUS_NEW = "new"
    STATUS_FOLLOWING = "following"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = (
        (STATUS_NEW, "New"),
        (STATUS_FOLLOWING, "Following"),
        (STATUS_COMPLETED, "Completed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="wa_digital_card_enquiries")
    card_entry = models.ForeignKey(
        DigitalCardEntry,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="enquiries",
    )
    public_slug = models.SlugField(max_length=220, blank=True, default="")
    full_name = models.CharField(max_length=160, blank=True, default="")
    phone_number = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    message = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["organization", "status", "created_at"]),
            models.Index(fields=["organization", "is_deleted", "created_at"]),
            models.Index(fields=["public_slug", "created_at"]),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.public_slug}:{self.status}:{self.id}"


def build_unique_public_slug(model_cls, base_text, fallback_prefix="page"):
    base = slugify(base_text or "")[:180] or f"{fallback_prefix}"
    candidate = base
    counter = 2
    while model_cls.objects.filter(public_slug=candidate).exists():
        suffix = f"-{counter}"
        candidate = f"{base[: max(1, 220 - len(suffix))]}{suffix}"
        counter += 1
    return candidate
