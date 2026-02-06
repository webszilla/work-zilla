import json
import logging
from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .models import EventMetric


_logger = logging.getLogger("workzilla.observability")

_DROP_KEYS = {
    "password",
    "pass",
    "token",
    "secret",
    "company_key",
    "email",
    "image",
    "file",
    "screenshot",
    "data",
}


def _truncate(value, limit=200):
    text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _sanitize_meta(meta):
    if not meta:
        return {}
    if isinstance(meta, (str, int, float, bool)):
        return _truncate(meta)
    if isinstance(meta, list):
        return [_sanitize_meta(item) for item in meta]
    if isinstance(meta, dict):
        sanitized = {}
        for key, value in meta.items():
            key_str = str(key)
            if key_str.lower() in _DROP_KEYS:
                continue
            sanitized[key_str] = _sanitize_meta(value)
        return sanitized
    return _truncate(meta)


def log_event(
    event_type,
    *,
    org=None,
    user=None,
    product_slug=None,
    device_id=None,
    employee_id=None,
    status=None,
    meta=None,
    request=None,
):
    payload = {
        "ts": timezone.now().isoformat(),
        "event_type": event_type,
        "status": status or "",
        "org_id": getattr(org, "id", None),
        "user_id": getattr(user, "id", None),
        "product_slug": product_slug or "",
        "device_id": device_id or "",
        "employee_id": employee_id,
        "meta": _sanitize_meta(meta),
    }

    if request is not None:
        payload.update({
            "ip": request.META.get("REMOTE_ADDR", ""),
            "path": request.path,
            "method": request.method,
        })

    try:
        _logger.info(json.dumps(payload, ensure_ascii=True))
    except Exception:
        _logger.exception("observability_log_failed")

    if getattr(settings, "OBS_METRICS_ENABLED", False):
        _increment_metric(
            event_type,
            status=status,
            org=org,
            product_slug=product_slug,
        )


def _increment_metric(event_type, *, status=None, org=None, product_slug=None):
    if org is None:
        return
    now = timezone.now()
    metric_event = event_type if not status else f"{event_type}:{status}"
    product_slug = product_slug or ""
    try:
        metric, created = EventMetric.objects.update_or_create(
            date=now.date(),
            organization=org,
            product_slug=product_slug,
            event_type=metric_event,
            defaults={"count": 1, "last_seen_at": now},
        )
        if not created:
            EventMetric.objects.filter(pk=metric.pk).update(
                count=F("count") + 1,
                last_seen_at=now,
            )
    except Exception:
        _logger.exception("observability_metric_failed")
