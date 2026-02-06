from django.contrib import admin

from apps.backend.retention.models import (
    GlobalRetentionPolicy,
    TenantRetentionOverride,
    TenantRetentionStatus,
)


@admin.register(GlobalRetentionPolicy)
class GlobalRetentionPolicyAdmin(admin.ModelAdmin):
    list_display = ("id", "grace_days", "archive_days", "hard_delete_days", "updated_at")

    def has_add_permission(self, request):
        return not GlobalRetentionPolicy.objects.exists()


@admin.register(TenantRetentionOverride)
class TenantRetentionOverrideAdmin(admin.ModelAdmin):
    list_display = ("organization", "grace_days", "archive_days", "hard_delete_days", "updated_at")
    search_fields = ("organization__name",)


@admin.register(TenantRetentionStatus)
class TenantRetentionStatusAdmin(admin.ModelAdmin):
    list_display = ("organization", "status", "subscription_expires_at", "grace_until", "archive_until", "deleted_at")
    search_fields = ("organization__name",)
    list_filter = ("status",)
