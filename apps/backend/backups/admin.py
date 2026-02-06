from django.contrib import admin

from .models import BackupRecord, BackupAuditLog


@admin.register(BackupRecord)
class BackupRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "product", "status", "requested_at", "completed_at")
    list_filter = ("status", "product")
    search_fields = ("id", "organization__name", "product__name")


@admin.register(BackupAuditLog)
class BackupAuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "organization", "product", "action", "status", "actor_type")
    list_filter = ("action", "status", "actor_type")
    search_fields = ("organization__name", "product__name", "trace_id")
