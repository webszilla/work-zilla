import uuid

from django.conf import settings
from django.db import models


class BackupRecord(models.Model):
    STATUS_CHOICES = (
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("expired", "Expired"),
        ("purged", "Purged"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="backup_records",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="backup_records",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requested_backups",
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    request_id = models.UUIDField(null=True, blank=True)
    storage_path = models.TextField(blank=True, default="")
    manifest_path = models.TextField(blank=True, default="")
    checksum_path = models.TextField(blank=True, default="")
    checksum_sha256 = models.CharField(max_length=128, blank=True, default="")
    size_bytes = models.BigIntegerField(default=0)
    error_message = models.TextField(blank=True, default="")
    download_url = models.TextField(blank=True, default="")
    download_token = models.CharField(max_length=64, blank=True, default="")
    download_url_expires_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "product", "requested_at"]),
            models.Index(fields=["status", "requested_at"]),
            models.Index(fields=["request_id"]),
        ]
        ordering = ["-requested_at"]

    def __str__(self) -> str:
        return f"{self.organization_id} | {self.product_id} | {self.status}"

    @property
    def backup_key_prefix(self) -> str:
        org_part = f"org_{self.organization_id}"
        product_part = f"product_{self.product_id}" if self.product_id else "product_unknown"
        return f"backups/{org_part}/{product_part}"


class BackupAuditLog(models.Model):
    ACTION_CHOICES = (
        ("backup_requested", "Backup Requested"),
        ("backup_started", "Backup Started"),
        ("backup_completed", "Backup Completed"),
        ("backup_failed", "Backup Failed"),
        ("backup_downloaded", "Backup Downloaded"),
        ("restore_requested", "Restore Requested"),
        ("restore_started", "Restore Started"),
        ("restore_completed", "Restore Completed"),
        ("restore_failed", "Restore Failed"),
        ("backup_deleted", "Backup Deleted"),
    )

    STATUS_CHOICES = (
        ("ok", "OK"),
        ("warning", "Warning"),
        ("error", "Error"),
    )

    ACTOR_CHOICES = (
        ("user", "User"),
        ("admin", "Admin"),
        ("system", "System"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="backup_audit_logs",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="backup_audit_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="backup_audit_logs",
    )
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="ok")
    actor_type = models.CharField(max_length=16, choices=ACTOR_CHOICES, default="system")
    message = models.TextField(blank=True, default="")
    backup_id = models.UUIDField(null=True, blank=True)
    request_id = models.UUIDField(null=True, blank=True)
    trace_id = models.CharField(max_length=64, blank=True, default="")
    event_meta = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["organization", "product", "created_at"]),
            models.Index(fields=["action", "status"]),
            models.Index(fields=["backup_id"]),
            models.Index(fields=["request_id"]),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.organization_id} | {self.action} | {self.status}"


class OrgDownloadActivity(models.Model):
    STATUS_CHOICES = (
        ("generated", "Generated"),
        ("downloaded", "Downloaded"),
        ("expired", "Expired"),
        ("failed", "Failed"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization_id = models.UUIDField()
    product_id = models.UUIDField(null=True, blank=True)
    admin_user_id = models.UUIDField()
    backup_id = models.CharField(max_length=100)
    backup_size_mb = models.IntegerField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    generated_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    created_ip = models.GenericIPAddressField(null=True, blank=True)


class FeatureToggle(models.Model):
    key = models.CharField(max_length=128, unique=True)
    route = models.CharField(max_length=255)
    permission = models.CharField(max_length=255)
    enabled = models.BooleanField(default=True)
