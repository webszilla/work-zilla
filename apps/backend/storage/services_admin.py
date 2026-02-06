from django.db import transaction
from django.utils import timezone

from core.models import Organization

from .models import (
    Product,
    Plan,
    AddOn,
    OrgAddOn,
    OrgSubscription,
    StorageGlobalSettings,
    StorageOrganizationSettings,
    OrgUser,
    StorageFolder,
)
from .services import get_plan_user_limit, get_org_storage_usage, is_system_sync_enabled
from core.models import UserProfile
from apps.backend.common_auth.models import User


@transaction.atomic
def upsert_product(*, product_id=None, name, is_active=True, description=""):
    if product_id:
        product = Product.objects.filter(id=product_id).first()
        if not product:
            raise ValueError("product_not_found")
        product.name = name
        product.is_active = bool(is_active)
        product.description = description or ""
        product.save(update_fields=["name", "is_active", "description"])
        return product
    return Product.objects.create(
        name=name,
        is_active=bool(is_active),
        description=description or "",
    )


@transaction.atomic
def upsert_plan(
    *,
    plan_id=None,
    product,
    name,
    monthly_price=0,
    yearly_price=0,
    usd_monthly_price=0,
    usd_yearly_price=0,
    monthly_price_inr=0,
    yearly_price_inr=0,
    monthly_price_usd=0,
    yearly_price_usd=0,
    max_users=None,
    device_limit_per_user=1,
    storage_limit_gb=0,
    bandwidth_limit_gb_monthly=0,
    is_bandwidth_limited=True,
    is_active=True,
):
    if isinstance(product, int):
        product = Product.objects.filter(id=product).first()
    if not product:
        raise ValueError("product_required")
    if plan_id:
        plan = Plan.objects.filter(id=plan_id).first()
        if not plan:
            raise ValueError("plan_not_found")
        plan.product = product
        plan.name = name
        plan.monthly_price_inr = monthly_price_inr or monthly_price or 0
        plan.yearly_price_inr = yearly_price_inr or yearly_price or 0
        plan.monthly_price_usd = monthly_price_usd or usd_monthly_price or 0
        plan.yearly_price_usd = yearly_price_usd or usd_yearly_price or 0
        plan.monthly_price = plan.monthly_price_inr
        plan.yearly_price = plan.yearly_price_inr
        plan.usd_monthly_price = plan.monthly_price_usd
        plan.usd_yearly_price = plan.yearly_price_usd
        plan.max_users = max_users
        plan.storage_limit_gb = int(storage_limit_gb or 0)
        plan.bandwidth_limit_gb_monthly = int(bandwidth_limit_gb_monthly or 0)
        plan.is_bandwidth_limited = bool(is_bandwidth_limited)
        plan.is_active = bool(is_active)
        plan.device_limit_per_user = max(1, int(device_limit_per_user or 1))
        plan.save(update_fields=[
            "product",
            "name",
            "monthly_price",
            "yearly_price",
            "usd_monthly_price",
            "usd_yearly_price",
            "monthly_price_inr",
            "yearly_price_inr",
            "monthly_price_usd",
            "yearly_price_usd",
            "max_users",
            "device_limit_per_user",
            "storage_limit_gb",
            "bandwidth_limit_gb_monthly",
            "is_bandwidth_limited",
            "is_active",
        ])
        return plan
    return Plan.objects.create(
        product=product,
        name=name,
        monthly_price_inr=monthly_price_inr or monthly_price or 0,
        yearly_price_inr=yearly_price_inr or yearly_price or 0,
        monthly_price_usd=monthly_price_usd or usd_monthly_price or 0,
        yearly_price_usd=yearly_price_usd or usd_yearly_price or 0,
        monthly_price=monthly_price_inr or monthly_price or 0,
        yearly_price=yearly_price_inr or yearly_price or 0,
        usd_monthly_price=monthly_price_usd or usd_monthly_price or 0,
        usd_yearly_price=yearly_price_usd or usd_yearly_price or 0,
        max_users=max_users,
        device_limit_per_user=max(1, int(device_limit_per_user or 1)),
        storage_limit_gb=int(storage_limit_gb or 0),
        bandwidth_limit_gb_monthly=int(bandwidth_limit_gb_monthly or 0),
        is_bandwidth_limited=bool(is_bandwidth_limited),
        is_active=bool(is_active),
    )


@transaction.atomic
def upsert_addon(*, addon_id=None, product, name, storage_gb=0, price_monthly=0, stackable=True, is_active=True):
    if isinstance(product, int):
        product = Product.objects.filter(id=product).first()
    if not product:
        raise ValueError("product_required")
    if addon_id:
        addon = AddOn.objects.filter(id=addon_id).first()
        if not addon:
            raise ValueError("addon_not_found")
        addon.product = product
        addon.name = name
        addon.storage_gb = int(storage_gb or 0)
        addon.price_monthly = price_monthly
        addon.stackable = bool(stackable)
        addon.is_active = bool(is_active)
        addon.save(update_fields=[
            "product",
            "name",
            "storage_gb",
            "price_monthly",
            "stackable",
            "is_active",
        ])
        return addon
    return AddOn.objects.create(
        product=product,
        name=name,
        storage_gb=int(storage_gb or 0),
        price_monthly=price_monthly,
        stackable=bool(stackable),
        is_active=bool(is_active),
    )


@transaction.atomic
def assign_plan_to_org(*, org, product, plan, status="active", renewal_date=None):
    if isinstance(org, int):
        org = Organization.objects.filter(id=org).first()
    if isinstance(product, int):
        product = Product.objects.filter(id=product).first()
    if isinstance(plan, int):
        plan = Plan.objects.filter(id=plan).first()
    if not org or not product:
        raise ValueError("org_or_product_required")
    if plan and plan.product_id != product.id:
        raise ValueError("plan_product_mismatch")
    sub, _ = OrgSubscription.objects.get_or_create(
        organization=org,
        product=product,
        defaults={
            "plan": plan,
            "status": status,
            "renewal_date": renewal_date,
        },
    )
    sub.plan = plan
    sub.status = status
    sub.renewal_date = renewal_date
    sub.updated_at = timezone.now()
    sub.save(update_fields=["plan", "status", "renewal_date", "updated_at"])
    return sub


@transaction.atomic
def set_org_addon_quantity(*, org, addon, quantity):
    if isinstance(org, int):
        org = Organization.objects.filter(id=org).first()
    if isinstance(addon, int):
        addon = AddOn.objects.filter(id=addon).first()
    if not org or not addon:
        raise ValueError("org_or_addon_required")
    org_addon, _ = OrgAddOn.objects.get_or_create(organization=org, addon=addon)
    org_addon.quantity = max(0, int(quantity or 0))
    org_addon.save(update_fields=["quantity", "updated_at"])
    return org_addon


@transaction.atomic
def set_global_sync_enabled(value):
    settings_obj = StorageGlobalSettings.get_solo()
    settings_obj.sync_globally_enabled = bool(value)
    settings_obj.save(update_fields=["sync_globally_enabled", "updated_at"])
    return settings_obj


@transaction.atomic
def set_org_sync_enabled(*, org, value):
    if isinstance(org, int):
        org = Organization.objects.filter(id=org).first()
    if not org:
        raise ValueError("org_required")
    settings_obj, _ = StorageOrganizationSettings.objects.get_or_create(organization=org)
    settings_obj.sync_enabled = bool(value)
    settings_obj.save(update_fields=["sync_enabled", "updated_at"])
    return settings_obj


def _active_org_user_count(org):
    return OrgUser.objects.filter(organization=org, is_active=True).count()


def _can_create_org_user(org):
    sub = OrgSubscription.objects.filter(organization=org, status__in=("active", "trialing")).select_related("plan").first()
    if not sub or not sub.plan:
        return False, "subscription_required"
    max_users = get_plan_user_limit(sub.plan)
    if not max_users:
        return True, ""
    count = _active_org_user_count(org)
    if count >= max_users:
        return False, "user_limit_reached"
    return True, ""


@transaction.atomic
def create_org_user(*, org, username, email, password, first_name="", last_name=""):
    if User.objects.filter(email__iexact=email).exists():
        raise ValueError("user_exists")
    allowed, reason = _can_create_org_user(org)
    if not allowed:
        raise ValueError(reason)
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
    )
    user.first_name = first_name or ""
    user.last_name = last_name or ""
    user.is_active = True
    user.save(update_fields=["first_name", "last_name", "is_active"])
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.organization = org
    profile.role = "org_user"
    profile.save(update_fields=["organization", "role"])
    org_user = OrgUser.objects.create(organization=org, user=user, is_active=True, system_sync_enabled=True)
    StorageFolder.objects.get_or_create(
        organization=org,
        owner=user,
        parent=None,
        defaults={
            "name": "Root",
            "created_by": user,
            "is_deleted": False,
        },
    )
    return org_user


@transaction.atomic
def set_org_user_active(*, org_user, is_active):
    org_user.is_active = bool(is_active)
    org_user.save(update_fields=["is_active", "updated_at"])
    user = org_user.user
    if user:
        user.is_active = bool(is_active)
        user.save(update_fields=["is_active"])
    return org_user


def list_org_users(org):
    return (
        OrgUser.objects
        .filter(organization=org)
        .select_related("user")
        .order_by("user__first_name", "user__username")
    )


@transaction.atomic
def set_user_system_sync(*, org_user, enabled):
    if enabled:
        usage = get_org_storage_usage(org_user.organization)
        if usage.get("limit_bytes") and usage.get("used_bytes") >= usage.get("limit_bytes"):
            raise ValueError("storage_limit_exceeded")
        if not is_system_sync_enabled(org_user.organization):
            raise ValueError("sync_globally_disabled")
    org_user.system_sync_enabled = bool(enabled)
    org_user.save(update_fields=["system_sync_enabled", "updated_at"])
    return org_user
