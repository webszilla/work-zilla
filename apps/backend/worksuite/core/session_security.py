from __future__ import annotations

from typing import Optional

from django.utils import timezone

from core.access_control import get_user_organization
from core.models import OrganizationSettings, UserLoginActivity

DEFAULT_SESSION_TIMEOUT_MINUTES = 30
MIN_SESSION_TIMEOUT_MINUTES = 1
MAX_SESSION_TIMEOUT_MINUTES = 1440
LOGIN_ACTIVITY_RETENTION_DAYS = 30


def clamp_session_timeout_minutes(value, default=DEFAULT_SESSION_TIMEOUT_MINUTES):
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        minutes = int(default)
    if minutes < MIN_SESSION_TIMEOUT_MINUTES:
        return MIN_SESSION_TIMEOUT_MINUTES
    if minutes > MAX_SESSION_TIMEOUT_MINUTES:
        return MAX_SESSION_TIMEOUT_MINUTES
    return minutes


def get_org_session_timeout_minutes(org):
    if not org:
        return DEFAULT_SESSION_TIMEOUT_MINUTES
    settings_obj = OrganizationSettings.objects.filter(organization=org).only("session_timeout_minutes").first()
    return clamp_session_timeout_minutes(
        getattr(settings_obj, "session_timeout_minutes", DEFAULT_SESSION_TIMEOUT_MINUTES),
        default=DEFAULT_SESSION_TIMEOUT_MINUTES,
    )


def apply_request_session_timeout(request, org=None, minutes: Optional[int] = None):
    timeout_minutes = clamp_session_timeout_minutes(
        minutes if minutes is not None else get_org_session_timeout_minutes(org)
    )
    request.session.set_expiry(timeout_minutes * 60)
    return timeout_minutes


def _request_ip_address(request):
    forwarded_for = str(request.META.get("HTTP_X_FORWARDED_FOR") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return str(request.META.get("REMOTE_ADDR") or "").strip() or None


def log_user_login_activity(request, user, org=None, profile=None):
    target_org = org or get_user_organization(user, profile)
    if not target_org:
        return None
    UserLoginActivity.purge_older_than_days(LOGIN_ACTIVITY_RETENTION_DAYS)
    return UserLoginActivity.objects.create(
        organization=target_org,
        user=user,
        username=str(getattr(user, "username", "") or "").strip(),
        email=str(getattr(user, "email", "") or "").strip(),
        role=str(getattr(profile, "role", "") or "").strip(),
        session_key=str(getattr(request.session, "session_key", "") or ""),
        ip_address=_request_ip_address(request),
        user_agent=str(request.META.get("HTTP_USER_AGENT") or "").strip(),
        login_at=timezone.now(),
    )
