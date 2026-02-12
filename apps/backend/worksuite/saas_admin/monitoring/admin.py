from django.contrib import admin, messages

from .models import ServerNode, MetricSample, MonitoringSettings, AlertEvent, Product
from .utils import generate_token, hash_token


@admin.register(ServerNode)
class ServerNodeAdmin(admin.ModelAdmin):
    list_display = ("name", "role", "region", "hostname", "is_active", "last_seen_at")
    search_fields = ("name", "hostname", "region")
    list_filter = ("role", "is_active")
    actions = ["rotate_token"]

    def save_model(self, request, obj, form, change):
        is_new = obj._state.adding
        if not obj.token_hash:
            token = generate_token()
            obj.token_hash = hash_token(token)
            super().save_model(request, obj, form, change)
            messages.success(
                request,
                f"Monitoring token generated for {obj.name}: {token}"
            )
            return
        super().save_model(request, obj, form, change)
        if is_new:
            messages.info(request, "Server created. Token already present.")

    def rotate_token(self, request, queryset):
        for server in queryset:
            token = generate_token()
            server.token_hash = hash_token(token)
            server.save(update_fields=["token_hash"])
            messages.success(
                request,
                f"New token for {server.name}: {token}"
            )
    rotate_token.short_description = "Generate new token for selected servers"


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
