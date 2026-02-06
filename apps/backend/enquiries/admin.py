from django.contrib import admin

from .models import Enquiry


@admin.register(Enquiry)
class EnquiryAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "mobile_number", "product", "status", "created_at")
    list_filter = ("status", "product")
    search_fields = ("name", "email", "mobile_number")
    ordering = ("-created_at",)
    readonly_fields = ("ip_address", "user_agent", "created_at")
