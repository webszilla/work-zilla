from __future__ import annotations

from django.http import HttpResponseForbidden, JsonResponse
from django.utils import timezone

from apps.backend.retention.models import RetentionStatus, resolve_effective_policy
from apps.backend.retention.utils.retention import (
    evaluate_tenant_status,
    get_tenant_status,
    is_action_allowed_in_grace,
    is_export_request,
    is_write_method,
    resolve_org_from_request,
)


EXEMPT_PATH_PREFIXES = (
    "/static/",
    "/media/",
    "/api/health",
    "/api/public/",
)

ARCHIVED_ALLOWED_PREFIXES = (
    "/api/auth/",
    "/auth/",
    "/accounts/",
    "/app/billing",
    "/app/plans",
    "/app/bank-transfer",
    "/my-account/bank-transfer",
    "/my-account/bank-transfer/",
    "/my-account/billing/",
    "/app/saas-admin/billing",
    "/dashboard/billing/",
    "/dashboard/plans/",
    "/dashboard/bank-transfer/",
    "/api/dashboard/billing",
    "/api/dashboard/billing-profile",
    "/api/dashboard/bank-transfer",
    "/api/dashboard/plans",
    "/api/saas-admin/billing",
    "/api/saas-admin/billing-history",
)

ARCHIVED_READONLY_ENDPOINTS = (
    "/api/saas-admin/settings/retention-policy",
    "/api/auth/me",
    "/api/auth/subscriptions",
)


def _is_system_admin_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    try:
        from core.models import UserProfile
        profile = UserProfile.objects.filter(user=user).only("role").first()
    except Exception:
        profile = None
    role = str(getattr(profile, "role", "") or "").strip().lower().replace("-", "_").replace(" ", "_")
    return role in {"superadmin", "super_admin", "saas_admin", "saasadmin"}


class RetentionEnforcementMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        for prefix in EXEMPT_PATH_PREFIXES:
            if request.path.startswith(prefix):
                return self.get_response(request)

        user = getattr(request, "user", None)
        if _is_system_admin_user(user):
            return self.get_response(request)

        organization = resolve_org_from_request(request)
        if not organization:
            return self.get_response(request)

        retention = get_tenant_status(organization)
        if retention.last_evaluated_at is None:
            retention = evaluate_tenant_status(organization)

        status = retention.status
        if status == RetentionStatus.GRACE_READONLY:
            if is_write_method(request.method):
                if _is_billing_allowed(request):
                    return self.get_response(request)
                policy = resolve_effective_policy(organization)
                if is_action_allowed_in_grace(policy, "export") and is_export_request(request):
                    return self.get_response(request)
                until_label = _format_date(retention.grace_until)
                detail = "Subscription expired. Account is read-only"
                if until_label:
                    detail = f"{detail} until {until_label}."
                else:
                    detail = f"{detail}."
                return _blocked_response(request, detail)
            return self.get_response(request)

        if status in (RetentionStatus.ARCHIVED, RetentionStatus.PENDING_DELETE, RetentionStatus.DELETED):
            if _is_archived_allowed(request):
                return self.get_response(request)
            return _blocked_response(request, "Account archived. Renew to restore access.")

        return self.get_response(request)


def _blocked_response(request, reason):
    if request.path.startswith("/api/"):
        return JsonResponse({"detail": reason}, status=403)
    return HttpResponseForbidden("Access denied.")


def _format_date(value):
    if not value:
        return ""
    try:
        return timezone.localtime(value).date().isoformat()
    except Exception:
        return ""


def _is_billing_allowed(request):
    path = request.path or ""
    for prefix in ARCHIVED_ALLOWED_PREFIXES:
        if path.startswith(prefix):
            return True
    return False


def _is_archived_allowed(request):
    path = request.path or ""
    if request.method == "GET":
        for prefix in ARCHIVED_ALLOWED_PREFIXES:
            if path.startswith(prefix):
                return True
        for prefix in ARCHIVED_READONLY_ENDPOINTS:
            if path.startswith(prefix):
                return True
    return False
