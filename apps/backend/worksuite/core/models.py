import os
import re
import secrets
import uuid

from django.db import models
from django.db.models import Q
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver
from django.conf import settings
from django.utils import timezone
from datetime import timedelta


def _generate_chat_code():
    return secrets.token_hex(8)


def _chat_attachment_upload_to(instance, filename):
    safe_name = os.path.basename(filename or "attachment")
    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    conversation_id = instance.conversation_id or "unknown"
    return f"chat_attachments/{conversation_id}/{stamp}_{safe_name}"


def _ai_media_library_upload_to(instance, filename):
    safe_name = os.path.basename(filename or "document")
    stamp = timezone.now().strftime("%Y%m%d%H%M%S")
    org_id = instance.organization_id or "unknown"
    return f"ai_media_library/{org_id}/{stamp}_{safe_name}"


def _screenshot_upload_to(instance, filename):
    safe_name = os.path.basename(filename or "screenshot.jpg")
    org_id = None
    try:
        org_id = instance.employee.org_id
    except Exception:
        org_id = None
    org_part = str(org_id or "unknown")
    return f"screenshots/{org_part}/{safe_name}"


class Organization(models.Model):
    name = models.CharField(max_length=200)
    company_key = models.CharField(max_length=100, unique=True)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="owned_organization",
    )
    referral_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    referred_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referred_organizations",
    )
    referred_by_dealer = models.ForeignKey(
        "DealerAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referred_organizations",
    )
    referred_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Employee(models.Model):
    org = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    email = models.EmailField(null=True, blank=True)
    pc_name = models.CharField(max_length=200, null=True, blank=True)
    device_id = models.CharField(max_length=200, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def last_seen(self):
        last = Activity.objects.filter(employee=self).order_by('-end_time').first()
        return last.end_time if last else None

    @property
    def is_online(self):
        if not self.last_seen:
            return False
        return timezone.now() - self.last_seen < timedelta(minutes=2)

    def __str__(self):
        return f"{self.name} ({self.org.name})"


class Device(models.Model):
    device_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    org = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="devices")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    device_name = models.CharField(max_length=200, blank=True, default="")
    os_info = models.CharField(max_length=200, blank=True, default="")
    app_version = models.CharField(max_length=50, blank=True, default="")
    last_seen = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["org", "user", "is_active"]),
            models.Index(fields=["user", "last_seen"]),
        ]

    def __str__(self):
        return f"{self.device_id} ({self.user_id})"


class Activity(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    app_name = models.CharField(max_length=255)
    window_title = models.TextField(blank=True, null=True)
    url = models.TextField(blank=True, null=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()

    def __str__(self):
        return f"{self.employee.name} - {self.app_name}"


class MonitorStopEvent(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="monitor_stop_events")
    reason = models.CharField(max_length=255, blank=True, default="")
    stopped_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["employee", "stopped_at"]),
        ]

    def __str__(self):
        return f"{self.employee.name} - {self.stopped_at}"


class Screenshot(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    employee_name = models.CharField(max_length=200, blank=True, default="")
    image = models.ImageField(upload_to=_screenshot_upload_to)
    captured_at = models.DateTimeField(auto_now_add=True)
    pc_captured_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        display_name = self.employee_name or self.employee.name
        return f"{display_name} - {self.captured_at}"


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ("superadmin", "Super Admin"),
        ("company_admin", "Company Admin"),
        ("org_user", "Org User"),
        ("hr_view", "HR View"),
        ("ai_chatbot_agent", "AI Chatbot Agent"),
        ("dealer", "Dealer"),
    )
    AGENT_ROLE_CHOICES = (
        ("sales", "Sales"),
        ("support", "Support"),
        ("both", "Both"),
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="company_admin")
    agent_role = models.CharField(
        max_length=20,
        choices=AGENT_ROLE_CHOICES,
        default="support",
        null=True,
        blank=True,
    )
    phone_number = models.CharField(max_length=30, blank=True)

    # Important ➜ link user to organization
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.role}"


class ChatWidget(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    widget_key = models.CharField(max_length=64, unique=True)
    public_chat_code = models.CharField(max_length=32, unique=True, default=_generate_chat_code)
    theme_preset = models.CharField(max_length=40, default="emerald")
    theme_primary = models.CharField(max_length=20, blank=True, default="")
    theme_accent = models.CharField(max_length=20, blank=True, default="")
    theme_background = models.CharField(max_length=20, blank=True, default="")
    allowed_domains = models.TextField(blank=True, default="")
    product_slug = models.CharField(max_length=50, default="ai-chatbot")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.organization.name})"


class ChatConversation(models.Model):
    class ChatType(models.TextChoices):
        SALES = "sales", "Sales"
        SUPPORT = "support", "Support"
    
    STATUS_CHOICES = (
        ("open", "Open"),
        ("in-progress", "In Progress"),
        ("closed", "Closed"),
    )
    SOURCE_CHOICES = (
        ("widget_embed", "Widget Embed"),
        ("public_page", "Public Page"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    widget = models.ForeignKey(ChatWidget, on_delete=models.CASCADE)
    visitor_id = models.CharField(max_length=120)
    visitor_name = models.CharField(max_length=120, blank=True, default="")
    visitor_email = models.EmailField(blank=True, default="")
    visitor_phone = models.CharField(max_length=40, blank=True, default="")
    category = models.CharField(max_length=20, choices=ChatType.choices, null=True, blank=True)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="widget_embed")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    active_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="active_conversations",
    )
    last_message_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["widget", "visitor_id", "status"]),
        ]

    def __str__(self):
        return f"{self.widget.name} - {self.visitor_id}"


class ChatMessage(models.Model):
    SENDER_CHOICES = (
        ("visitor", "Visitor"),
        ("bot", "Bot"),
        ("agent", "Agent"),
    )

    conversation = models.ForeignKey(ChatConversation, on_delete=models.CASCADE)
    sender_type = models.CharField(max_length=20, choices=SENDER_CHOICES)
    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_messages",
    )
    text = models.TextField()
    attachment = models.FileField(upload_to=_chat_attachment_upload_to, null=True, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True, default="")
    attachment_type = models.CharField(max_length=120, blank=True, default="")
    attachment_size = models.PositiveIntegerField(default=0)
    ai_model = models.CharField(max_length=80, null=True, blank=True)
    tokens_in = models.PositiveIntegerField(default=0)
    tokens_out = models.PositiveIntegerField(default=0)
    tokens_total = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender_type} - {self.created_at}"


class AiMediaLibraryItem(models.Model):
    class MediaType(models.TextChoices):
        PDF = "pdf", "PDF"
        WORD = "word", "Word"
        TEXT = "text", "Text"
        WEBSITE_DATA = "word_website_data", "Website Data"
        EXTRA_TEXT = "extra_text", "Extra Text"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=30, choices=MediaType.choices)
    source_url = models.URLField(max_length=500, blank=True, null=True)
    file_path = models.FileField(upload_to=_ai_media_library_upload_to, null=True, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    text_content = models.TextField(blank=True, default="")
    is_auto_generated = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_media_library_items",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "created_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "type"],
                condition=models.Q(type="word_website_data"),
                name="unique_org_website_data",
            )
        ]

    def __str__(self):
        return f"{self.organization_id} - {self.name}"


class AiFaq(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    question = models.TextField()
    answer = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "created_at"]),
        ]

    def __str__(self):
        return f"{self.organization_id} - {self.question[:60]}"


class ChatTransferLog(models.Model):
    conversation = models.ForeignKey(
        ChatConversation,
        on_delete=models.CASCADE,
        related_name="transfer_logs",
    )
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    from_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_transfers_from",
    )
    to_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_transfers_to",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["conversation", "created_at"]),
        ]

    def __str__(self):
        return f"{self.conversation_id} {self.from_agent_id} -> {self.to_agent_id}"


class ChatLead(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    widget = models.ForeignKey(ChatWidget, on_delete=models.CASCADE)
    conversation = models.ForeignKey(ChatConversation, on_delete=models.SET_NULL, null=True, blank=True)
    visitor_id = models.CharField(max_length=120)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40)
    email = models.EmailField(blank=True)
    message = models.TextField(blank=True)
    source_url = models.TextField(blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["widget", "created_at"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.phone}"


class ChatEnquiryLead(models.Model):
    STATUS_CHOICES = (
        ("fresh", "Fresh"),
        ("following", "Following"),
        ("completed", "Completed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True)
    widget = models.ForeignKey(ChatWidget, on_delete=models.SET_NULL, null=True, blank=True)
    site_domain = models.CharField(max_length=200, blank=True)
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    message = models.TextField(blank=True)
    page_url = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="fresh")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["widget", "created_at"]),
        ]

    def __str__(self):
        return f"{self.name} - {self.email}"


class AiUsageCounter(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    product_slug = models.CharField(max_length=50, default="ai-chatbot")
    period_yyyymm = models.CharField(max_length=6)
    ai_replies_used = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("organization", "product_slug", "period_yyyymm")

    def __str__(self):
        return f"{self.organization.name} {self.product_slug} {self.period_yyyymm}"


class AiUsageMonthly(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    product_slug = models.CharField(max_length=50, default="ai-chatbot")
    period_yyyymm = models.CharField(max_length=6)
    ai_replies_used = models.PositiveIntegerField(default=0)
    tokens_total = models.PositiveIntegerField(default=0)
    cost_usd_total = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    cost_inr_total = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    request_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "product_slug", "period_yyyymm")
        indexes = [
            models.Index(fields=["period_yyyymm"]),
            models.Index(fields=["organization", "period_yyyymm"]),
        ]

    def __str__(self):
        return f"{self.organization.name} {self.product_slug} {self.period_yyyymm}"


class AiUsageEvent(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    product_slug = models.CharField(max_length=50, default="ai-chatbot")
    period_yyyymm = models.CharField(max_length=6)
    model = models.CharField(max_length=80, blank=True)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    cost_inr = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    conversation = models.ForeignKey(ChatConversation, on_delete=models.SET_NULL, null=True, blank=True)
    message = models.ForeignKey(ChatMessage, on_delete=models.SET_NULL, null=True, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "period_yyyymm"]),
            models.Index(fields=["organization", "created_at"]),
        ]

    def __str__(self):
        return f"{self.organization.name} {self.product_slug} {self.period_yyyymm}"


@receiver(pre_save, sender=AiMediaLibraryItem)
def ai_media_library_replace_file(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        previous = AiMediaLibraryItem.objects.get(pk=instance.pk)
    except AiMediaLibraryItem.DoesNotExist:
        return
    if previous.file_path and previous.file_path != instance.file_path:
        previous.file_path.delete(save=False)


@receiver(post_delete, sender=AiMediaLibraryItem)
def ai_media_library_delete_file(sender, instance, **kwargs):
    if instance.file_path:
        instance.file_path.delete(save=False)


@receiver(pre_delete, sender=Organization)
def delete_org_users(sender, instance, **kwargs):
    BillingProfile.objects.filter(organization=instance).filter(
        Q(org_display_name="") | Q(org_display_name__isnull=True)
    ).update(
        org_display_name=instance.name,
        org_company_key=instance.company_key,
    )
    BillingProfile.objects.filter(organization=instance).filter(
        Q(org_company_key="") | Q(org_company_key__isnull=True)
    ).update(org_company_key=instance.company_key)
    PendingTransfer.objects.filter(organization=instance).filter(
        Q(org_display_name="") | Q(org_display_name__isnull=True)
    ).update(
        org_display_name=instance.name,
        org_company_key=instance.company_key,
    )
    PendingTransfer.objects.filter(organization=instance).filter(
        Q(org_company_key="") | Q(org_company_key__isnull=True)
    ).update(org_company_key=instance.company_key)
    SubscriptionHistory.objects.filter(organization=instance).filter(
        Q(org_display_name="") | Q(org_display_name__isnull=True)
    ).update(
        org_display_name=instance.name,
        org_company_key=instance.company_key,
    )
    SubscriptionHistory.objects.filter(organization=instance).filter(
        Q(org_company_key="") | Q(org_company_key__isnull=True)
    ).update(org_company_key=instance.company_key)

    BillingProfile.objects.filter(organization=instance).update(organization=None)
    PendingTransfer.objects.filter(organization=instance).update(organization=None)
    SubscriptionHistory.objects.filter(organization=instance).update(organization=None)

    profiles = UserProfile.objects.select_related("user").filter(organization=instance)
    for profile in profiles:
        user = profile.user
        if user and user.is_superuser:
            if profile.organization_id is not None:
                profile.organization = None
                profile.save(update_fields=["organization"])
            continue
        if user:
            user.delete()


@receiver(post_delete, sender=ChatMessage)
def chat_message_attachment_delete(sender, instance, **kwargs):
    if instance.attachment:
        instance.attachment.delete(save=False)


class Plan(models.Model):
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plans",
    )
    name = models.CharField(max_length=100)
    price = models.FloatField(default=0)
    monthly_price = models.FloatField(null=True, blank=True)
    yearly_price = models.FloatField(null=True, blank=True)
    usd_monthly_price = models.FloatField(null=True, blank=True, verbose_name="USD monthly price")
    usd_yearly_price = models.FloatField(null=True, blank=True, verbose_name="USD yearly price")
    addon_monthly_price = models.FloatField(null=True, blank=True)
    addon_yearly_price = models.FloatField(null=True, blank=True)
    addon_usd_monthly_price = models.FloatField(null=True, blank=True, verbose_name="Addon USD monthly price")
    addon_usd_yearly_price = models.FloatField(null=True, blank=True, verbose_name="Addon USD yearly price")
    employee_limit = models.IntegerField(default=5)
    device_limit = models.PositiveSmallIntegerField(default=1)
    duration_months = models.IntegerField(default=1)
    retention_days = models.PositiveSmallIntegerField(default=30)
    allow_addons = models.BooleanField(default=True)
    screenshot_min_minutes = models.PositiveSmallIntegerField(
        default=5,
        choices=(
            (1, "1 minute"),
            (2, "2 minutes"),
            (3, "3 minutes"),
            (5, "5 minutes"),
            (10, "10 minutes"),
            (15, "15 minutes"),
            (20, "20 minutes"),
            (30, "30 minutes"),
        )
    )
    allow_app_usage = models.BooleanField(default=False)
    allow_gaming_ott_usage = models.BooleanField(default=False)
    allow_hr_view = models.BooleanField(default=False)
    included_agents = models.PositiveSmallIntegerField(default=0)
    addon_agent_monthly_price = models.FloatField(null=True, blank=True)
    addon_agent_yearly_price = models.FloatField(null=True, blank=True)
    ai_library_limit_mb = models.PositiveIntegerField(null=True, blank=True, help_text="AI library storage limit in MB. Leave empty for unlimited.")
    website_page_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Maximum website pages allowed for AI import. Leave empty for unlimited.")
    limits = models.JSONField(default=dict, blank=True)
    addons = models.JSONField(default=dict, blank=True)
    features = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class ThemeSettings(models.Model):
    primary_color = models.CharField(max_length=20, default="#e11d48")
    secondary_color = models.CharField(max_length=20, default="#f59e0b")

    class Meta:
        verbose_name = "Theme Settings"
        verbose_name_plural = "Theme Settings"

    def __str__(self):
        return "Theme Settings"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            id=1,
            defaults={
                "primary_color": "#e11d48",
                "secondary_color": "#f59e0b",
            },
        )
        return obj


class ReferralSettings(models.Model):
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    dealer_commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5)
    dealer_subscription_amount = models.DecimalField(max_digits=12, decimal_places=2, default=750)
    dealer_referral_flat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Referral Settings"
        verbose_name_plural = "Referral Settings"

    def __str__(self):
        return f"Referral Commission {self.commission_rate}%"

    @classmethod
    def get_active(cls):
        obj, _ = cls.objects.get_or_create(
            id=1,
            defaults={
                "commission_rate": 5,
                "dealer_commission_rate": 5,
                "dealer_subscription_amount": 750,
                "dealer_referral_flat_amount": 0,
            },
        )
        return obj


class DealerAccount(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("active", "Active"),
        ("expired", "Expired"),
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    referral_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    referred_by = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referred_dealers",
    )
    referred_at = models.DateTimeField(null=True, blank=True)
    subscription_status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="pending",
    )
    subscription_start = models.DateTimeField(null=True, blank=True)
    subscription_end = models.DateTimeField(null=True, blank=True)
    subscription_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=120, blank=True)
    country = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    bank_name = models.CharField(max_length=120, blank=True)
    bank_account_number = models.CharField(max_length=80, blank=True)
    bank_ifsc = models.CharField(max_length=20, blank=True)
    upi_id = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.subscription_status}"


class Subscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.CASCADE)

    razorpay_order_id = models.CharField(max_length=255, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=255, null=True, blank=True)
    razorpay_signature = models.CharField(max_length=255, null=True, blank=True)

    start_date = models.DateTimeField(auto_now_add=True)
    end_date = models.DateTimeField(null=True, blank=True)
    last_renewal_reminder_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=(
            ("pending", "Pending"),
            ("active", "Active"),
            ("trialing", "Trialing"),
            ("expired", "Expired"),
        ),
        default="pending"
    )
    trial_end = models.DateTimeField(null=True, blank=True)
    billing_cycle = models.CharField(
        max_length=10,
        choices=(
            ("monthly", "Monthly"),
            ("yearly", "Yearly"),
        ),
        default="monthly"
    )
    retention_months = models.PositiveSmallIntegerField(default=1)
    retention_days = models.PositiveSmallIntegerField(default=30)
    addon_count = models.PositiveSmallIntegerField(default=0)
    addon_proration_amount = models.FloatField(default=0)
    addon_last_proration_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.organization.name} - {self.plan.name}"


class SubscriptionHistory(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("expired", "Expired"),
        ("rejected", "Rejected"),
    )
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    org_display_name = models.CharField(max_length=200, blank=True)
    org_company_key = models.CharField(max_length=100, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True
    )
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    start_date = models.DateTimeField()
    end_date = models.DateTimeField(null=True, blank=True)
    billing_cycle = models.CharField(
        max_length=10,
        choices=(("monthly", "Monthly"), ("yearly", "Yearly")),
        default="monthly",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        plan_name = self.plan.name if self.plan else "-"
        org_name = (
            self.organization.name
            if self.organization
            else (self.org_display_name or "Unknown org")
        )
        return f"{org_name} - {plan_name}"


def _receipt_upload_to(instance, filename):
    org_id = None
    if instance.organization_id:
        org_id = instance.organization_id
    safe_org = str(org_id or "unknown")
    name = ""
    if instance.organization and instance.organization.name:
        name = instance.organization.name
    elif instance.user and instance.user.username:
        name = instance.user.username
    safe_name = re.sub(r"[^A-Za-z0-9]+", "_", name.strip()).strip("_") or "org"
    date_label = timezone.now().strftime("%d-%m-%Y")
    _, ext = os.path.splitext(filename)
    ext = ext if ext else ".jpg"
    return f"payments/{safe_org}/{safe_name.lower()}_{date_label}{ext}"


class PendingTransfer(models.Model):
    REQUEST_CHOICES = (
        ("new", "New Account"),
        ("renew", "Renewal"),
        ("addon", "Addon"),
        ("dealer", "Dealer Subscription"),
    )
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    org_display_name = models.CharField(max_length=200, blank=True)
    org_company_key = models.CharField(max_length=100, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True)
    request_type = models.CharField(max_length=10, choices=REQUEST_CHOICES, default="new")
    billing_cycle = models.CharField(
        max_length=10,
        choices=(
            ("monthly", "Monthly"),
            ("yearly", "Yearly"),
        ),
        default="monthly"
    )
    retention_days = models.PositiveSmallIntegerField(default=30)
    addon_count = models.PositiveSmallIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=10, default="INR")
    amount = models.FloatField(default=0)
    reference_no = models.CharField(max_length=100, blank=True)
    paid_on = models.DateField(null=True, blank=True)
    receipt = models.FileField(upload_to=_receipt_upload_to, null=True, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="draft")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        org_name = (
            self.organization.name
            if self.organization
            else (self.org_display_name or (self.user.username if self.user else "-"))
        )
        return f"{org_name} - {self.request_type} - {self.status}"


class EventMetric(models.Model):
    date = models.DateField()
    event_type = models.CharField(max_length=120)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    product_slug = models.CharField(max_length=60, blank=True)
    count = models.PositiveIntegerField(default=0)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("date", "organization", "product_slug", "event_type"),
                name="eventmetric_unique_daily_org_product_event",
            ),
        ]
        indexes = [
            models.Index(fields=("date", "event_type")),
            models.Index(fields=("organization", "product_slug")),
        ]

    def __str__(self):
        org_name = self.organization.name if self.organization else "-"
        product = self.product_slug or "-"
        return f"{self.date} {org_name} {product} {self.event_type}"


class AlertRule(models.Model):
    name = models.CharField(max_length=160)
    is_enabled = models.BooleanField(default=True)
    event_type = models.CharField(max_length=120)
    product_slug = models.CharField(max_length=60, blank=True)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, null=True, blank=True)
    threshold_count = models.PositiveIntegerField(default=1)
    window_minutes = models.PositiveIntegerField(default=60)
    cooldown_minutes = models.PositiveIntegerField(default=60)
    last_alerted_at = models.DateTimeField(null=True, blank=True)
    emails = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_enabled", "event_type", "product_slug", "id"]

    def __str__(self):
        scope = self.product_slug or "all-products"
        org = self.organization.name if self.organization else "all-orgs"
        return f"{self.name} ({scope}, {org})"


@receiver(pre_save, sender=PendingTransfer)
def pending_transfer_receipt_cleanup(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        previous = PendingTransfer.objects.get(pk=instance.pk)
    except PendingTransfer.DoesNotExist:
        return
    if not previous.receipt:
        return
    if instance.receipt and previous.receipt.name == instance.receipt.name:
        return
    previous.receipt.delete(save=False)


@receiver(pre_save, sender=PendingTransfer)
def pending_transfer_track_previous_status(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_status = None
        return
    try:
        instance._previous_status = PendingTransfer.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    except PendingTransfer.DoesNotExist:
        instance._previous_status = None


@receiver(post_save, sender=PendingTransfer)
def pending_transfer_notify_admin(sender, instance, created, **kwargs):
    previous_status = getattr(instance, "_previous_status", None)
    should_notify = (
        instance.status == "pending"
        and (created or (previous_status and previous_status != "pending"))
    )
    if not should_notify:
        return
    try:
        from .notifications import notify_payment_pending
        notify_payment_pending(instance)
    except Exception:
        # Avoid breaking the save flow if notification fails.
        return


@receiver(post_delete, sender=PendingTransfer)
def pending_transfer_receipt_delete(sender, instance, **kwargs):
    if instance.receipt:
        instance.receipt.delete(save=False)


class ReferralEarning(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("rejected", "Rejected"),
    )

    referrer_org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="referral_earnings",
    )
    referred_org = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name="referral_source",
    )
    transfer = models.ForeignKey(PendingTransfer, on_delete=models.SET_NULL, null=True, blank=True)
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    payout_reference = models.CharField(max_length=120, blank=True)
    payout_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.referrer_org.name} -> {self.referred_org.name} ({self.commission_amount})"


class DealerReferralEarning(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("paid", "Paid"),
        ("rejected", "Rejected"),
    )

    referrer_dealer = models.ForeignKey(
        DealerAccount,
        on_delete=models.CASCADE,
        related_name="referral_earnings",
    )
    referred_org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="dealer_referral_sources",
    )
    referred_dealer = models.ForeignKey(
        DealerAccount,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="dealer_referrals",
    )
    transfer = models.ForeignKey(PendingTransfer, on_delete=models.SET_NULL, null=True, blank=True)
    base_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    flat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    payout_reference = models.CharField(max_length=120, blank=True)
    payout_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        target = self.referred_org.name if self.referred_org else self.referred_dealer.user.username
        return f"{self.referrer_dealer.user.username} -> {target} ({self.commission_amount or self.flat_amount})"


class BillingProfile(models.Model):
    organization = models.OneToOneField(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    org_display_name = models.CharField(max_length=200, blank=True)
    org_company_key = models.CharField(max_length=100, blank=True)
    contact_name = models.CharField(max_length=120)
    company_name = models.CharField(max_length=180)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=120)
    state = models.CharField(max_length=120)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=60, default="India")
    gstin = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        org_name = (
            self.organization.name
            if self.organization
            else (self.org_display_name or "Unknown org")
        )
        return f"{org_name} billing profile"


class InvoiceSellerProfile(models.Model):
    name = models.CharField(max_length=200)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=60, default="India")
    gstin = models.CharField(max_length=20, blank=True)
    sac = models.CharField(max_length=20, default="997331")
    support_email = models.EmailField(blank=True)
    state_code = models.CharField(max_length=4, blank=True)
    bank_account_details = models.TextField(blank=True)
    upi_id = models.CharField(max_length=120, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name or "Invoice Seller Profile"


class OrganizationSettings(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    screenshot_interval_minutes = models.PositiveSmallIntegerField(default=5)
    screenshot_ignore_patterns = models.TextField(blank=True, default="")
    privacy_keyword_rules = models.TextField(blank=True, default="")
    auto_blur_password_fields = models.BooleanField(default=True)
    auto_blur_otp_fields = models.BooleanField(default=True)
    auto_blur_card_fields = models.BooleanField(default=True)
    auto_blur_email_inbox = models.BooleanField(default=True)
    org_timezone = models.CharField(max_length=64, default="UTC")
    ai_chatbot_premade_replies = models.TextField(blank=True, default="")
    ai_chatbot_user_attachments_enabled = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.organization.name} settings"


class CompanyPrivacySettings(models.Model):
    MONITORING_MODES = (
        ("standard", "Standard"),
        ("privacy_lock", "Privacy Lock"),
    )
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    monitoring_mode = models.CharField(
        max_length=20,
        choices=MONITORING_MODES,
        default="standard",
    )
    support_access_enabled_until = models.DateTimeField(null=True, blank=True)
    support_access_duration_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization.name} privacy settings"


class SupportAccessAuditLog(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    action = models.CharField(max_length=120)
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def prune_old_logs(cls, days=30):
        cutoff = timezone.now() - timedelta(days=days)
        return cls.objects.filter(created_at__lt=cutoff).delete()

    def __str__(self):
        return f"{self.organization.name} - {self.action}"


class AdminActivity(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    action = models.CharField(max_length=200)
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.action}"


class DeletedAccount(models.Model):
    organization_name = models.CharField(max_length=200)
    owner_username = models.CharField(max_length=150)
    owner_email = models.EmailField(blank=True)
    deleted_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=200, default="Plan expired")

    def __str__(self):
        return f"{self.organization_name} - {self.owner_username}"


class AdminNotification(models.Model):
    EVENT_CHOICES = [
        ("org_expired", "Org Account Expired"),
        ("org_renewed", "Org Account Renewed"),
        ("org_created", "New Account Created"),
        ("payment_pending", "Pending Payment"),
        ("payment_success", "Payment Success"),
        ("payment_failed", "Payment Failed"),
        ("product_activation", "Product Activation"),
        ("system", "System Notification"),
    ]
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES, default="system")
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.event_type})"


def log_admin_activity(user, action, details=""):
    AdminActivity.objects.create(
        user=user,
        action=action,
        details=details
    )
    old_ids = (
        AdminActivity.objects
        .filter(user=user)
        .order_by("-created_at")
        .values_list("id", flat=True)[500:]
    )
    if old_ids:
        AdminActivity.objects.filter(id__in=list(old_ids)).delete()

def _generate_chat_code():
    return secrets.token_hex(8)
