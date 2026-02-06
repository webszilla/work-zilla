from django.utils import timezone
from rest_framework import serializers

from .models import ServerNode, MetricSample, MonitoringSettings, AlertEvent


class ServerNodeSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    last_sample_at = serializers.SerializerMethodField()
    cpu_percent = serializers.SerializerMethodField()
    ram_percent = serializers.SerializerMethodField()
    disk_percent = serializers.SerializerMethodField()
    load1 = serializers.SerializerMethodField()

    class Meta:
        model = ServerNode
        fields = [
            "id",
            "name",
            "role",
            "region",
            "hostname",
            "ip",
            "is_active",
            "last_seen_at",
            "status",
            "last_sample_at",
            "cpu_percent",
            "ram_percent",
            "disk_percent",
            "load1",
        ]

    def get_status(self, obj):
        settings_obj = MonitoringSettings.get_solo()
        down_after_minutes = settings_obj.down_after_minutes
        if not obj.last_seen_at:
            return "DOWN"
        delta = timezone.now() - obj.last_seen_at
        return "UP" if delta.total_seconds() <= down_after_minutes * 60 else "DOWN"

    def _latest_sample(self, obj):
        if hasattr(obj, "_latest_sample"):
            return obj._latest_sample
        sample = obj.metrics.order_by("-ts_minute").first()
        obj._latest_sample = sample
        return sample

    def get_last_sample_at(self, obj):
        sample = self._latest_sample(obj)
        return sample.ts_minute if sample else None

    def get_cpu_percent(self, obj):
        sample = self._latest_sample(obj)
        return sample.cpu_percent if sample else 0

    def get_ram_percent(self, obj):
        sample = self._latest_sample(obj)
        return sample.ram_percent if sample else 0

    def get_disk_percent(self, obj):
        sample = self._latest_sample(obj)
        return sample.disk_percent if sample else 0

    def get_load1(self, obj):
        sample = self._latest_sample(obj)
        return sample.load1 if sample else 0


class MetricSampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetricSample
        fields = [
            "ts_minute",
            "cpu_percent",
            "ram_percent",
            "disk_percent",
            "load1",
            "load5",
            "load15",
            "net_in_kbps",
            "net_out_kbps",
        ]


class MonitoringSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonitoringSettings
        fields = [
            "enabled",
            "heartbeat_expected_seconds",
            "down_after_minutes",
            "cpu_threshold",
            "ram_threshold",
            "disk_threshold",
            "breach_minutes",
            "email_enabled",
            "alert_emails",
            "retention_days_metrics",
        ]


class AlertEventSerializer(serializers.ModelSerializer):
    server_name = serializers.CharField(source="server.name", read_only=True)
    server_role = serializers.CharField(source="server.role", read_only=True)
    server_region = serializers.CharField(source="server.region", read_only=True)

    class Meta:
        model = AlertEvent
        fields = [
            "id",
            "server",
            "server_name",
            "server_role",
            "server_region",
            "type",
            "severity",
            "started_at",
            "ended_at",
            "last_notified_at",
            "is_active",
            "details",
        ]
