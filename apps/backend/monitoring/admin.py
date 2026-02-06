from django.contrib import admin

from .models import ServerNode, MetricSample, MonitoringSettings, AlertEvent, Product


@admin.register(ServerNode)
class ServerNodeAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "region", "hostname", "is_active", "last_seen_at")
    search_fields = ("name", "hostname", "region")
    list_filter = ("role", "is_active")


@admin.register(MetricSample)
class MetricSampleAdmin(admin.ModelAdmin):
    list_display = ("server", "ts_minute", "cpu_percent", "ram_percent", "disk_percent")
    list_filter = ("server",)
    search_fields = ("server__name",)


@admin.register(MonitoringSettings)
class MonitoringSettingsAdmin(admin.ModelAdmin):
    list_display = ("enabled", "down_after_minutes", "cpu_threshold", "ram_threshold", "disk_threshold")


@admin.register(AlertEvent)
class AlertEventAdmin(admin.ModelAdmin):
    list_display = ("server", "type", "severity", "is_active", "started_at", "ended_at")
    list_filter = ("type", "severity", "is_active")
    search_fields = ("server__name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")
