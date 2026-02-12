from django.contrib import admin

from .models import SiteBrandSettings, Product, ProductAlias, ProductRouteMapping


@admin.register(SiteBrandSettings)
class SiteBrandSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "site_name",
        "primary_color",
        "secondary_color",
        "primary_button_color",
        "secondary_button_color",
    )

    def has_add_permission(self, request):
        return not SiteBrandSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("display_name", "key", "internal_code_name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("display_name", "key", "internal_code_name")
    ordering = ("display_name",)


@admin.register(ProductAlias)
class ProductAliasAdmin(admin.ModelAdmin):
    list_display = ("alias_key", "alias_text", "context", "product", "is_active")
    list_filter = ("context", "is_active")
    search_fields = ("alias_key", "alias_text", "product__display_name", "product__key")
    ordering = ("product", "context", "alias_key")


@admin.register(ProductRouteMapping)
class ProductRouteMappingAdmin(admin.ModelAdmin):
    list_display = ("public_slug", "product", "redirect_enabled")
    list_filter = ("redirect_enabled",)
    search_fields = ("public_slug", "product__display_name", "product__key")
    ordering = ("public_slug",)
