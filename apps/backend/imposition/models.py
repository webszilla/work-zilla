import secrets
import string

from django.conf import settings
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from core.models import Organization


def _generate_license_code():
    alphabet = string.ascii_uppercase + string.digits
    part = "".join(secrets.choice(alphabet) for _ in range(5))
    part2 = "".join(secrets.choice(alphabet) for _ in range(5))
    part3 = "".join(secrets.choice(alphabet) for _ in range(5))
    return f"IMP-{part}-{part2}-{part3}"


class ImpositionPlan(models.Model):
    PLAN_CHOICES = (
        ("starter", "Starter"),
        ("pro", "Pro"),
        ("business", "Business"),
        ("enterprise", "Enterprise"),
    )

    code = models.CharField(max_length=20, unique=True, choices=PLAN_CHOICES)
    name = models.CharField(max_length=120)
    device_limit = models.PositiveIntegerField(default=1)
    additional_user_price_monthly_inr = models.DecimalField(max_digits=10, decimal_places=2, default=300)
    feature_flags = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return self.name


class ImpositionOrgSubscription(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("trialing", "Trialing"),
        ("inactive", "Inactive"),
        ("expired", "Expired"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_subscriptions")
    plan = models.ForeignKey(ImpositionPlan, on_delete=models.PROTECT, related_name="org_subscriptions")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_subscriptions"
        indexes = [
            models.Index(fields=["organization", "status"], name="imposition_sub_org_status_idx"),
        ]
        ordering = ("-updated_at",)

    def __str__(self):
        return f"{self.organization_id} - {self.plan.code}"


class ImpositionOrgAddon(models.Model):
    ADDON_CHOICES = (
        ("imposition_user", "Additional User"),
        ("additional_user", "Additional User"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_addons")
    addon_code = models.CharField(max_length=40, choices=ADDON_CHOICES, default="imposition_user")
    quantity = models.PositiveIntegerField(default=0)
    unit_price_monthly_inr = models.DecimalField(max_digits=10, decimal_places=2, default=300)
    unit_price_yearly_inr = models.DecimalField(max_digits=10, decimal_places=2, default=3000)
    unit_price_monthly_usd = models.DecimalField(max_digits=10, decimal_places=2, default=4)
    unit_price_yearly_usd = models.DecimalField(max_digits=10, decimal_places=2, default=40)
    billing_cycle = models.CharField(max_length=20, default="monthly")
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "addon_code")

    def __str__(self):
        return f"{self.organization_id} - {self.addon_code} ({self.quantity})"


class ImpositionLicense(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("expired", "Expired"),
        ("revoked", "Revoked"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_licenses")
    subscription = models.ForeignKey(
        ImpositionOrgSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="licenses",
    )
    code = models.CharField(max_length=40, unique=True, default=_generate_license_code)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    offline_grace_days = models.PositiveSmallIntegerField(default=3)
    last_verified_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_license_codes"
        indexes = [
            models.Index(fields=["organization", "status"], name="imposition_lic_org_status_idx"),
        ]

    def __str__(self):
        return f"{self.organization_id} - {self.code}"


class ImpositionDevice(models.Model):
    license = models.ForeignKey(ImpositionLicense, on_delete=models.CASCADE, related_name="devices")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_devices")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imposition_devices",
    )
    device_id = models.CharField(max_length=120)
    device_name = models.CharField(max_length=200, blank=True, default="")
    os = models.CharField(max_length=80, blank=True, default="")
    app_version = models.CharField(max_length=50, blank=True, default="")
    is_active = models.BooleanField(default=True)
    registered_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_devices"
        unique_together = ("organization", "device_id")
        indexes = [
            models.Index(fields=["organization", "is_active"], name="imposition_dev_org_active_idx"),
            models.Index(fields=["license", "is_active"], name="imposition_dev_lic_active_idx"),
        ]

    def __str__(self):
        return f"{self.organization_id}:{self.device_id}"


class ImpositionTemplate(models.Model):
    TYPE_CHOICES = (
        ("id_card", "ID Card"),
        ("business_card", "Business Card"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_templates")
    name = models.CharField(max_length=150)
    template_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    layout = models.JSONField(default=dict, blank=True)
    is_system = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_imposition_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.organization_id} - {self.name}"


class ImpositionJob(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("processing", "Processing"),
        ("ready", "Ready"),
        ("failed", "Failed"),
    )
    TYPE_CHOICES = (
        ("id_card", "ID Card"),
        ("business_card", "Business Card"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_jobs")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imposition_jobs",
    )
    job_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200, blank=True, default="")
    sheet_size = models.CharField(max_length=40, default="A4")
    settings = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    output_meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "status"], name="imposition_job_org_status_idx"),
        ]
        ordering = ("-updated_at",)

    def __str__(self):
        return f"{self.organization_id}:{self.job_type}:{self.status}"


class ImpositionDataImport(models.Model):
    TYPE_CHOICES = (
        ("id_card", "ID Card"),
        ("business_card", "Business Card"),
    )
    STATUS_CHOICES = (
        ("uploaded", "Uploaded"),
        ("processed", "Processed"),
        ("failed", "Failed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_imports")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imposition_imports",
    )
    import_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    source_filename = models.CharField(max_length=255, blank=True, default="")
    mapping = models.JSONField(default=dict, blank=True)
    row_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="uploaded")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


class ImpositionUsageLog(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_usage_logs")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imposition_usage_logs",
    )
    device = models.ForeignKey(
        ImpositionDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="usage_logs",
    )
    event_type = models.CharField(max_length=60)
    event_payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "product_activity_logs"
        indexes = [
            models.Index(fields=["organization", "event_type"], name="imposition_log_org_event_idx"),
        ]
        ordering = ("-created_at",)


class ImpositionProductUser(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("disabled", "Disabled"),
        ("deleted", "Deleted"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_product_users")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="imposition_product_memberships",
    )
    role = models.CharField(max_length=30, default="org_user")
    license = models.ForeignKey(
        ImpositionLicense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_users",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_users"
        unique_together = ("organization", "user")
        indexes = [
            models.Index(fields=["organization", "status"], name="imposition_pu_org_status_idx"),
        ]
        ordering = ("user__username",)

    def __str__(self):
        return f"{self.organization_id}:{self.user_id}:{self.status}"


class ImpositionBillingRecord(models.Model):
    STATUS_CHOICES = (
        ("paid", "Paid"),
        ("pending", "Pending"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="imposition_billing_records")
    subscription = models.ForeignKey(
        ImpositionOrgSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_records",
    )
    invoice_number = models.CharField(max_length=80)
    plan_name = models.CharField(max_length=120, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=10, default="INR")
    payment_method = models.CharField(max_length=40, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="paid")
    paid_at = models.DateTimeField(default=timezone.now)
    invoice_url = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "product_billing"
        unique_together = ("organization", "invoice_number")
        indexes = [
            models.Index(fields=["organization", "paid_at"], name="imposition_bill_org_paid_idx"),
            models.Index(fields=["organization", "status"], name="imposition_bill_org_status_idx"),
        ]
        ordering = ("-paid_at", "-created_at")

    def __str__(self):
        return f"{self.organization_id}:{self.invoice_number}"


class ImpositionAddonCatalog(models.Model):
    addon_code = models.CharField(max_length=50, unique=True)
    addon_name = models.CharField(max_length=120)
    product = models.CharField(max_length=120, default="Imposition Software")
    price_month_inr = models.DecimalField(max_digits=12, decimal_places=2, default=300)
    price_year_inr = models.DecimalField(max_digits=12, decimal_places=2, default=3000)
    price_month_usd = models.DecimalField(max_digits=12, decimal_places=2, default=4)
    price_year_usd = models.DecimalField(max_digits=12, decimal_places=2, default=40)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "addons"
        ordering = ("addon_name",)

    def __str__(self):
        return f"{self.addon_code} ({self.product})"


@receiver(post_save, sender="core.Subscription")
def sync_imposition_subscription(sender, instance, **kwargs):
    try:
        from .services import sync_subscription_from_core
        sync_subscription_from_core(instance)
    except Exception:
        return
