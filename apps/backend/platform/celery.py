import os

from celery import Celery


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "apps.backend.platform.settings")

app = Celery("workzilla")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
