from django.apps import AppConfig

class MonitorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.monitor"   # NEW module path
    label = "monitor"                        # CRITICAL: keep old app label
