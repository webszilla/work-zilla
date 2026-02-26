import json

from django.contrib import admin
from django.db import transaction
from django.http import JsonResponse
from django.urls import path

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

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "reorder/",
                self.admin_site.admin_view(self.reorder_view),
                name="saas_admin_product_reorder",
            ),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context["product_reorder_url"] = "admin:saas_admin_product_reorder"
        return super().changelist_view(request, extra_context=extra_context)

    def reorder_view(self, request):
        if request.method != "POST":
            return JsonResponse({"ok": False, "error": "POST required"}, status=405)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "error": "Invalid JSON"}, status=400)

        product_ids = payload.get("product_ids") or []
        if not isinstance(product_ids, list) or not product_ids:
            return JsonResponse({"ok": False, "error": "product_ids required"}, status=400)

        try:
            normalized_ids = [int(pk) for pk in product_ids]
        except (TypeError, ValueError):
            return JsonResponse({"ok": False, "error": "Invalid product IDs"}, status=400)

        existing = Product.objects.in_bulk(normalized_ids)
        if len(existing) != len(set(normalized_ids)):
            return JsonResponse({"ok": False, "error": "Some products not found"}, status=400)

        with transaction.atomic():
            for sort_index, product_id in enumerate(normalized_ids, start=1):
                product = existing[product_id]
                if product.sort_order != sort_index:
                    product.sort_order = sort_index
                    product.save(update_fields=["sort_order"])

        return JsonResponse({"ok": True})


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
