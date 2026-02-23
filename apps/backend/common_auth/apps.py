from django.apps import AppConfig


class CommonAuthConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.common_auth"

    def ready(self):
        # Register signal receivers.
        from . import signals  # noqa: F401
