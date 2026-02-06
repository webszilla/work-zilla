from django.utils import timezone

from core.models import Organization, Subscription, UserProfile


def resolve_org_for_user(user, session_org_id=None):
    profile = (
        UserProfile.objects
        .filter(user=user)
        .select_related("organization")
        .first()
    )
    org = None
    if user.is_superuser or (profile and profile.role in ("superadmin", "super_admin")):
        if session_org_id:
            org = Organization.objects.filter(id=session_org_id).first()
    if profile and profile.role == "dealer":
        return None, profile
    if not org:
        if profile and profile.organization:
            org = profile.organization
        else:
            org = Organization.objects.filter(owner=user).first()
            if org and profile and not profile.organization:
                profile.organization = org
                profile.save(update_fields=["organization"])
    return org, profile


def get_device_limit_for_org(org):
    if not org:
        return 0
    limits = []
    sub = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"))
        .select_related("plan")
        .order_by("-start_date")
        .first()
    )
    if sub and sub.plan and sub.plan.device_limit:
        limits.append(int(sub.plan.device_limit))
    try:
        from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
        storage_sub = (
            StorageOrgSubscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .select_related("plan")
            .order_by("-updated_at")
            .first()
        )
        if storage_sub and storage_sub.plan and getattr(storage_sub.plan, "device_limit_per_user", None):
            limits.append(int(storage_sub.plan.device_limit_per_user))
    except Exception:
        pass
    if not limits:
        return 1
    return max(limits)


def should_refresh_device_last_seen(device, now=None):
    if not device:
        return False
    now = now or timezone.now()
    if not device.last_seen:
        return True
    return (now - device.last_seen).total_seconds() >= 300
