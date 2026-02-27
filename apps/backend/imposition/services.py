from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import (
    ImpositionDevice,
    ImpositionLicense,
    ImpositionOrgAddon,
    ImpositionOrgSubscription,
    ImpositionPlan,
)

VERIFICATION_INTERVAL_HOURS = 24
IMPOSITION_PRODUCT_SLUG = "imposition-software"


PLAN_FEATURE_DEFAULTS = {
    "starter": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": False,
        "batch_processing": False,
        "print_marks": False,
        "export_hd": False,
        "batch_auto_imposition": False,
        "layout_templates": False,
        "bulk_export": False,
        "team_users": False,
        "layout_presets": False,
        "priority_processing": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "serial_number_generator": False,
        "sheet_custom_size": False,
        "qr_barcode_generator": False,
    },
    "pro": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": False,
        "layout_templates": False,
        "bulk_export": False,
        "team_users": False,
        "layout_presets": False,
        "priority_processing": False,
        "id_card_data_update": False,
        "business_card_data_update": False,
        "serial_number_generator": False,
        "sheet_custom_size": True,
        "qr_barcode_generator": False,
    },
    "business": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": True,
        "layout_templates": True,
        "bulk_export": True,
        "team_users": True,
        "layout_presets": True,
        "priority_processing": False,
        "id_card_data_update": True,
        "business_card_data_update": True,
        "serial_number_generator": True,
        "sheet_custom_size": True,
        "qr_barcode_generator": True,
    },
    "enterprise": {
        "manual_card_upload": True,
        "export_print_pdf": True,
        "advanced_layouts": True,
        "batch_processing": True,
        "print_marks": True,
        "export_hd": True,
        "batch_auto_imposition": True,
        "layout_templates": True,
        "bulk_export": True,
        "team_users": True,
        "layout_presets": True,
        "priority_processing": True,
        "id_card_data_update": True,
        "business_card_data_update": True,
        "serial_number_generator": True,
        "sheet_custom_size": True,
        "qr_barcode_generator": True,
    },
}


def get_active_subscription(org):
    if not org:
        return None
    return (
        ImpositionOrgSubscription.objects
        .filter(organization=org, status__in=("active", "trialing"))
        .select_related("plan")
        .order_by("-updated_at")
        .first()
    )


def get_effective_feature_flags(plan):
    defaults = PLAN_FEATURE_DEFAULTS.get((plan.code if plan else "") or "", {})
    custom = plan.feature_flags if plan and isinstance(plan.feature_flags, dict) else {}
    merged = dict(defaults)
    merged.update(custom)
    return merged


def get_additional_user_count(org):
    addon = (
        ImpositionOrgAddon.objects
        .filter(organization=org, addon_code__in=("imposition_user", "additional_user"), is_active=True)
        .order_by("-updated_at")
        .first()
    )
    return int(addon.quantity or 0) if addon else 0


def get_user_limit(org, sub=None):
    active_sub = sub or get_active_subscription(org)
    if not active_sub or not active_sub.plan:
        return 0
    included = 1
    plan_flags = active_sub.plan.feature_flags if isinstance(active_sub.plan.feature_flags, dict) else {}
    try:
        included = max(1, int(plan_flags.get("included_users", 1)))
    except (TypeError, ValueError):
        included = 1
    return included + get_additional_user_count(org)


def get_device_limit(sub):
    if not sub or not sub.plan:
        return 0
    if sub.status == "trialing":
        return 1
    return int(sub.plan.device_limit or 0)


def get_active_device_count(license_row):
    return (
        ImpositionDevice.objects
        .filter(license=license_row, is_active=True)
        .count()
    )


def get_license_with_subscription(code):
    if not code:
        return None, None
    license_row = (
        ImpositionLicense.objects
        .filter(code=code, status="active")
        .select_related("organization", "subscription", "subscription__plan")
        .first()
    )
    if not license_row:
        return None, None
    sub = license_row.subscription
    if not sub or sub.status not in ("active", "trialing"):
        sub = get_active_subscription(license_row.organization)
    if not sub:
        return None, None
    return license_row, sub


def register_device(*, license_row, sub, device_id, device_name="", os_name="", app_version="", user=None):
    with transaction.atomic():
        existing = (
            ImpositionDevice.objects
            .select_for_update()
            .filter(organization=license_row.organization, device_id=device_id)
            .first()
        )
        if existing:
            existing.license = license_row
            existing.user = user
            existing.device_name = device_name or existing.device_name
            existing.os = os_name or existing.os
            existing.app_version = app_version or existing.app_version
            existing.is_active = True
            existing.save(
                update_fields=[
                    "license",
                    "user",
                    "device_name",
                    "os",
                    "app_version",
                    "is_active",
                    "last_active_at",
                ]
            )
            return existing, False

        limit = get_device_limit(sub)
        active_devices = get_active_device_count(license_row)
        if limit and active_devices >= limit:
            return None, True

        row = ImpositionDevice.objects.create(
            license=license_row,
            organization=license_row.organization,
            user=user,
            device_id=device_id,
            device_name=device_name,
            os=os_name,
            app_version=app_version,
            is_active=True,
        )
        return row, False


def build_policy_payload(*, license_row, sub):
    plan = sub.plan if sub else None
    feature_flags = get_effective_feature_flags(plan)
    device_limit = get_device_limit(sub)
    if sub and sub.status == "trialing":
        device_limit = 1
        feature_flags.update({
            "watermark_export": True,
            "limited_templates": True,
            "advanced_imposition": False,
            "batch_processing": False,
            "print_marks": False,
            "export_hd_print_files": False,
            "excel_data_import": False,
            "id_card_data_update": False,
            "business_card_data_update": False,
            "bulk_card_generation": False,
            "layout_templates": False,
            "serial_number_generator": False,
            "team_users": False,
            "priority_processing": False,
            "advanced_layout_presets": False,
            "bulk_export_engine": False,
            "api_integration_ready": False,
        })
    now = timezone.now()
    verify_after = now + timedelta(hours=VERIFICATION_INTERVAL_HOURS)
    return {
        "license_code": license_row.code,
        "organization_id": license_row.organization_id,
        "subscription_status": sub.status if sub else "inactive",
        "plan": {
            "code": plan.code if plan else "",
            "name": plan.name if plan else "",
            "device_limit": device_limit,
            "feature_flags": feature_flags,
        },
        "offline_grace_days": int(license_row.offline_grace_days or 3),
        "verify_every_hours": VERIFICATION_INTERVAL_HOURS,
        "next_verification_due_at": verify_after.isoformat(),
    }


def touch_license_verification(license_row):
    license_row.last_verified_at = timezone.now()
    license_row.save(update_fields=["last_verified_at", "updated_at"])


def ensure_default_plans():
    seed_rows = [
        ("starter", "Starter", 1),
        ("pro", "Pro", 3),
        ("business", "Business", 5),
        ("enterprise", "Enterprise", 10),
    ]
    for code, name, limit in seed_rows:
        plan, _ = ImpositionPlan.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "device_limit": limit,
                "additional_user_price_monthly_inr": 300,
                "feature_flags": get_effective_feature_flags(ImpositionPlan(code=code)),
                "is_active": True,
            },
        )
        updates = []
        if plan.name != name:
            plan.name = name
            updates.append("name")
        if plan.device_limit != limit:
            plan.device_limit = limit
            updates.append("device_limit")
        expected_flags = get_effective_feature_flags(plan)
        if plan.feature_flags != expected_flags:
            plan.feature_flags = expected_flags
            updates.append("feature_flags")
        if updates:
            plan.save(update_fields=updates + ["updated_at"])


def _resolve_plan_code(core_plan):
    name = str((core_plan.name if core_plan else "") or "").strip().lower()
    mapping = {
        "starter": "starter",
        "pro": "pro",
        "business": "business",
        "enterprise": "enterprise",
        "trial": "starter",
    }
    if name in mapping:
        return mapping[name]
    if "enterprise" in name:
        return "enterprise"
    if "business" in name:
        return "business"
    if "pro" in name:
        return "pro"
    return "starter"


def sync_subscription_from_core(core_subscription):
    if not core_subscription or not core_subscription.plan or not core_subscription.organization_id:
        return None, None
    product = core_subscription.plan.product if core_subscription.plan else None
    slug = (product.slug if product else "").strip().lower()
    if slug != IMPOSITION_PRODUCT_SLUG:
        return None, None

    ensure_default_plans()
    plan_code = _resolve_plan_code(core_subscription.plan)
    plan = ImpositionPlan.objects.filter(code=plan_code).first()
    if not plan:
        return None, None

    status = (core_subscription.status or "inactive").strip().lower()
    if status not in ("active", "trialing", "inactive", "expired"):
        status = "inactive"

    starts_at = core_subscription.start_date or timezone.now()
    ends_at = core_subscription.trial_end if status == "trialing" else core_subscription.end_date

    with transaction.atomic():
        sub, _ = ImpositionOrgSubscription.objects.get_or_create(
            organization=core_subscription.organization,
            defaults={
                "plan": plan,
                "status": status,
                "starts_at": starts_at,
                "ends_at": ends_at,
            },
        )
        sub.plan = plan
        sub.status = status
        sub.starts_at = starts_at
        sub.ends_at = ends_at
        sub.save(update_fields=["plan", "status", "starts_at", "ends_at", "updated_at"])

        if status in ("active", "trialing"):
            license_row, _ = ImpositionLicense.objects.get_or_create(
                organization=core_subscription.organization,
                subscription=sub,
                defaults={
                    "status": "active",
                    "offline_grace_days": 3,
                },
            )
            if license_row.subscription_id != sub.id:
                license_row.subscription = sub
                license_row.save(update_fields=["subscription", "updated_at"])
        else:
            license_row = (
                ImpositionLicense.objects
                .filter(organization=core_subscription.organization)
                .order_by("-updated_at")
                .first()
            )
            if license_row and license_row.status != "inactive":
                license_row.status = "inactive"
                license_row.save(update_fields=["status", "updated_at"])

    return sub, license_row
