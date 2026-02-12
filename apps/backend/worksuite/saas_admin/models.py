from django.conf import settings
from django.db import models
import uuid

from core.models import Organization


class Product(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("coming_soon", "Coming Soon"),
        ("disabled", "Disabled"),
    )

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="coming_soon")
    features = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class MonitorOrgProductEntitlement(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("trial", "Trial"),
    )

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="monitor_org_product_entitlements",
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    enabled_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ("organization", "product")

    def __str__(self):
        return f"{self.organization.name} - {self.product.name}"


class OpenAISettings(models.Model):
    provider = models.CharField(max_length=40, default="openai", unique=True)
    api_key = models.TextField(blank=True, default="")
    model = models.CharField(max_length=80, default="gpt-4o-mini")
    input_cost_per_1k_tokens_inr = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    output_cost_per_1k_tokens_inr = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    fixed_markup_percent = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("provider",)

    def __str__(self):
        return f"{self.provider} settings"


class GlobalMediaStorageSettings(models.Model):
    STORAGE_CHOICES = (
        ("local", "Local storage"),
        ("object", "Object storage"),
    )

    storage_mode = models.CharField(max_length=20, choices=STORAGE_CHOICES, default="local")
    endpoint_url = models.URLField(blank=True, default="")
    bucket_name = models.CharField(max_length=128, blank=True, default="")
    access_key_id = models.CharField(max_length=256, blank=True, default="")
    secret_access_key = models.TextField(blank=True, default="")
    region_name = models.CharField(max_length=64, blank=True, default="")
    base_path = models.CharField(max_length=128, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Media Storage Settings"
        verbose_name_plural = "Media Storage Settings"

    def __str__(self):
        return f"Media Storage ({self.storage_mode})"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj:
            return obj
        return cls.objects.create(storage_mode="local")

    def is_object_configured(self):
        return bool(
            self.endpoint_url
            and self.bucket_name
            and self.access_key_id
            and self.secret_access_key
        )


class BackupRetentionSettings(models.Model):
    last_n = models.PositiveIntegerField(default=30)
    daily_days = models.PositiveIntegerField(default=30)
    weekly_weeks = models.PositiveIntegerField(default=12)
    monthly_months = models.PositiveIntegerField(default=12)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Backup Retention Settings"
        verbose_name_plural = "Backup Retention Settings"

    def __str__(self):
        return "Backup Retention Settings"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj:
            return obj
        return cls.objects.create()


class OrganizationBackupRetentionOverride(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE)
    last_n = models.PositiveIntegerField(default=0)
    daily_days = models.PositiveIntegerField(default=0)
    weekly_weeks = models.PositiveIntegerField(default=0)
    monthly_months = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Organization Backup Retention Override"
        verbose_name_plural = "Organization Backup Retention Overrides"

    def __str__(self):
        return f"{self.organization.name} backup retention override"


class ProductBackupRetentionOverride(models.Model):
    product = models.OneToOneField(Product, on_delete=models.CASCADE)
    last_n = models.PositiveIntegerField(default=0)
    daily_days = models.PositiveIntegerField(default=0)
    weekly_weeks = models.PositiveIntegerField(default=0)
    monthly_months = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Product Backup Retention Override"
        verbose_name_plural = "Product Backup Retention Overrides"

    def __str__(self):
        return f"{self.product.name} backup retention override"


class MediaStoragePullJob(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    total_files = models.PositiveIntegerField(default=0)
    existing_files = models.PositiveIntegerField(default=0)
    copied_files = models.PositiveIntegerField(default=0)
    skipped_files = models.PositiveIntegerField(default=0)
    file_type_counts = models.JSONField(default=dict, blank=True)
    delete_local = models.BooleanField(default=False)
    overwrite = models.BooleanField(default=False)
    current_path = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Media Pull {self.id} ({self.status})"
