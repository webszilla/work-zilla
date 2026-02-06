from __future__ import annotations

import logging
from typing import Callable, Dict, Iterable, List, Optional

from django.core.exceptions import PermissionDenied
from django.utils import timezone

from core.models import Organization, Subscription, UserProfile
from core.subscription_utils import get_effective_end_date

from apps.backend.retention.models import (
    EffectiveRetentionPolicy,
    RetentionStatus,
    TenantRetentionStatus,
    resolve_effective_policy,
    compute_retention_status,
)


logger = logging.getLogger(__name__)

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
EXPORT_PATH_HINTS = ("/export", "/exports", "export=")

_cleanup_registry: Dict[str, Callable[[Organization], None]] = {}


def register_product_cleanup(product_key: str, cleanup_fn: Callable[[Organization], None]) -> None:
    if not product_key:
        return
    _cleanup_registry[product_key] = cleanup_fn


def get_cleanup_handlers() -> Iterable[Callable[[Organization], None]]:
    return list(_cleanup_registry.values())


def run_cleanup_handlers(organization: Organization) -> bool:
    handlers = list(_cleanup_registry.values())
    if not handlers:
        return True
    ok = True
    for handler in handlers:
        try:
            handler(organization)
        except Exception:
            logger.exception("Retention cleanup handler failed", extra={"org_id": organization.id})
            ok = False
    return ok


def resolve_subscription_expiry(organization: Organization):
    sub = (
        Subscription.objects.filter(organization=organization)
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return None
    return get_effective_end_date(sub)


def evaluate_tenant_status(
    organization: Organization,
    now=None,
) -> TenantRetentionStatus:
    current = now or timezone.now()
    policy = resolve_effective_policy(organization)
    expires_at = resolve_subscription_expiry(organization)
    status, grace_until, archive_until, delete_at = compute_retention_status(
        expires_at, policy, now=current
    )
    retention, _ = TenantRetentionStatus.objects.get_or_create(organization=organization)
    updates = {
        "status": status,
        "subscription_expires_at": expires_at,
        "grace_until": grace_until,
        "archive_until": archive_until,
        "last_evaluated_at": current,
    }
    if status == RetentionStatus.PENDING_DELETE and delete_at:
        updates["archive_until"] = archive_until
    if status != retention.status or any(
        getattr(retention, key) != value for key, value in updates.items()
    ):
        for key, value in updates.items():
            setattr(retention, key, value)
        retention.save(update_fields=list(updates.keys()))
    return retention


def get_tenant_status(
    organization: Organization,
    now=None,
) -> TenantRetentionStatus:
    retention = TenantRetentionStatus.objects.filter(organization=organization).first()
    if not retention:
        return evaluate_tenant_status(organization, now=now)
    return retention


def is_write_method(method: str) -> bool:
    return method.upper() in WRITE_METHODS


def is_export_request(request) -> bool:
    path = request.path or ""
    if any(hint in path for hint in EXPORT_PATH_HINTS):
        return True
    query = request.META.get("QUERY_STRING", "") or ""
    return "export=" in query


def resolve_org_from_request(request) -> Optional[Organization]:
    org = getattr(request, "organization", None)
    if org:
        return org
    active_org_id = None
    if hasattr(request, "session"):
        active_org_id = request.session.get("active_org_id")
    if active_org_id:
        org = Organization.objects.filter(id=active_org_id).first()
        if org:
            return org
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return None
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    return Organization.objects.filter(owner=user).first()


def enforce_retention_for_org(
    organization: Organization,
    action: str = "write",
    now=None,
) -> None:
    status = get_tenant_status(organization, now=now)
    if status.status == RetentionStatus.GRACE_READONLY:
        if action == "write":
            raise PermissionDenied("Tenant is in read-only grace period.")
        return
    if status.status in (RetentionStatus.ARCHIVED, RetentionStatus.PENDING_DELETE, RetentionStatus.DELETED):
        raise PermissionDenied("Tenant is archived.")


def is_action_allowed_in_grace(policy: EffectiveRetentionPolicy, action: str) -> bool:
    if not action:
        return False
    return action in (policy.allowed_actions_during_grace or [])
