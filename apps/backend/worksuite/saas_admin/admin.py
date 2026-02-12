from django.contrib import admin

from .models import (
    Product,
    MonitorOrgProductEntitlement,
    OpenAISettings,
    GlobalMediaStorageSettings,
    BackupRetentionSettings,
    OrganizationBackupRetentionOverride,
    ProductBackupRetentionOverride,
)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "sort_order", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("status",)
    ordering = ("sort_order", "name")
    change_list_template = "admin/saas_admin/product/change_list.html"


@admin.register(MonitorOrgProductEntitlement)
class OrgProductEntitlementAdmin(admin.ModelAdmin):
    list_display = ("organization", "product", "status", "enabled_at")
    search_fields = ("organization__name", "product__name")
    list_filter = ("status", "product")


@admin.register(OpenAISettings)
class OpenAISettingsAdmin(admin.ModelAdmin):
    list_display = ("provider", "model", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("provider", "model")


@admin.register(GlobalMediaStorageSettings)
class GlobalMediaStorageSettingsAdmin(admin.ModelAdmin):
    list_display = ("storage_mode", "bucket_name", "endpoint_url", "updated_at")


@admin.register(BackupRetentionSettings)
class BackupRetentionSettingsAdmin(admin.ModelAdmin):
    list_display = ("last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at")


@admin.register(OrganizationBackupRetentionOverride)
class OrganizationBackupRetentionOverrideAdmin(admin.ModelAdmin):
    list_display = ("organization", "last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at")
    search_fields = ("organization__name",)


@admin.register(ProductBackupRetentionOverride)
class ProductBackupRetentionOverrideAdmin(admin.ModelAdmin):
    list_display = ("product", "last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at")
    search_fields = ("product__name",)
