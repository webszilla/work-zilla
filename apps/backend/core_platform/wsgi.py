"""
WSGI config for platform project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "apps.backend.core_platform.settings")

application = get_wsgi_application()
