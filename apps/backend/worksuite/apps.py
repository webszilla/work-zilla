from django.apps import AppConfig

class MonitorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.backend.worksuite"
    label = "monitor"  # Keep old app label to avoid DB table renames.
