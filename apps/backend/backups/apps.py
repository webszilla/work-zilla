from django.apps import AppConfig


class BackupsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.backups"

    def ready(self):
        from .registry_defaults import register_defaults

        register_defaults()
