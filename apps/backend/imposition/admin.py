from django.contrib import admin

from .models import (
    ImpositionAddonCatalog,
    ImpositionBillingRecord,
    ImpositionDataImport,
    ImpositionDevice,
    ImpositionJob,
    ImpositionLicense,
    ImpositionOrgAddon,
    ImpositionOrgSubscription,
    ImpositionPlan,
    ImpositionProductUser,
    ImpositionTemplate,
    ImpositionUsageLog,
)


@admin.action(description="Generate active license for selected subscriptions")
def generate_license_for_subscriptions(modeladmin, request, queryset):
    for sub in queryset:
        if sub.status not in ("active", "trialing"):
            continue
        ImpositionLicense.objects.get_or_create(
            organization=sub.organization,
            subscription=sub,
            defaults={
                "status": "active",
                "offline_grace_days": 3,
            },
        )


@admin.register(ImpositionPlan)
class ImpositionPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "device_limit", "is_active", "updated_at")
    list_filter = ("is_active", "code")
    search_fields = ("name", "code")


@admin.register(ImpositionOrgSubscription)
class ImpositionOrgSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "plan", "status", "starts_at", "ends_at")
    list_filter = ("status", "plan")
    search_fields = ("organization__name", "organization__company_key")
    actions = (generate_license_for_subscriptions,)


@admin.register(ImpositionOrgAddon)
class ImpositionOrgAddonAdmin(admin.ModelAdmin):
    list_display = ("organization", "addon_code", "quantity", "unit_price_monthly_inr", "is_active")
    list_filter = ("addon_code", "is_active")
    search_fields = ("organization__name", "organization__company_key")


@admin.register(ImpositionLicense)
class ImpositionLicenseAdmin(admin.ModelAdmin):
    list_display = ("code", "organization", "status", "offline_grace_days", "last_verified_at", "updated_at")
    list_filter = ("status",)
    search_fields = ("code", "organization__name", "organization__company_key")


@admin.register(ImpositionDevice)
class ImpositionDeviceAdmin(admin.ModelAdmin):
    list_display = ("device_id", "organization", "license", "os", "is_active", "last_active_at")
    list_filter = ("os", "is_active")
    search_fields = ("device_id", "device_name", "organization__name", "organization__company_key")


@admin.register(ImpositionProductUser)
class ImpositionProductUserAdmin(admin.ModelAdmin):
    list_display = ("organization", "user", "role", "status", "last_login", "updated_at")
    list_filter = ("status", "role")
    search_fields = ("organization__name", "organization__company_key", "user__username", "user__email")


@admin.register(ImpositionTemplate)
class ImpositionTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "template_type", "organization", "is_system", "updated_at")
    list_filter = ("template_type", "is_system")
    search_fields = ("name", "organization__name", "organization__company_key")


@admin.register(ImpositionJob)
class ImpositionJobAdmin(admin.ModelAdmin):
    list_display = ("id", "job_type", "organization", "status", "sheet_size", "updated_at")
    list_filter = ("job_type", "status", "sheet_size")
    search_fields = ("title", "organization__name", "organization__company_key")


@admin.register(ImpositionDataImport)
class ImpositionDataImportAdmin(admin.ModelAdmin):
    list_display = ("id", "import_type", "organization", "status", "row_count", "created_at")
    list_filter = ("import_type", "status")
    search_fields = ("source_filename", "organization__name", "organization__company_key")


@admin.register(ImpositionUsageLog)
class ImpositionUsageLogAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "event_type", "created_at")
    list_filter = ("event_type",)
    search_fields = ("organization__name", "organization__company_key")


@admin.register(ImpositionBillingRecord)
class ImpositionBillingRecordAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "organization", "plan_name", "amount", "currency", "status", "paid_at")
    list_filter = ("status", "currency")
    search_fields = ("invoice_number", "organization__name", "organization__company_key")


@admin.register(ImpositionAddonCatalog)
class ImpositionAddonCatalogAdmin(admin.ModelAdmin):
    list_display = ("addon_code", "addon_name", "product", "price_month_inr", "price_year_inr", "price_month_usd", "price_year_usd", "is_active")
    list_filter = ("product", "is_active")
    search_fields = ("addon_code", "addon_name", "product")
