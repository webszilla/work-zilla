from django.contrib import admin

from .models import SiteBrandSettings


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
