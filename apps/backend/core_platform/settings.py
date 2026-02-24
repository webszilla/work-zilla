"""
Django settings for the Work Zilla platform backend.
"""

from pathlib import Path
import os
import sys


# apps/backend
BASE_DIR = Path(__file__).resolve().parent.parent

# Repo root (work-zilla/)
REPO_ROOT = BASE_DIR.parent.parent

# React build output copied here (apps/frontend/dist -> frontend_dist).
FRONTEND_DIST = BASE_DIR / "frontend_dist"

# Ensure legacy "core"/"dashboard" imports resolve from worksuite app package.
WORKSUITE_ROOT = BASE_DIR / "worksuite"
if WORKSUITE_ROOT.is_dir() and str(WORKSUITE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSUITE_ROOT))


def _csv_env(name, default=""):
    raw = os.environ.get(name, default).strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _bool_env(name, default="0"):
    return os.environ.get(name, default) == "1"

ENVIRONMENT = os.environ.get("ENVIRONMENT", "local").strip().lower()


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-change-me")

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = [
    "getworkzilla.com",
    "www.getworkzilla.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
]


CORS_ALLOWED_ORIGINS = _csv_env("DJANGO_CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = _csv_env("DJANGO_CSRF_TRUSTED_ORIGINS")
CORS_ALLOW_CREDENTIALS = _bool_env("DJANGO_CORS_ALLOW_CREDENTIALS", "1")
CORS_ALLOW_ALL_ORIGINS = _bool_env("DJANGO_CORS_ALLOW_ALL_ORIGINS", "0")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "apps.backend.brand.apps.BrandConfig",
    "apps.backend.common_ui_theme.apps.CommonUiThemeConfig",
    "apps.backend.common_auth.apps.CommonAuthConfig",
    "apps.backend.enquiries.apps.EnquiriesConfig",
    "apps.backend.products.apps.ProductsConfig",
    "apps.backend.website.apps.WebsiteConfig",
    "apps.backend.retention.apps.RetentionConfig",
    "apps.backend.backups.apps.BackupsConfig",
    "saas_admin.monitoring.apps.MonitoringConfig",
    "apps.backend.media_library.apps.MediaLibraryConfig",
    "apps.backend.storage.apps.StorageConfig",
    "apps.backend.business_autopilot.apps.BusinessAutopilotConfig",
    "apps.backend.modules.whatsapp_automation.apps.WhatsappAutomationConfig",
    "core.apps.CoreConfig",
    "dashboard.apps.DashboardConfig",
    "apps.backend.worksuite.apps.MonitorConfig",
    "saas_admin.apps.SaasAdminConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "apps.backend.core_platform.middleware.LegacyMonitorRedirectMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.backend.core_platform.middleware.ProductRouteRedirectMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "dashboard.middleware.OrganizationTimezoneMiddleware",
    "apps.backend.retention.middleware.RetentionEnforcementMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.backend.core_platform.middleware.ApiV2ErrorNormalizeMiddleware",
]

ROOT_URLCONF = "apps.backend.core_platform.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [
            BASE_DIR / "common_ui_theme" / "templates",
            FRONTEND_DIST,
            BASE_DIR / "templates",
        ],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "apps.backend.brand.context_processors.brand_defaults",
                "apps.backend.brand.context_processors.product_branding",
                "apps.backend.enquiries.context_processors.enquiry_widget",
                "dashboard.context_processors.subscription_context",
                "dashboard.context_processors.theme_context",
                "dashboard.context_processors.site_nav_context",
            ],
        },
    },
]

WSGI_APPLICATION = "apps.backend.core_platform.wsgi.application"


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


STATIC_URL = "/static/"
STATICFILES_DIRS = [
    BASE_DIR / "static",
    FRONTEND_DIST,
]
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", REPO_ROOT / "env" / "media"))

# Backblaze B2 (S3-compatible) defaults (used by DynamicMediaStorage if enabled).
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME", "")
AWS_S3_ENDPOINT_URL = os.environ.get("AWS_S3_ENDPOINT_URL", "")
AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", "")
AWS_S3_SIGNATURE_VERSION = os.environ.get("AWS_S3_SIGNATURE_VERSION", "s3v4")
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_S3_ADDRESSING_STYLE = os.environ.get("AWS_S3_ADDRESSING_STYLE", "virtual")
try:
    import storages  # noqa: F401
    if "storages" not in INSTALLED_APPS:
        INSTALLED_APPS.append("storages")
except Exception:
    pass
STORAGES = {
    "default": {
        "BACKEND": "apps.backend.core_platform.storage.DynamicMediaStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Backup configuration
BACKUP_ZIP_TTL_HOURS = int(os.environ.get("BACKUP_ZIP_TTL_HOURS", "24"))
BACKUP_RATE_LIMIT_SECONDS = int(os.environ.get("BACKUP_RATE_LIMIT_SECONDS", "3600"))
BACKUP_MAX_SIZE_MB = int(os.environ.get("BACKUP_MAX_SIZE_MB", "5120"))

# Celery (async restore / backup tasks)
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
try:
    import redis  # noqa: F401
except Exception:
    CELERY_BROKER_URL = "memory://"
    CELERY_RESULT_BACKEND = "cache+memory://"
CELERY_BEAT_SCHEDULE = {
    "saas-admin-system-backup-scheduler-tick": {
        "task": "saas_admin.system_backup_scheduler_tick",
        "schedule": 900.0,  # every 15 minutes
    }
}
BACKUP_INCLUDE_PREFIXES = os.environ.get(
    "BACKUP_INCLUDE_PREFIXES",
    "critical/org_{org_id}/product_{product_id}/,critical/org_{org_id}/assets/",
).split(",")
BACKUP_EXCLUDE_PREFIXES = os.environ.get(
    "BACKUP_EXCLUDE_PREFIXES",
    "screenshots/,thumbnails/,previews/,cache/,logs/,debug/,tmp/,temp/",
).split(",")


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "common_auth.User"
LOGIN_URL = "/auth/login/"
LOGIN_REDIRECT_URL = "/app/"

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "no-reply@workzilla.local")
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend" if DEBUG else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = _bool_env("EMAIL_USE_TLS", "1")
EMAIL_USE_SSL = _bool_env("EMAIL_USE_SSL", "0")
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "20"))
OBS_METRICS_ENABLED = os.environ.get("OBS_METRICS_ENABLED", "1") == "1"
ALERT_EMAIL_FROM = os.environ.get("ALERT_EMAIL_FROM", DEFAULT_FROM_EMAIL)
_alert_to_raw = os.environ.get("ALERT_EMAIL_TO_DEFAULT", "")
ALERT_EMAIL_TO_DEFAULT = [e.strip() for e in _alert_to_raw.split(",") if e.strip()]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = _bool_env("DJANGO_SECURE_SSL_REDIRECT", "0")
CSRF_COOKIE_SECURE = _bool_env("DJANGO_CSRF_COOKIE_SECURE", "0")
SESSION_COOKIE_SECURE = _bool_env("DJANGO_SESSION_COOKIE_SECURE", "0")
