from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "sort_order", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    ordering = ("sort_order", "name")
