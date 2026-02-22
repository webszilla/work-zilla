import logging
import os
import re
from collections.abc import Iterable

import requests
from django.conf import settings


logger = logging.getLogger(__name__)

DEFAULT_GRAPH_API_VERSION = "v21.0"
DEFAULT_TIMEOUT_SECONDS = 15


def _db_whatsapp_cloud_settings():
    try:
        from apps.backend.worksuite.saas_admin.models import WhatsAppCloudSettings
        return WhatsAppCloudSettings.objects.filter(provider="meta_whatsapp_cloud").first()
    except Exception:
        # Covers import/migration timing and optional availability.
        return None


def _get_setting(name: str, default: str = "") -> str:
    db_settings = _db_whatsapp_cloud_settings()
    db_map = {
        "WHATSAPP_ACCESS_TOKEN": "access_token",
        "WHATSAPP_PHONE_NUMBER_ID": "phone_number_id",
        "WHATSAPP_ADMIN_PHONE": "admin_phone",
        "WHATSAPP_TEMPLATE_ADMIN_NEW_USER": "admin_template_name",
        "WHATSAPP_TEMPLATE_USER_WELCOME": "user_welcome_template_name",
        "WHATSAPP_TEMPLATE_LANGUAGE": "template_language",
        "WHATSAPP_GRAPH_API_VERSION": "graph_api_version",
    }
    db_attr = db_map.get(name)
    if db_settings and db_attr:
        try:
            if getattr(db_settings, "is_active", False):
                db_value = getattr(db_settings, db_attr, "")
                if db_value not in (None, ""):
                    return str(db_value).strip()
        except Exception:
            pass
    value = getattr(settings, name, None)
    if value is None or value == "":
        value = os.environ.get(name, default)
    if value is None:
        return default
    return str(value).strip()


def _normalize_whatsapp_to(value: str) -> str:
    digits = re.sub(r"\D", "", (value or "").strip())
    # WhatsApp Cloud API expects international number (E.164 digits, without '+').
    if not digits:
        return ""
    if len(digits) < 8 or len(digits) > 15:
        return ""
    return digits


def _coerce_template_variables(variables) -> list[str]:
    if variables is None:
        return []
    if isinstance(variables, dict):
        return [str(v) for v in variables.values()]
    if isinstance(variables, (list, tuple)):
        return [str(v) for v in variables]
    if isinstance(variables, Iterable) and not isinstance(variables, (str, bytes)):
        return [str(v) for v in variables]
    return [str(variables)]


def _safe_int(value: str, default: int) -> int:
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def _get_timeout_seconds(default: int = DEFAULT_TIMEOUT_SECONDS) -> int:
    db_settings = _db_whatsapp_cloud_settings()
    if db_settings and getattr(db_settings, "is_active", False):
        try:
            timeout_seconds = int(getattr(db_settings, "timeout_seconds", default) or default)
            if timeout_seconds > 0:
                return timeout_seconds
        except (TypeError, ValueError):
            pass
    return _safe_int(_get_setting("WHATSAPP_HTTP_TIMEOUT_SECONDS", str(default)), default)


def send_whatsapp_message(to, template_name, variables):
    """
    Send a WhatsApp Cloud API template message.

    Returns True on success, False on failure/skip.
    """
    access_token = _get_setting("WHATSAPP_ACCESS_TOKEN")
    phone_number_id = _get_setting("WHATSAPP_PHONE_NUMBER_ID")
    language_code = _get_setting("WHATSAPP_TEMPLATE_LANGUAGE", "en_US")
    graph_api_version = _get_setting("WHATSAPP_GRAPH_API_VERSION", DEFAULT_GRAPH_API_VERSION)
    timeout_seconds = _get_timeout_seconds(DEFAULT_TIMEOUT_SECONDS)

    normalized_to = _normalize_whatsapp_to(to)
    if not normalized_to:
        logger.warning("WhatsApp send skipped: invalid destination number")
        return False

    if not template_name:
        logger.warning("WhatsApp send skipped: template_name is missing")
        return False

    if not access_token or not phone_number_id:
        logger.info(
            "WhatsApp send skipped: missing config (%s%s)",
            "WHATSAPP_ACCESS_TOKEN " if not access_token else "",
            "WHATSAPP_PHONE_NUMBER_ID" if not phone_number_id else "",
        )
        return False

    body_params = [
        {"type": "text", "text": value}
        for value in _coerce_template_variables(variables)
    ]
    components = [{"type": "body", "parameters": body_params}] if body_params else []

    payload = {
        "messaging_product": "whatsapp",
        "to": normalized_to,
        "type": "template",
        "template": {
            "name": str(template_name).strip(),
            "language": {"code": language_code},
        },
    }
    if components:
        payload["template"]["components"] = components

    url = f"https://graph.facebook.com/{graph_api_version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=timeout_seconds)
    except requests.RequestException:
        logger.exception("WhatsApp send failed (network error) to=%s template=%s", normalized_to, template_name)
        return False

    if 200 <= response.status_code < 300:
        logger.info("WhatsApp template sent to=%s template=%s", normalized_to, template_name)
        return True

    response_text = (response.text or "")[:1000]
    logger.error(
        "WhatsApp send failed status=%s to=%s template=%s response=%s",
        response.status_code,
        normalized_to,
        template_name,
        response_text,
    )
    return False
