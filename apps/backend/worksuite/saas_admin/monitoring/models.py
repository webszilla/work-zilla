import uuid
from django.db import models
from django.utils import timezone


class Product(models.Model):
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ServerNode(models.Model):
    ROLE_CHOICES = (
        ("app", "App"),
        ("db", "DB"),
        ("worker", "Worker"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=128)
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    region = models.CharField(max_length=128, blank=True, default="")
    hostname = models.CharField(max_length=255, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    token_hash = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class MetricSample(models.Model):
    server = models.ForeignKey(ServerNode, on_delete=models.CASCADE, related_name="metrics")
    ts_minute = models.DateTimeField()
    cpu_percent = models.FloatField(default=0)
    ram_percent = models.FloatField(default=0)
    disk_percent = models.FloatField(default=0)
    load1 = models.FloatField(default=0)
    load5 = models.FloatField(default=0)
    load15 = models.FloatField(default=0)
    net_in_kbps = models.FloatField(default=0)
    net_out_kbps = models.FloatField(default=0)

    class Meta:
        unique_together = ("server", "ts_minute")
        indexes = [
            models.Index(fields=["server", "ts_minute"]),
        ]
        ordering = ["-ts_minute"]


class MonitoringSettings(models.Model):
    enabled = models.BooleanField(default=True)
    heartbeat_expected_seconds = models.PositiveIntegerField(default=30)
    down_after_minutes = models.PositiveIntegerField(default=3)
    cpu_threshold = models.PositiveIntegerField(default=85)
    ram_threshold = models.PositiveIntegerField(default=90)
    disk_threshold = models.PositiveIntegerField(default=90)
    breach_minutes = models.PositiveIntegerField(default=5)
    email_enabled = models.BooleanField(default=True)
    alert_emails = models.JSONField(default=list, blank=True)
    retention_days_metrics = models.PositiveIntegerField(default=30)

    def save(self, *args, **kwargs):
        if not self.pk and MonitoringSettings.objects.exists():
            return
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create()
        return obj


class AlertEvent(models.Model):
    TYPE_CHOICES = (
        ("DOWN", "DOWN"),
        ("CPU", "CPU"),
        ("RAM", "RAM"),
        ("DISK", "DISK"),
    )
    SEVERITY_CHOICES = (
        ("low", "Low"),
        ("med", "Medium"),
        ("high", "High"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    server = models.ForeignKey(ServerNode, on_delete=models.CASCADE, related_name="alerts")
    type = models.CharField(max_length=8, choices=TYPE_CHOICES)
    severity = models.CharField(max_length=8, choices=SEVERITY_CHOICES, default="med")
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["server", "type", "is_active"]),
            models.Index(fields=["started_at"]),
        ]
        ordering = ["-started_at"]
