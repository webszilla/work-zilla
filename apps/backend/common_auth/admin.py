from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from .models import Organization, Subscription, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "is_staff",
        "is_superuser",
        "organization",
    )
    list_filter = BaseUserAdmin.list_filter + ("organization",)
    search_fields = BaseUserAdmin.search_fields + ("organization__name",)
    fieldsets = BaseUserAdmin.fieldsets + (
        (_("Organization"), {"fields": ("organization",)}),
    )


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at", "updated_at")
    search_fields = ("name",)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("organization", "product_code", "status", "started_at", "ends_at")
    list_filter = ("status", "product_code")
