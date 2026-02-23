from django.apps import AppConfig


class BackupsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.backups"

    def ready(self):
        # Register default org-data JSON exporter/restorer handlers.
        from .org_admin_snapshot import register_snapshot_handlers

        register_snapshot_handlers()
