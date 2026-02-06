from django.conf import settings
from django.core.cache import cache
from django.utils import timezone


def _now():
    return timezone.now()


def rate_limit(key, limit, window_seconds):
    if limit <= 0:
        return False
    cache_key = f"rl:{key}"
    current = cache.get(cache_key)
    if current is None:
        cache.set(cache_key, 1, timeout=window_seconds)
        return False
    try:
        current = int(current)
    except (TypeError, ValueError):
        current = 0
    if current >= limit:
        return True
    cache.incr(cache_key)
    return False


def get_storage_security_settings():
    return {
        "max_upload_mb": int(getattr(settings, "STORAGE_MAX_UPLOAD_MB", 100)),
        "allowed_content_types": getattr(settings, "STORAGE_ALLOWED_CONTENT_TYPES", []),
        "block_executables": bool(getattr(settings, "STORAGE_BLOCK_EXECUTABLES", True)),
        "rate_limit_user_per_min": int(getattr(settings, "STORAGE_RATE_LIMIT_USER_PER_MIN", 60)),
        "rate_limit_org_per_min": int(getattr(settings, "STORAGE_RATE_LIMIT_ORG_PER_MIN", 300)),
    }


def is_executable(filename):
    if not filename:
        return False
    lowered = filename.lower()
    return lowered.endswith((".exe", ".msi", ".bat", ".cmd", ".com", ".ps1"))


def validate_upload(upload, settings_obj):
    if not upload:
        return "file_required"
    max_bytes = settings_obj["max_upload_mb"] * 1024 * 1024
    if upload.size and upload.size > max_bytes:
        return "file_too_large"
    if settings_obj["block_executables"] and is_executable(upload.name or ""):
        return "blocked_file_type"
    allowed = settings_obj["allowed_content_types"]
    if allowed and (getattr(upload, "content_type", "") not in allowed):
        return "invalid_content_type"
    return ""
