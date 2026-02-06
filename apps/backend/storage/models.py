from django.db import models
from django.conf import settings
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
import uuid

from core.models import Organization


def _safe_name(value):
    value = str(value or "").strip()
    if not value:
        return "untitled"
    return " ".join(value.split())


class StorageFolder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_folders")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    name = models.CharField(max_length=200)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storage_folders")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="storage_folders_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "owner"], name="storage_sto_organiz_a30633_idx"),
            models.Index(fields=["organization", "parent"], name="storage_sto_organiz_8c4538_idx"),
            models.Index(fields=["organization", "owner", "parent"], name="storage_sto_organiz_1c4c20_idx"),
        ]
        ordering = ("name",)

    def __str__(self):
        return f"{self.organization_id}:{self.name}"

    def clean_name(self):
        self.name = _safe_name(self.name)

    def save(self, *args, **kwargs):
        self.clean_name()
        super().save(*args, **kwargs)


class StorageFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_files")
    folder = models.ForeignKey(StorageFolder, on_delete=models.CASCADE, related_name="files")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storage_files")
    original_filename = models.CharField(max_length=255, default="")
    storage_key = models.TextField(default="")
    size_bytes = models.BigIntegerField(default=0)
    content_type = models.CharField(max_length=120, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "owner"], name="storage_sto_organiz_12ab80_idx"),
            models.Index(fields=["organization", "folder"], name="storage_sto_organiz_a94251_idx"),
            models.Index(fields=["organization", "is_deleted"], name="storage_sto_organiz_3a2f7d_idx"),
        ]
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.organization_id}:{self.original_filename}"

    def clean_name(self):
        self.original_filename = _safe_name(self.original_filename)

    def save(self, *args, **kwargs):
        self.clean_name()
        super().save(*args, **kwargs)


class StorageOrganizationSettings(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="storage_settings")
    sync_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization_id} storage settings"


class StorageGlobalSettings(models.Model):
    sync_globally_enabled = models.BooleanField(default=True)
    uploads_globally_enabled = models.BooleanField(default=True)
    read_only_globally_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return "Storage global settings"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj:
            return obj
        return cls.objects.create(sync_globally_enabled=True)


class StorageUserSettings(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_user_settings")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storage_settings")
    sync_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "user")

    def __str__(self):
        return f"{self.organization_id}:{self.user_id} storage settings"


class Product(models.Model):
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class Plan(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="plans")
    name = models.CharField(max_length=120)
    monthly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    yearly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    usd_monthly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    usd_yearly_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_price_inr = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    yearly_price_inr = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_price_usd = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    yearly_price_usd = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_users = models.IntegerField(null=True, blank=True)
    device_limit_per_user = models.PositiveSmallIntegerField(default=1)
    storage_limit_gb = models.PositiveIntegerField(default=0)
    bandwidth_limit_gb_monthly = models.PositiveIntegerField(default=0)
    is_bandwidth_limited = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.product.name} - {self.name}"


class AddOn(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="addons")
    name = models.CharField(max_length=120)
    storage_gb = models.PositiveIntegerField(default=0)
    price_monthly = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stackable = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return f"{self.product.name} - {self.name}"


class OrgSubscription(models.Model):
    STATUS_CHOICES = (
        ("active", "Active"),
        ("trialing", "Trialing"),
        ("inactive", "Inactive"),
        ("expired", "Expired"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_subscriptions")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="org_subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    renewal_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "product")

    def __str__(self):
        return f"{self.organization_id} - {self.product.name}"


class OrgAddOn(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_addons")
    addon = models.ForeignKey(AddOn, on_delete=models.CASCADE, related_name="org_addons")
    quantity = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "addon")

    def __str__(self):
        return f"{self.organization_id} - {self.addon.name}"


class OrgUser(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="storage_users")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storage_user")
    is_active = models.BooleanField(default=True)
    system_sync_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "user")

    def __str__(self):
        return f"{self.organization_id} - {self.user_id}"


class OrgStorageUsage(models.Model):
    organization = models.OneToOneField(Organization, on_delete=models.CASCADE, related_name="storage_usage")
    used_storage_bytes = models.BigIntegerField(default=0)
    last_calculated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organization_id} usage"


class OrgBandwidthUsage(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="bandwidth_usage")
    billing_cycle_start = models.DateField()
    used_bandwidth_bytes = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("organization", "billing_cycle_start")

    def __str__(self):
        return f"{self.organization_id} bandwidth {self.billing_cycle_start}"


@receiver(post_delete, sender=StorageFile)
def storage_file_delete(sender, instance, **kwargs):
    return
