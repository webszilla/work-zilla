import uuid
from django.db import migrations, models
from django.utils import timezone
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=128)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="ServerNode",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=128)),
                ("role", models.CharField(choices=[("app", "App"), ("db", "DB"), ("worker", "Worker")], max_length=16)),
                ("region", models.CharField(blank=True, default="", max_length=128)),
                ("hostname", models.CharField(blank=True, default="", max_length=255)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("token_hash", models.CharField(blank=True, default="", max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("last_seen_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="MonitoringSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("enabled", models.BooleanField(default=True)),
                ("heartbeat_expected_seconds", models.PositiveIntegerField(default=30)),
                ("down_after_minutes", models.PositiveIntegerField(default=3)),
                ("cpu_threshold", models.PositiveIntegerField(default=85)),
                ("ram_threshold", models.PositiveIntegerField(default=90)),
                ("disk_threshold", models.PositiveIntegerField(default=90)),
                ("breach_minutes", models.PositiveIntegerField(default=5)),
                ("email_enabled", models.BooleanField(default=True)),
                ("alert_emails", models.JSONField(blank=True, default=list)),
                ("retention_days_metrics", models.PositiveIntegerField(default=30)),
            ],
        ),
        migrations.CreateModel(
            name="MetricSample",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ts_minute", models.DateTimeField()),
                ("cpu_percent", models.FloatField(default=0)),
                ("ram_percent", models.FloatField(default=0)),
                ("disk_percent", models.FloatField(default=0)),
                ("load1", models.FloatField(default=0)),
                ("load5", models.FloatField(default=0)),
                ("load15", models.FloatField(default=0)),
                ("net_in_kbps", models.FloatField(default=0)),
                ("net_out_kbps", models.FloatField(default=0)),
                ("server", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="metrics", to="monitoring.servernode")),
            ],
            options={
                "ordering": ["-ts_minute"],
                "unique_together": {("server", "ts_minute")},
            },
        ),
        migrations.CreateModel(
            name="AlertEvent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("type", models.CharField(choices=[("DOWN", "DOWN"), ("CPU", "CPU"), ("RAM", "RAM"), ("DISK", "DISK")], max_length=8)),
                ("severity", models.CharField(choices=[("low", "Low"), ("med", "Medium"), ("high", "High")], default="med", max_length=8)),
                ("started_at", models.DateTimeField(default=timezone.now)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("last_notified_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("details", models.JSONField(blank=True, default=dict)),
                ("server", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="monitoring.servernode")),
            ],
            options={
                "ordering": ["-started_at"],
            },
        ),
        migrations.AddIndex(
            model_name="metricsample",
            index=models.Index(fields=["server", "ts_minute"], name="monitoring_server_ts_idx"),
        ),
        migrations.AddIndex(
            model_name="alertevent",
            index=models.Index(fields=["server", "type", "is_active"], name="monitoring_alert_server_type_idx"),
        ),
        migrations.AddIndex(
            model_name="alertevent",
            index=models.Index(fields=["started_at"], name="monitoring_alert_started_idx"),
        ),
    ]
