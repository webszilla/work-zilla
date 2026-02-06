from decimal import Decimal
from datetime import timedelta

from django.db import models, transaction
from django.db.models import Sum, Q, F
from django.utils import timezone

from core.models import Subscription, UserProfile
from .models import OrgSubscription, OrgAddOn, StorageFile, StorageFolder, OrgBandwidthUsage
from .usage_cache import get_usage_for_org
from .storage_backend import storage_backend
from core.subscription_utils import is_subscription_active, normalize_subscription_end_date, maybe_expire_subscription, resolve_plan_limits

ADDON_SLOT_GB = 250
STORAGE_PRODUCT_SLUG = "storage"


def get_active_storage_subscription(org):
    if not org:
        return None
    sub = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"))
        .filter(plan__product__slug=STORAGE_PRODUCT_SLUG)
        .order_by("-start_date")
        .first()
    )
    if not sub:
        sub = (
            OrgSubscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .select_related("plan", "product")
            .order_by("-updated_at")
            .first()
        )
        if sub and sub.status == "trialing" and sub.renewal_date:
            if sub.renewal_date < timezone.now().date():
                sub.status = "expired"
                sub.save(update_fields=["status", "updated_at"])
                return None
        if sub and sub.plan:
            return sub
        return None
    normalize_subscription_end_date(sub)
    if not is_subscription_active(sub):
        maybe_expire_subscription(sub)
        return None
    return sub


def get_storage_access_state(org):
    if not org:
        return "none", None
    sub = get_active_storage_subscription(org)
    if sub:
        return "active", sub
    from core.models import SubscriptionHistory, Subscription
    from .models import OrgSubscription
    has_history = SubscriptionHistory.objects.filter(
        organization=org, plan__product__slug=STORAGE_PRODUCT_SLUG
    ).exists()
    has_sub = Subscription.objects.filter(
        organization=org, plan__product__slug=STORAGE_PRODUCT_SLUG
    ).exists()
    has_org_sub = OrgSubscription.objects.filter(organization=org).exists()
    if has_history or has_sub or has_org_sub:
        return "read_only", None
    return "none", None


def get_plan_storage_gb(plan, limits_override=None):
    if not plan:
        return 0
    if hasattr(plan, "storage_limit_gb"):
        return int(plan.storage_limit_gb or 0)
    limits = limits_override if isinstance(limits_override, dict) else (plan.limits if isinstance(plan.limits, dict) else {})
    value = limits.get("storage_gb") or limits.get("storage_limit_gb") or 0
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def get_plan_bandwidth_limit_gb(plan, limits_override=None):
    if not plan:
        return 0, False
    if hasattr(plan, "bandwidth_limit_gb_monthly"):
        limit = int(getattr(plan, "bandwidth_limit_gb_monthly", 0) or 0)
        return limit, bool(getattr(plan, "is_bandwidth_limited", True))
    limits = limits_override if isinstance(limits_override, dict) else (plan.limits if isinstance(plan.limits, dict) else {})
    limit = limits.get("bandwidth_limit_gb_monthly") or limits.get("bandwidth_gb") or 0
    is_limited = limits.get("is_bandwidth_limited")
    if is_limited is None:
        is_limited = bool(limit)
    try:
        return int(limit or 0), bool(is_limited)
    except (TypeError, ValueError):
        return 0, bool(is_limited)


def get_plan_user_limit(plan, limits_override=None):
    if not plan:
        return 0
    if hasattr(plan, "max_users"):
        value = plan.max_users
        if value is None:
            return 0
        return int(value or 0)
    limits = limits_override if isinstance(limits_override, dict) else (plan.limits if isinstance(plan.limits, dict) else {})
    value = limits.get("max_users") or limits.get("user_limit") or 0
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def get_org_user_count(org):
    if not org:
        return 0
    return UserProfile.objects.filter(organization=org).count()


def get_org_storage_limits(org):
    sub = get_active_storage_subscription(org)
    if not sub or not sub.plan:
        return {
            "subscription": None,
            "plan_storage_gb": 0,
            "addon_slots": 0,
            "total_storage_gb": 0,
        }
    effective_limits = resolve_plan_limits(sub)
    plan_storage_gb = get_plan_storage_gb(sub.plan, limits_override=effective_limits)
    addon_slots = 0
    addon_storage_gb = 0
    if hasattr(sub, "addon_count"):
        addon_slots = int(sub.addon_count or 0)
        addon_storage_gb = addon_slots * ADDON_SLOT_GB
    else:
        addon_slots = (
            OrgAddOn.objects
            .filter(organization=org, addon__product=sub.product)
            .aggregate(total=Sum("quantity"))
            .get("total")
            or 0
        )
        addon_storage_gb = (
            OrgAddOn.objects
            .filter(organization=org, addon__product=sub.product)
            .aggregate(
                total=models.Sum(
                    models.ExpressionWrapper(
                        F("quantity") * F("addon__storage_gb"),
                        output_field=models.IntegerField(),
                    )
                )
            )
            .get("total")
            or 0
        )
    total_storage_gb = plan_storage_gb + int(addon_storage_gb or 0)
    return {
        "subscription": sub,
        "plan_storage_gb": plan_storage_gb,
        "addon_slots": addon_slots,
        "total_storage_gb": total_storage_gb,
        "effective_limits": effective_limits,
    }


def get_org_storage_usage_bytes(org):
    if not org:
        return 0
    usage = get_usage_for_org(org)
    return int(usage.used_storage_bytes or 0)


def storage_gb_to_bytes(value_gb):
    try:
        return int(Decimal(int(value_gb)) * Decimal(1024 ** 3))
    except (TypeError, ValueError):
        return 0


def _get_bandwidth_cycle_start(sub, now=None):
    current = now or timezone.now()
    if not sub:
        return current.date()
    if hasattr(sub, "billing_cycle"):
        cycle = (getattr(sub, "billing_cycle", None) or "monthly").lower()
        cycle_days = 365 if cycle == "yearly" else 30
        end_dt = sub.end_date
        if getattr(sub, "status", "") == "trialing" and sub.trial_end:
            end_dt = sub.trial_end
        if end_dt:
            return (end_dt - timedelta(days=cycle_days)).date()
        if sub.start_date:
            return sub.start_date.date()
        return (current - timedelta(days=cycle_days)).date()
    cycle_days = 30
    if getattr(sub, "renewal_date", None):
        return sub.renewal_date - timedelta(days=cycle_days)
    return (current - timedelta(days=cycle_days)).date()


def get_org_bandwidth_status(org):
    sub = get_active_storage_subscription(org)
    if not sub or not sub.plan:
        return {
            "total_allowed_bandwidth_gb": 0,
            "used_bandwidth_gb": 0,
            "remaining_bandwidth_gb": 0,
            "is_bandwidth_limited": False,
        }
    effective_limits = resolve_plan_limits(sub)
    limit_gb, is_limited = get_plan_bandwidth_limit_gb(sub.plan, limits_override=effective_limits)
    limit_bytes = storage_gb_to_bytes(limit_gb)
    cycle_start = _get_bandwidth_cycle_start(sub)
    usage = OrgBandwidthUsage.objects.filter(
        organization=org,
        billing_cycle_start=cycle_start,
    ).first()
    used_bytes = int(usage.used_bandwidth_bytes or 0) if usage else 0
    remaining_bytes = max(0, limit_bytes - used_bytes) if is_limited and limit_bytes else 0
    used_gb = int(used_bytes / (1024 ** 3))
    remaining_gb = int(remaining_bytes / (1024 ** 3))
    return {
        "total_allowed_bandwidth_gb": int(limit_gb or 0),
        "used_bandwidth_gb": used_gb,
        "remaining_bandwidth_gb": remaining_gb,
        "is_bandwidth_limited": bool(is_limited),
    }


def apply_bandwidth_usage(org, size_bytes):
    sub = get_active_storage_subscription(org)
    if not sub or not sub.plan:
        return True, {
            "limit_bytes": 0,
            "used_bytes": 0,
            "remaining_bytes": 0,
            "is_limited": False,
        }
    effective_limits = resolve_plan_limits(sub)
    limit_gb, is_limited = get_plan_bandwidth_limit_gb(sub.plan, limits_override=effective_limits)
    limit_bytes = storage_gb_to_bytes(limit_gb)
    cycle_start = _get_bandwidth_cycle_start(sub)
    size_bytes = int(size_bytes or 0)
    with transaction.atomic():
        usage, _ = OrgBandwidthUsage.objects.select_for_update().get_or_create(
            organization=org,
            billing_cycle_start=cycle_start,
            defaults={"used_bandwidth_bytes": 0},
        )
        used_bytes = int(usage.used_bandwidth_bytes or 0)
        projected = used_bytes + size_bytes
        if is_limited and limit_bytes and projected > limit_bytes:
            return False, {
                "limit_bytes": limit_bytes,
                "used_bytes": used_bytes,
                "remaining_bytes": max(0, limit_bytes - used_bytes),
                "is_limited": True,
            }
        usage.used_bandwidth_bytes = projected
        usage.save(update_fields=["used_bandwidth_bytes", "updated_at"])
    return True, {
        "limit_bytes": limit_bytes,
        "used_bytes": projected,
        "remaining_bytes": max(0, limit_bytes - projected) if limit_bytes else 0,
        "is_limited": bool(is_limited),
    }


def get_org_storage_usage(org):
    limits = get_org_storage_limits(org)
    plan = limits.get("subscription").plan if limits.get("subscription") else None
    max_users = get_plan_user_limit(plan, limits_override=limits.get("effective_limits"))
    user_count = get_org_user_count(org)
    used_bytes = get_org_storage_usage_bytes(org)
    limit_bytes = storage_gb_to_bytes(limits.get("total_storage_gb", 0))
    remaining_bytes = max(0, limit_bytes - used_bytes) if limit_bytes else 0
    usage_percent = int((used_bytes / limit_bytes) * 100) if limit_bytes else 0
    return {
        "used_bytes": used_bytes,
        "limit_bytes": limit_bytes,
        "remaining_bytes": remaining_bytes,
        "usage_percent": usage_percent,
        "plan_storage_gb": limits.get("plan_storage_gb", 0),
        "addon_slots": limits.get("addon_slots", 0),
        "total_storage_gb": limits.get("total_storage_gb", 0),
        "max_users": max_users,
        "user_count": user_count,
        "subscription": limits.get("subscription"),
    }


def check_storage_available():
    try:
        storage_backend.exists("storage")
        return True
    except Exception:
        return False


def can_store_bytes(org, extra_bytes):
    usage = get_org_storage_usage(org)
    limit_bytes = usage.get("limit_bytes") or 0
    if not limit_bytes:
        return False, usage
    projected = usage.get("used_bytes", 0) + int(extra_bytes or 0)
    return projected <= limit_bytes, usage


def total_allowed_storage_gb(org):
    limits = get_org_storage_limits(org)
    return int(limits.get("total_storage_gb") or 0)


def is_system_sync_enabled(org):
    if not org:
        return False
    if not get_active_storage_subscription(org):
        return False
    from .models import StorageGlobalSettings, StorageOrganizationSettings
    global_settings = StorageGlobalSettings.get_solo()
    org_settings, _ = StorageOrganizationSettings.objects.get_or_create(organization=org)
    return bool(global_settings.sync_globally_enabled and org_settings.sync_enabled)
