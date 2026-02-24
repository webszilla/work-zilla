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


class WhatsAppCloudSettings(models.Model):
    provider = models.CharField(max_length=40, default="meta_whatsapp_cloud", unique=True)
    is_active = models.BooleanField(default=False)
    phone_number_id = models.CharField(max_length=64, blank=True, default="")
    access_token = models.TextField(blank=True, default="")
    admin_phone = models.CharField(max_length=32, blank=True, default="")
    notify_admin_new_user = models.BooleanField(default=True)
    notify_user_welcome = models.BooleanField(default=True)
    notification_toggles = models.JSONField(default=dict, blank=True)
    admin_template_name = models.CharField(max_length=100, blank=True, default="new_user_admin_alert")
    user_welcome_template_name = models.CharField(max_length=100, blank=True, default="welcome_user_signup")
    template_language = models.CharField(max_length=20, blank=True, default="en_US")
    graph_api_version = models.CharField(max_length=20, blank=True, default="v21.0")
    timeout_seconds = models.PositiveIntegerField(default=15)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "WhatsApp Cloud Settings"
        verbose_name_plural = "WhatsApp Cloud Settings"

    def __str__(self):
        return "WhatsApp Cloud Settings"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.filter(provider="meta_whatsapp_cloud").first()
        if obj:
            return obj
        return cls.objects.create(provider="meta_whatsapp_cloud")


class SystemBackupManagerSettings(models.Model):
    SCHEDULE_CHOICES = (
        ("daily", "Daily"),
        ("weekly", "Weekly"),
    )

    provider = models.CharField(max_length=40, default="google_drive", unique=True)
    is_active = models.BooleanField(default=False)
    google_client_id = models.CharField(max_length=255, blank=True, default="")
    google_client_secret = models.TextField(blank=True, default="")
    google_redirect_uri = models.URLField(blank=True, default="")
    google_access_token = models.TextField(blank=True, default="")
    google_refresh_token = models.TextField(blank=True, default="")
    google_token_expiry = models.DateTimeField(null=True, blank=True)
    google_drive_folder_id = models.CharField(max_length=255, blank=True, default="")
    oauth_state = models.CharField(max_length=128, blank=True, default="")
    oauth_state_created_at = models.DateTimeField(null=True, blank=True)
    scheduler_enabled = models.BooleanField(default=False)
    schedule_frequency = models.CharField(max_length=16, choices=SCHEDULE_CHOICES, default="daily")
    schedule_weekday = models.PositiveSmallIntegerField(default=0)  # 0=Mon
    schedule_hour_utc = models.PositiveSmallIntegerField(default=2)
    schedule_minute_utc = models.PositiveSmallIntegerField(default=0)
    scheduler_last_run_at = models.DateTimeField(null=True, blank=True)
    keep_last_backups = models.PositiveSmallIntegerField(default=7)
    last_error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Backup Manager Settings"
        verbose_name_plural = "System Backup Manager Settings"

    def __str__(self):
        return "System Backup Manager Settings"

    @classmethod
    def get_solo(cls):
        obj = cls.objects.filter(provider="google_drive").first()
        if obj:
            return obj
        return cls.objects.create(provider="google_drive")

    @property
    def google_connected(self):
        return bool(self.google_refresh_token and self.google_client_id and self.google_client_secret)


class SystemBackupLog(models.Model):
    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )
    TRIGGER_CHOICES = (
        ("manual", "Manual"),
        ("scheduler", "Scheduler"),
    )

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="system_backup_logs",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default="manual")
    message = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    temp_sql_path = models.TextField(blank=True, default="")
    temp_zip_path = models.TextField(blank=True, default="")
    sql_size_bytes = models.BigIntegerField(default=0)
    zip_size_bytes = models.BigIntegerField(default=0)
    drive_sql_file_id = models.CharField(max_length=255, blank=True, default="")
    drive_sql_file_name = models.CharField(max_length=255, blank=True, default="")
    drive_zip_file_id = models.CharField(max_length=255, blank=True, default="")
    drive_zip_file_name = models.CharField(max_length=255, blank=True, default="")
    meta = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"SystemBackupLog {self.id} ({self.status})"


class OrganizationBackupLog(models.Model):
    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )
    TRIGGER_CHOICES = (
        ("manual", "Manual"),
        ("scheduler", "Scheduler"),
        ("bulk_manual", "Bulk Manual"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="saas_org_backup_logs")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="organization_backup_logs"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES, default="manual")
    backup_scope = models.CharField(max_length=20, default="org_data")
    temp_file_path = models.TextField(blank=True, default="")
    temp_file_size_bytes = models.BigIntegerField(default=0)
    drive_file_id = models.CharField(max_length=255, blank=True, default="")
    drive_file_name = models.CharField(max_length=255, blank=True, default="")
    drive_folder_path = models.CharField(max_length=255, blank=True, default="")
    records_exported = models.IntegerField(default=0)
    model_count = models.IntegerField(default=0)
    message = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    meta = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["organization", "created_at"]), models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"OrgBackup {self.organization_id} {self.status}"


class OrganizationRestoreLog(models.Model):
    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("downloading", "Downloading"),
        ("validating", "Validating"),
        ("restoring", "Restoring"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    )

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="saas_org_restore_logs")
    restored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="organization_restore_logs"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    backup_file_id = models.CharField(max_length=255, blank=True, default="")
    backup_file_name = models.CharField(max_length=255, blank=True, default="")
    temp_download_path = models.TextField(blank=True, default="")
    temp_restore_db_path = models.TextField(blank=True, default="")
    validation_summary = models.JSONField(default=dict, blank=True)
    restored_records = models.IntegerField(default=0)
    message = models.TextField(blank=True, default="")
    errors = models.TextField(blank=True, default="")
    meta = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["organization", "created_at"]), models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"OrgRestore {self.organization_id} {self.status}"


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
