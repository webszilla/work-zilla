from django.apps import AppConfig


class WhatsappAutomationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.modules.whatsapp_automation"
    verbose_name = "WhatsApp Automation"

    def ready(self):
        from . import signals  # noqa: F401
