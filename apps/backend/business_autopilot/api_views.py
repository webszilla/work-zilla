import calendar
import json
import logging
import re
import secrets
import string
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional
import requests

from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import DatabaseError, IntegrityError, OperationalError, transaction
from django.shortcuts import render
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_time
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from apps.backend.common_auth.models import User
from apps.backend.products.models import Product
from core.models import Organization, OrganizationSettings, UserProductAccess, UserProfile, Subscription as OrgSubscription, log_admin_activity
from core.email_utils import send_templated_email
from core.notification_emails import mark_email_verified

from .models import (
    Module,
    OrganizationModule,
    OrganizationUser,
    OrganizationEmployeeRole,
    OrganizationDepartment,
    CrmDeal,
    CrmLead,
    CrmMeeting,
    CrmSalesOrder,
    AccountsWorkspace,
    EmployeeSalaryHistory,
    PayrollEntry,
    PayrollSettings,
    Payslip,
    SalaryStructure,
    Subscription,
    SubscriptionCategory,
    SubscriptionSubCategory,
)


MODULE_PATHS = {
    "crm": "/crm",
    "hrm": "/hrm",
    "projects": "/projects",
    "accounts": "/accounts",
    "subscriptions": "/subscriptions",
    "ticketing": "/ticketing",
    "stocks": "/stocks",
}

DEFAULT_ERP_MODULES = [
    {"name": "CRM", "slug": "crm", "sort_order": 1},
    {"name": "HR Management", "slug": "hrm", "sort_order": 2},
    {"name": "Project Management", "slug": "projects", "sort_order": 3},
    {"name": "Accounts", "slug": "accounts", "sort_order": 4},
    {"name": "Subscriptions", "slug": "subscriptions", "sort_order": 5},
    {"name": "Ticketing System", "slug": "ticketing", "sort_order": 6},
    {"name": "Inventory", "slug": "stocks", "sort_order": 7},
]

ERP_EMPLOYEE_ROLES = {"company_admin", "org_user", "hr_view"}
ACCOUNTS_ALLOWED_ROOT_KEYS = {"customers", "vendors", "itemMasters", "gstTemplates", "billingTemplates", "estimates", "invoices"}
ERP_MODULE_SLUG_SET = set(MODULE_PATHS.keys())
BUSINESS_AUTOPILOT_PRODUCT_SLUG = "business-autopilot-erp"
BUSINESS_AUTOPILOT_PRODUCT_SLUG_ALIASES = {"business-autopilot-erp", "business-autopilot"}
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_BA_OPENAI_AGENT_NAME = "Work Zilla AI Assistant"
PUBLIC_LOGIN_URL = "https://getworkzilla.com/auth/login/"
SUBSCRIPTION_STATUS_OPTIONS = ("Active", "Expired", "Cancelled")
ROLE_ACCESS_SECTION_KEYS = {
    "dashboard",
    "inbox",
    "crm",
    "hr",
    "projects",
    "accounts",
    "subscriptions",
    "ticketing",
    "stocks",
    "users",
    "billing",
    "plans",
    "profile",
}
ROLE_ACCESS_LEVELS = {"No Access", "View", "View and Edit", "Create, View and Edit", "Full Access"}
ROLE_ACCESS_LEVEL_ALIASES = {
    "No Access": "No Access",
    "View": "View",
    "Create/Edit": "View and Edit",
    "View and Edit": "View and Edit",
    "Create, View and Edit": "Create, View and Edit",
    "Full Access": "Full Access",
}
logger = logging.getLogger(__name__)

TEMP_PASSWORD_ALPHABET = string.ascii_letters + string.digits
TEMP_PASSWORD_LENGTH = 10



def _get_business_autopilot_product():
    return Product.objects.filter(slug=BUSINESS_AUTOPILOT_PRODUCT_SLUG).first()


@require_http_methods(["POST"])
def crm_activity_log(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)
    action = str(payload.get("action") or "").strip()
    details = str(payload.get("details") or "").strip()
    if not action:
        return JsonResponse({"detail": "action_required"}, status=400)
    log_admin_activity(
        request.user,
        action[:120],
        details[:500],
        product_slug=BUSINESS_AUTOPILOT_PRODUCT_SLUG,
        request=request,
    )
    return JsonResponse({"logged": True})


def _generate_temp_login_password(length: int = TEMP_PASSWORD_LENGTH):
    safe_length = max(8, int(length or TEMP_PASSWORD_LENGTH))
    password = "".join(secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(safe_length - 2))
    # Ensure at least one digit and one uppercase character.
    password += secrets.choice(string.digits)
    password += secrets.choice(string.ascii_uppercase)
    return "".join(secrets.SystemRandom().sample(password, len(password)))


def _get_business_autopilot_permission(role: str):
    normalized_role = str(role or "").strip().lower()
    if normalized_role == "company_admin":
        return UserProductAccess.PERMISSION_FULL
    if normalized_role == "org_user":
        return UserProductAccess.PERMISSION_EDIT
    return UserProductAccess.PERMISSION_VIEW


def _grant_business_autopilot_access(user: User, granted_by: User, role: str):
    product = _get_business_autopilot_product()
    if not product:
        return
    UserProductAccess.objects.update_or_create(
        user=user,
        product=product,
        defaults={
            "permission": _get_business_autopilot_permission(role),
            "granted_by": granted_by,
        },
    )


def _revoke_business_autopilot_access(user: User):
    product = _get_business_autopilot_product()
    if not product:
        return
    UserProductAccess.objects.filter(user=user, product=product).delete()


def _get_user_granted_products(user: User):
    rows = (
        UserProductAccess.objects
        .filter(user=user)
        .select_related("product")
        .order_by("product__name", "product__slug")
    )
    return [
        {
            "slug": row.product.slug,
            "name": row.product.name or row.product.slug,
            "permission": row.permission,
        }
        for row in rows
        if row.product_id
    ]


def _sync_business_autopilot_membership_access(org: Organization, granted_by: Optional[User] = None):
    product = _get_business_autopilot_product()
    if not org or not product:
        return
    memberships = list(
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user")
    )
    active_user_ids = set()
    for membership in memberships:
        if membership.is_active and membership.user_id:
            active_user_ids.add(membership.user_id)
            UserProductAccess.objects.update_or_create(
                user=membership.user,
                product=product,
                defaults={
                    "permission": _get_business_autopilot_permission(membership.role),
                    "granted_by": granted_by,
                },
            )
    if memberships:
        UserProductAccess.objects.filter(product=product, user_id__in=[row.user_id for row in memberships if row.user_id]).exclude(
            user_id__in=active_user_ids
        ).delete()


def _resolve_org(user: User):
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    return Organization.objects.filter(owner=user).first()


def _normalize_admin_role(value):
    raw_value = str(value or "").strip().lower()
    compact_value = re.sub(r"[^a-z0-9]+", "", raw_value)
    alias_map = {
        "companyadmin": "company_admin",
        "orgadmin": "org_admin",
        "organizationadmin": "org_admin",
        "companyowner": "owner",
        "orgowner": "owner",
        "superadmin": "superadmin",
        "superuser": "superadmin",
        "admin": "company_admin",
        "owner": "owner",
    }
    normalized = alias_map.get(compact_value)
    if normalized:
        return normalized
    return raw_value.replace("-", "_").replace(" ", "_")


def _can_manage_modules(user: User):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    if not profile:
        return False
    return profile.role in {"company_admin", "org_user", "superadmin", "super_admin"}


def _can_manage_users(user: User, org: Organization = None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    profile_role = _normalize_admin_role(getattr(profile, "role", ""))
    if profile_role in {"company_admin", "org_admin", "owner", "superadmin", "super_admin"}:
        return True
    if org:
        membership = _get_org_membership(user, org)
        if membership:
            return _normalize_admin_role(membership.role) in {"company_admin", "org_admin", "owner"}
    return False


def _can_manage_openai(user: User, org: Organization = None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    role = str(profile.role or "").strip().lower() if profile else ""
    if role in {"company_admin", "org_admin", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    return bool(membership and str(membership.role or "").strip().lower() == "company_admin")


def _mask_secret(value: str):
    secret = str(value or "").strip()
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}{'*' * max(0, len(secret) - 8)}{secret[-4:]}"


def _normalize_role_access_map(payload):
    raw_map = payload if isinstance(payload, dict) else {}
    normalized = {}
    for raw_key, raw_record in raw_map.items():
        key = str(raw_key or "").strip()
        if not key or len(key) > 200:
            continue
        record = raw_record if isinstance(raw_record, dict) else {}
        sections = record.get("sections") if isinstance(record.get("sections"), dict) else {}
        normalized_sections = {}
        for section_key in ROLE_ACCESS_SECTION_KEYS:
            raw_level = str(sections.get(section_key) or "No Access").strip()
            normalized_sections[section_key] = ROLE_ACCESS_LEVEL_ALIASES.get(raw_level, "No Access")
        normalized[key] = {
            "sections": normalized_sections,
            "can_export": bool(record.get("can_export")),
            "can_delete": bool(record.get("can_delete")),
            "attendance_self_service": bool(record.get("attendance_self_service")),
            "remarks": str(record.get("remarks") or "").strip()[:500],
        }
    return normalized


def _serialize_openai_settings(settings_obj: OrganizationSettings):
    return {
        "enabled": bool(settings_obj.business_autopilot_openai_enabled),
        "agent_name": str(settings_obj.business_autopilot_ai_agent_name or DEFAULT_BA_OPENAI_AGENT_NAME).strip() or DEFAULT_BA_OPENAI_AGENT_NAME,
        "account_email": str(settings_obj.business_autopilot_openai_account_email or "").strip(),
        "model": str(settings_obj.business_autopilot_openai_model or "gpt-4o-mini").strip() or "gpt-4o-mini",
        "has_api_key": bool(str(settings_obj.business_autopilot_openai_api_key or "").strip()),
        "masked_api_key": _mask_secret(settings_obj.business_autopilot_openai_api_key),
    }


def _get_org_membership(user: User, org: Organization):
    if not user or not user.is_authenticated or not org:
        return None
    return (
        OrganizationUser.objects
        .filter(organization=org, user=user, is_active=True)
        .only("id", "role", "department", "employee_role", "is_active")
        .first()
    )


def _can_manage_payroll(user: User, org: Organization = None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    role = str(profile.role or "").strip().lower() if profile else ""
    if role in {"company_admin", "org_admin", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    if not membership:
        return False
    employee_role = str(membership.employee_role or "").strip().lower()
    department = str(membership.department or "").strip().lower()
    return employee_role == "hr manager" or department == "hr"


def _can_view_salary_history(user: User, org: Organization = None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    role = str(profile.role or "").strip().lower() if profile else ""
    if role in {"company_admin", "org_admin", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    if not membership:
        return False
    membership_role = str(membership.role or "").strip().lower()
    employee_role = str(membership.employee_role or "").strip().lower()
    return membership_role == "company_admin" or employee_role == "hr manager"


def _ensure_default_module_catalog():
    # Keeps local/stale DBs usable even if seed migrations were not applied yet.
    # Avoid frequent write-lock contention on sqlite by doing minimal writes.
    defaults_by_slug = {row["slug"]: row for row in DEFAULT_ERP_MODULES}
    existing = {row.slug: row for row in Module.objects.filter(slug__in=defaults_by_slug.keys())}

    to_create = []
    to_update = []
    for slug, cfg in defaults_by_slug.items():
        row = existing.get(slug)
        if not row:
            to_create.append(
                Module(
                    slug=slug,
                    name=cfg["name"],
                    is_active=True,
                    sort_order=cfg["sort_order"],
                )
            )
            continue
        changed = False
        if row.name != cfg["name"]:
            row.name = cfg["name"]
            changed = True
        if row.sort_order != cfg["sort_order"]:
            row.sort_order = cfg["sort_order"]
            changed = True
        if not row.is_active:
            row.is_active = True
            changed = True
        if changed:
            to_update.append(row)

    if to_create:
        Module.objects.bulk_create(to_create, ignore_conflicts=True)
    if to_update:
        Module.objects.bulk_update(to_update, ["name", "is_active", "sort_order"])


def _ensure_org_modules(org):
    try:
        _ensure_default_module_catalog()
    except (OperationalError, DatabaseError):
        # If sqlite is temporarily locked, proceed with existing module catalog.
        pass
    active_modules = list(Module.objects.filter(is_active=True).order_by("sort_order", "name"))
    if not active_modules:
        return []
    existing = set(
        OrganizationModule.objects.filter(organization=org).values_list("module_id", flat=True)
    )
    pending = [
        OrganizationModule(organization=org, module=module, enabled=True)
        for module in active_modules
        if module.id not in existing
    ]
    if pending:
        OrganizationModule.objects.bulk_create(pending)
    return active_modules


def _default_plan_module_slugs(plan_name):
    key = str(plan_name or "").strip().lower()
    if "free" in key:
        return ["crm", "hrm", "projects", "accounts", "subscriptions"]
    if "starter" in key:
        return ["crm", "hrm", "projects", "accounts", "subscriptions"]
    if "growth" in key:
        return ["crm", "hrm", "projects", "accounts", "subscriptions", "ticketing", "stocks"]
    if "pro" in key:
        return ["crm", "hrm", "projects", "accounts", "subscriptions", "ticketing", "stocks"]
    return list(ERP_MODULE_SLUG_SET)


def _is_free_plan(plan):
    if not plan:
        return False
    prices = [
        plan.monthly_price or 0,
        plan.yearly_price or 0,
        plan.usd_monthly_price or 0,
        plan.usd_yearly_price or 0,
    ]
    return all(price <= 0 for price in prices)


def _is_business_autopilot_free_plan(plan):
    if not plan:
        return False
    product_slug = str(getattr(getattr(plan, "product", None), "slug", "") or "").strip().lower()
    if product_slug not in BUSINESS_AUTOPILOT_PRODUCT_SLUG_ALIASES:
        return False
    if _is_free_plan(plan):
        return True
    plan_name = str(getattr(plan, "name", "") or "").strip().lower()
    if "free" in plan_name:
        return True
    limits = getattr(plan, "limits", {}) or {}
    plan_tier = str(limits.get("plan_tier") or limits.get("tier") or "").strip().lower()
    return plan_tier == "free"


def _get_effective_employee_limit(plan):
    if not plan:
        return 0
    try:
        base_limit = int(getattr(plan, "employee_limit", 0) or 0)
    except (TypeError, ValueError):
        base_limit = 0
    if _is_business_autopilot_free_plan(plan):
        # Business Autopilot free trial: base 1 + extra 2 => total 3 users.
        return 3
    product_slug = str(getattr(getattr(plan, "product", None), "slug", "") or "").strip().lower()
    if product_slug in BUSINESS_AUTOPILOT_PRODUCT_SLUG_ALIASES:
        # Business Autopilot paid plans: base 1 user; additional users require paid add-ons.
        return 1
    return base_limit


def _trial_tier_module_slugs(trial_tier):
    tier = str(trial_tier or "").strip().lower()
    if tier in {"pro", "all", "full"}:
        return set(ERP_MODULE_SLUG_SET)
    if tier == "growth":
        return set(_default_plan_module_slugs("growth"))
    if tier == "starter":
        return set(_default_plan_module_slugs("starter"))
    if tier == "free":
        return set(_default_plan_module_slugs("free"))
    return None


def _get_active_erp_subscription(org):
    if not org:
        return None
    now = timezone.now()
    rows = (
        OrgSubscription.objects
        .filter(organization=org, plan__product__slug__in=BUSINESS_AUTOPILOT_PRODUCT_SLUG_ALIASES)
        .select_related("plan", "plan__product")
        .order_by("-start_date", "-id")
    )
    for row in rows:
        status = str(row.status or "").lower()
        if status not in {"active", "trialing"}:
            continue
        if row.end_date and row.end_date < now:
            continue
        return row
    return None


def _get_plan_erp_module_slugs(plan, subscription=None):
    if not plan:
        return set(ERP_MODULE_SLUG_SET)
    features = plan.features or {}
    limits = plan.limits or {}

    # Free trial plans can expose higher-tier modules for evaluation.
    trial_tier = (
        features.get("trial_features")
        or features.get("trial_features_tier")
        or limits.get("trial_features")
        or limits.get("trial_features_tier")
    )
    if _is_free_plan(plan):
        trial_modules = _trial_tier_module_slugs(trial_tier)
        if trial_modules:
            return trial_modules

    if str(getattr(subscription, "status", "") or "").strip().lower() == "trialing":
        trial_modules = _trial_tier_module_slugs(trial_tier)
        if trial_modules:
            return trial_modules

    configured = features.get("erp_enabled_modules")
    if isinstance(configured, list):
        normalized = {
            str(item or "").strip().lower()
            for item in configured
            if str(item or "").strip().lower() in ERP_MODULE_SLUG_SET
        }
        # Backward compatibility: subscriptions previously lived under Accounts.
        if "accounts" in normalized:
            normalized.add("subscriptions")
        if normalized:
            return normalized
    return set(_default_plan_module_slugs(plan.name))


def _serialize_employee_roles(org):
    rows = (
        OrganizationEmployeeRole.objects
        .filter(organization=org, is_active=True)
        .order_by("name")
    )
    return [{"id": row.id, "name": row.name} for row in rows]


def _serialize_departments(org):
    rows = (
        OrganizationDepartment.objects
        .filter(organization=org, is_active=True)
        .order_by("name")
    )
    return [{"id": row.id, "name": row.name} for row in rows]


def _serialize_org_users(org):
    _sync_business_autopilot_membership_access(org)
    memberships = (
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user", "user__userprofile")
        .order_by("-id")
    )
    return [
        {
            "id": member.user_id,
            "membership_id": member.id,
            "name": _get_org_user_display_name(member.user),
            "first_name": str(getattr(member.user, "first_name", "") or "").strip(),
            "last_name": str(getattr(member.user, "last_name", "") or "").strip(),
            "employeeId": _format_employee_code(member.user_id),
            "email": member.user.email or "",
            "email_verified": bool(getattr(member.user, "email_verified", False)),
            "phone_number": str(
                getattr(getattr(member.user, "userprofile", None), "phone_number", "") or ""
            ).strip(),
            "role": member.role or "org_user",
            "department": member.department or "",
            "employee_role": member.employee_role or "",
            "is_active": bool(member.is_active and member.user.is_active),
            "created_at": member.created_at.isoformat() if member.created_at else "",
        }
        for member in memberships
    ]


def _safe_serialize_org_users(org):
    try:
        return _serialize_org_users(org)
    except (DatabaseError, OperationalError, IntegrityError):
        logger.exception("Failed to serialize Business Autopilot users for org_id=%s", getattr(org, "id", None))
        return []


def _safe_serialize_employee_roles(org):
    try:
        return _serialize_employee_roles(org)
    except (DatabaseError, OperationalError, IntegrityError):
        logger.exception("Failed to serialize employee roles for org_id=%s", getattr(org, "id", None))
        return []


def _safe_serialize_departments(org):
    try:
        return _serialize_departments(org)
    except (DatabaseError, OperationalError, IntegrityError):
        logger.exception("Failed to serialize departments for org_id=%s", getattr(org, "id", None))
        return []


def _list_org_user_memberships(org):
    return list(
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user")
        .order_by("id")
    )


def _compute_org_user_lock_ids(employee_limit, memberships=None):
    rows = memberships if isinstance(memberships, list) else []
    safe_limit = max(0, int(employee_limit or 0))
    unlocked_ids = [row.id for row in rows[:safe_limit]]
    locked_ids = [row.id for row in rows[safe_limit:]]
    return {
        "unlocked_ids": set(unlocked_ids),
        "locked_ids": set(locked_ids),
        "total_users": len(rows),
    }


def _attach_locked_state(users, locked_ids):
    safe_locked_ids = set(locked_ids or [])
    normalized = []
    for row in (users or []):
        membership_id = row.get("membership_id")
        is_locked = membership_id in safe_locked_ids
        next_row = dict(row)
        next_row["is_locked"] = is_locked
        if is_locked:
            next_row["is_active"] = False
        normalized.append(next_row)
    return normalized


def _build_org_user_meta(org, users=None):
    active_sub = _get_active_erp_subscription(org)
    has_subscription = bool(active_sub and active_sub.plan)
    addon_count = int(active_sub.addon_count or 0) if has_subscription else 0
    allow_addons = bool(active_sub.plan.allow_addons) if has_subscription else False
    is_ba_trial = False
    if has_subscription:
        product_slug = str(getattr(getattr(active_sub.plan, "product", None), "slug", "") or "").strip().lower()
        status = str(getattr(active_sub, "status", "") or "").strip().lower()
        is_ba_trial = product_slug in BUSINESS_AUTOPILOT_PRODUCT_SLUG_ALIASES and status == "trialing"

    if has_subscription:
        base_limit = _get_effective_employee_limit(active_sub.plan)
        # For paid/tiered plans, minimum 1 user is included by default.
        if base_limit <= 0 and not _is_free_plan(active_sub.plan):
            base_limit = 1
        if is_ba_trial:
            base_limit = max(base_limit, 3)
    else:
        base_limit = 0

    employee_limit = max(0, base_limit + max(0, addon_count))
    memberships = _list_org_user_memberships(org)
    lock_state = _compute_org_user_lock_ids(employee_limit, memberships=memberships)
    total_users = lock_state["total_users"]
    used_users = min(total_users, employee_limit)
    remaining_users = max(0, employee_limit - lock_state["total_users"])
    can_add_users = bool(has_subscription and total_users < employee_limit)
    limit_message = ""
    if not has_subscription:
        limit_message = "Free trial ended. Upgrade your plan to add users."
    elif not can_add_users:
        limit_message = "User limit reached. Add-on users required to add or enable more users."

    if has_subscription and (_is_business_autopilot_free_plan(active_sub.plan) or is_ba_trial):
        base_included_users = 1
        extra_included_users = max(0, employee_limit - base_included_users)
    else:
        base_included_users = max(0, employee_limit - max(0, addon_count))
        extra_included_users = max(0, employee_limit - base_included_users)

    return {
        "employee_limit": employee_limit,
        "used_users": used_users,
        "remaining_users": remaining_users,
        "addon_count": max(0, addon_count),
        "allow_addons": allow_addons,
        "has_unlimited_users": False,
        "can_add_users": can_add_users,
        "has_subscription": has_subscription,
        "limit_message": limit_message,
        "base_included_users": base_included_users,
        "extra_included_users": extra_included_users,
    }


def _sync_org_users_to_plan_limit(org, requested_by=None):
    memberships = _list_org_user_memberships(org)
    if not memberships:
        return {"auto_disabled_ids": [], "auto_enabled_ids": []}

    meta = _build_org_user_meta(org, users=None)
    lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=memberships)
    locked_ids = lock_state["locked_ids"]
    auto_disabled = []
    auto_enabled = []

    # Extra users are lock-managed by plan limit and must stay inactive.
    for row in memberships:
        if row.id in locked_ids and row.is_active:
            row.is_active = False
            row.save(update_fields=["is_active", "updated_at"])
            _revoke_business_autopilot_access(row.user)
            auto_disabled.append(row.id)

    return {"auto_disabled_ids": auto_disabled, "auto_enabled_ids": auto_enabled}


def _decimal_to_string(value, default="0.00"):
    try:
      amount = Decimal(str(value if value is not None else default))
    except (InvalidOperation, TypeError, ValueError):
      amount = Decimal(str(default or "0"))
    return f"{amount.quantize(Decimal('0.01'))}"


def _to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value in (None, ""):
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _coerce_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _format_employee_code(user_id):
    numeric_user_id = _coerce_int(user_id)
    if not numeric_user_id or numeric_user_id <= 0:
        return ""
    return f"EMP{numeric_user_id:03d}"


def _get_org_user_display_name(user):
    if not user:
        return ""
    full_name = " ".join(
        [
            str(getattr(user, "first_name", "") or "").strip(),
            str(getattr(user, "last_name", "") or "").strip(),
        ]
    ).strip()
    fallback = str(
        getattr(user, "first_name", "")
        or getattr(user, "username", "")
        or getattr(user, "email", "")
        or ""
    ).strip()
    return full_name or fallback


def _extract_person_name(payload):
    first_name = str(payload.get("first_name") or "").strip()
    last_name = str(payload.get("last_name") or "").strip()
    legacy_name = str(payload.get("name") or "").strip()

    if not first_name and legacy_name:
        parts = legacy_name.split()
        if parts:
            first_name = parts[0]
            last_name = " ".join(parts[1:]).strip()

    return first_name, last_name


def _normalize_payroll_month(value):
    month = str(value or "").strip()
    if len(month) == 7 and month[4] == "-":
        return month
    return timezone.localdate().strftime("%Y-%m")


def _default_payroll_settings_payload():
    return {
        "enablePf": True,
        "enableEsi": True,
        "pfEmployeePercent": "12.00",
        "pfEmployerPercent": "12.00",
        "esiEmployeePercent": "0.75",
        "esiEmployerPercent": "3.25",
    }


def _serialize_payroll_settings(row):
    if not row:
        return _default_payroll_settings_payload()
    return {
        "enablePf": bool(row.enable_pf),
        "enableEsi": bool(row.enable_esi),
        "pfEmployeePercent": _decimal_to_string(row.pf_employee_percent, "12.00"),
        "pfEmployerPercent": _decimal_to_string(row.pf_employer_percent, "12.00"),
        "esiEmployeePercent": _decimal_to_string(row.esi_employee_percent, "0.75"),
        "esiEmployerPercent": _decimal_to_string(row.esi_employer_percent, "3.25"),
    }


def _serialize_salary_structure(row):
    return {
        "id": row.id,
        "name": row.name,
        "isDefault": bool(row.is_default),
        "basicSalaryPercent": _decimal_to_string(row.basic_salary_percent, "40.00"),
        "hraPercent": _decimal_to_string(row.hra_percent, "20.00"),
        "conveyanceFixed": _decimal_to_string(row.conveyance_fixed, "1600.00"),
        "autoSpecialAllowance": bool(row.auto_special_allowance),
        "basicSalary": _decimal_to_string(row.basic_salary),
        "hra": _decimal_to_string(row.hra),
        "conveyance": _decimal_to_string(row.conveyance),
        "specialAllowance": _decimal_to_string(row.special_allowance),
        "bonus": _decimal_to_string(row.bonus),
        "otherAllowances": _decimal_to_string(row.other_allowances),
        "applyPf": bool(row.apply_pf),
        "applyEsi": bool(row.apply_esi),
        "professionalTax": _decimal_to_string(row.professional_tax),
        "otherDeduction": _decimal_to_string(row.other_deduction),
        "notes": row.notes or "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def _serialize_salary_history(row):
    return {
        "id": row.id,
        "employeeName": row.employee_name,
        "sourceUserId": row.source_user_id,
        "employeeId": _format_employee_code(row.source_user_id),
        "salaryStructureId": row.salary_structure_id,
        "salaryStructureName": row.salary_structure.name if row.salary_structure_id and row.salary_structure else "",
        "currentSalary": _decimal_to_string(row.current_salary),
        "monthlySalaryAmount": _decimal_to_string(row.monthly_salary_amount),
        "incrementType": row.increment_type or "percentage",
        "incrementValue": _decimal_to_string(row.increment_value),
        "effectiveFrom": row.effective_from.isoformat() if row.effective_from else "",
        "incrementAmount": _decimal_to_string(row.increment_amount),
        "newSalary": _decimal_to_string(row.new_salary),
        "notes": row.notes or "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def _ensure_standard_salary_template(org: Organization):
    row, _ = SalaryStructure.objects.get_or_create(
        organization=org,
        name="Standard Template",
        defaults={
            "is_default": True,
            "basic_salary_percent": Decimal("40"),
            "hra_percent": Decimal("20"),
            "conveyance_fixed": Decimal("1600"),
            "auto_special_allowance": True,
            "apply_pf": True,
            "apply_esi": True,
        },
    )
    updates = []
    if not row.is_default:
        row.is_default = True
        updates.append("is_default")
    if row.basic_salary_percent != Decimal("40"):
        row.basic_salary_percent = Decimal("40")
        updates.append("basic_salary_percent")
    if row.hra_percent != Decimal("20"):
        row.hra_percent = Decimal("20")
        updates.append("hra_percent")
    if row.conveyance_fixed != Decimal("1600"):
        row.conveyance_fixed = Decimal("1600")
        updates.append("conveyance_fixed")
    if not row.auto_special_allowance:
        row.auto_special_allowance = True
        updates.append("auto_special_allowance")
    if updates:
        row.save(update_fields=updates)
    SalaryStructure.objects.filter(organization=org).exclude(id=row.id).filter(is_default=True).update(is_default=False)
    return row


def _serialize_payroll_entry(row):
    return {
        "id": row.id,
        "employeeName": row.employee_name,
        "sourceUserId": row.source_user_id,
        "month": row.payroll_month,
        "currency": row.currency or "INR",
        "salaryStructureId": row.salary_structure_id,
        "salaryStructureName": row.salary_structure.name if row.salary_structure_id and row.salary_structure else "",
        "salaryHistoryId": row.salary_history_id,
        "grossSalary": _decimal_to_string(row.gross_salary),
        "pfEmployeeAmount": _decimal_to_string(row.pf_employee_amount),
        "pfEmployerAmount": _decimal_to_string(row.pf_employer_amount),
        "esiEmployeeAmount": _decimal_to_string(row.esi_employee_amount),
        "esiEmployerAmount": _decimal_to_string(row.esi_employer_amount),
        "professionalTaxAmount": _decimal_to_string(row.professional_tax_amount),
        "otherDeductionAmount": _decimal_to_string(row.other_deduction_amount),
        "totalDeductions": _decimal_to_string(row.total_deductions),
        "netSalary": _decimal_to_string(row.net_salary),
        "earnings": row.earnings if isinstance(row.earnings, dict) else {},
        "deductions": row.deductions if isinstance(row.deductions, dict) else {},
        "status": row.status or "processed",
        "processedAt": row.processed_at.isoformat() if row.processed_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
        "slipNumber": row.payslip.slip_number if hasattr(row, "payslip") and row.payslip else "",
    }


def _serialize_payslip(row):
    return {
        "id": row.id,
        "payrollEntryId": row.payroll_entry_id,
        "slipNumber": row.slip_number,
        "generatedForMonth": row.generated_for_month,
        "employeeName": row.employee_name,
        "sourceUserId": row.source_user_id,
        "currency": row.currency or "INR",
        "generatedAt": row.generated_at.isoformat() if row.generated_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def _get_or_create_payroll_settings(org):
    row, _ = PayrollSettings.objects.get_or_create(organization=org)
    return row


def _serialize_org_payroll_profile(org):
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    return {
        "organizationName": org.name,
        "country": org.country or "India",
        "currency": org.currency or "INR",
        "timezone": settings_obj.org_timezone or "UTC",
    }


def _format_currency_value(currency, amount):
    return f"{currency or 'INR'} {_decimal_to_string(amount)}"


def _serialize_salary_history_detail(row):
    return {
        "id": row.id,
        "effectiveDate": row.effective_from.isoformat() if row.effective_from else "",
        "previousSalary": _decimal_to_string(row.current_salary),
        "incrementType": row.increment_type or "percentage",
        "incrementValue": _decimal_to_string(row.increment_value),
        "incrementAmount": _decimal_to_string(row.increment_amount),
        "newSalary": _decimal_to_string(row.new_salary),
    }


def _serialize_modules(org):
    subscription = _get_active_erp_subscription(org)
    allowed_slugs = _get_plan_erp_module_slugs(
        subscription.plan if subscription and subscription.plan else None,
        subscription=subscription,
    )
    rows = (
        OrganizationModule.objects
        .filter(organization=org, module__is_active=True)
        .select_related("module")
        .order_by("module__sort_order", "module__name")
    )
    modules = [
        {
            "id": row.module_id,
            "name": row.module.name,
            "slug": row.module.slug,
            "enabled": bool(row.enabled and row.module.slug in allowed_slugs),
            "eligible": bool(row.module.slug in allowed_slugs),
            "path": MODULE_PATHS.get(row.module.slug, f"/{row.module.slug}"),
        }
        for row in rows
    ]
    enabled_modules = [module for module in modules if module["enabled"]]
    return modules, enabled_modules


def _default_accounts_workspace():
    return {
        "customers": [],
        "vendors": [],
        "itemMasters": [],
        "gstTemplates": [],
        "billingTemplates": [],
        "estimates": [],
        "invoices": [],
    }


def _normalize_accounts_workspace(payload):
    base = _default_accounts_workspace()
    if not isinstance(payload, dict):
        return base
    for key in ACCOUNTS_ALLOWED_ROOT_KEYS:
        value = payload.get(key)
        base[key] = value if isinstance(value, list) else []
    return base


def _parse_iso_date(value):
    normalized = str(value or "").strip()
    if not normalized:
        return None
    try:
        parsed = date.fromisoformat(normalized)
        return parsed
    except ValueError:
        return None


def _normalize_subscription_status(value):
    normalized = str(value or "").strip().lower()
    mapping = {
        "active": "Active",
        "expired": "Expired",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
    }
    return mapping.get(normalized, "Active")


def _calculate_next_billing_date(start_date):
    if not isinstance(start_date, date):
        return None
    next_month = start_date.month + 1
    year = start_date.year
    while next_month > 12:
        year += 1
        next_month -= 12
    next_day = min(
        start_date.day,
        calendar.monthrange(year, next_month)[1]
    )
    return date(year, next_month, next_day)


def _effective_subscription_status(status, end_date):
    normalized_status = _normalize_subscription_status(status)
    if normalized_status == "Cancelled":
        return "Cancelled"
    today = timezone.localdate()
    if end_date and end_date < today:
        return "Expired"
    return "Active"


def _get_accounts_customer_lookup(org):
    workspace = _get_accounts_workspace(org)
    rows = workspace.data.get("customers") if isinstance(workspace.data, dict) else []
    if not isinstance(rows, list):
        return {}
    lookup = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        customer_id = str(row.get("id") or "").strip()
        if not customer_id:
            continue
        customer_name = str(row.get("companyName") or row.get("name") or row.get("clientName") or "").strip()
        if not customer_name:
            contact_name = str(row.get("clientName") or "").strip()
            if contact_name:
                customer_name = contact_name
        if not customer_name:
            continue
        lookup[customer_id] = customer_name
    return lookup


def _serialize_subscription_category(row):
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
    }


def _serialize_subscription_sub_category(row):
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "categoryId": row.category_id,
        "categoryName": row.category.name if row.category else "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
    }


def _serialize_subscription(row, customer_lookup=None):
    if customer_lookup is None:
        customer_lookup = {}
    customer_id = row.customer_id
    customer_name = ""
    if customer_id is not None:
        customer_name = customer_lookup.get(str(customer_id), "")
    return {
        "id": row.id,
        "subscriptionTitle": row.subscription_title,
        "categoryId": row.category_id,
        "categoryName": row.category.name if row.category else "",
        "subCategoryId": row.sub_category_id,
        "subCategoryName": row.sub_category.name if row.sub_category else "",
        "customerId": customer_id,
        "customerName": customer_name,
        "emailAlertDays": _normalize_subscription_alert_days(row.email_alert_days),
        "whatsappAlertDays": _normalize_subscription_alert_days(row.whatsapp_alert_days),
        "emailAlertAssignTo": _serialize_subscription_alert_assignees(row.email_alert_assign_to),
        "whatsappAlertAssignTo": _serialize_subscription_alert_assignees(row.whatsapp_alert_assign_to),
        "planDurationDays": row.plan_duration_days,
        "paymentDescription": row.payment_description or "",
        "amount": _decimal_to_string(row.amount),
        "currency": row.currency or "INR",
        "startDate": row.start_date.isoformat() if row.start_date else "",
        "endDate": row.end_date.isoformat() if row.end_date else "",
        "nextBillingDate": row.next_billing_date.isoformat() if row.next_billing_date else "",
        "status": _effective_subscription_status(row.status, row.end_date),
        "createdBy": str(row.created_by_id or ""),
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def _get_accounts_workspace(org):
    workspace, _ = AccountsWorkspace.objects.get_or_create(
        organization=org,
        defaults={"data": _default_accounts_workspace()},
    )
    workspace.data = _normalize_accounts_workspace(workspace.data)
    return workspace


def _to_decimal(value):
    try:
        return Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _normalize_subscription_alert_days(value):
    if value is None:
        return None

    if isinstance(value, str):
        source = value.strip()
        if not source:
            return []
        items = [part.strip() for part in source.replace(";", ",").split(",") if part.strip()]
        if len(items) == 1 and "," not in source and ";" not in source and source.isdigit():
            items = [source]
        candidates = items
    elif isinstance(value, (list, tuple, set)):
        candidates = value
    else:
        candidates = [value]

    def _coerce_item(item):
        try:
            number = int(str(item).strip())
        except (TypeError, ValueError):
            return None
        if number < 0:
            return None
        return str(number)

    normalized = []
    for item in candidates:
        if str(item).strip() == "":
            continue
        normalized_item = _coerce_item(item)
        if normalized_item is None:
            return None
        if normalized_item not in normalized:
            normalized.append(normalized_item)
    return normalized


def _is_valid_alert_email(value: str):
    text = str(value or "").strip()
    if not text:
        return False
    if "@" not in text:
        return False
    local, domain = text.rsplit("@", 1)
    if not local or not domain:
        return False
    if "." not in domain:
        return False
    return True


def _normalize_subscription_alert_assignees(value):
    if value is None:
        return []
    if not isinstance(value, (list, tuple, set)):
        return None
    normalized = []
    seen = set()
    for row in value:
        if isinstance(row, dict):
            raw_type = str(row.get("type") or "").strip().lower()
            raw_value = str(row.get("value") or row.get("name") or row.get("label") or "").strip()
            raw_label = str(row.get("label") or row.get("name") or raw_value).strip()
            if raw_type == "user":
                user_id = _coerce_positive_int(row.get("id") or row.get("value"))
                if not user_id or not raw_value:
                    return None
                recipient_key = f"user:{user_id}"
                if recipient_key in seen:
                    continue;
                normalized.append({
                    "type": "user",
                    "value": str(user_id),
                    "label": raw_label
                })
                seen.add(recipient_key)
            elif raw_type == "department":
                if not raw_value:
                    return None
                recipient_key = f"department:{raw_value.lower()}"
                if recipient_key in seen:
                    continue;
                normalized.append({
                    "type": "department",
                    "value": raw_value,
                    "label": raw_value
                })
                seen.add(recipient_key)
            elif raw_type == "email":
                email_value = raw_value.lower()
                if not _is_valid_alert_email(email_value):
                    return None
                recipient_key = f"email:{email_value}"
                if recipient_key in seen:
                    continue
                normalized.append({
                    "type": "email",
                    "value": email_value,
                    "label": raw_label or email_value,
                })
                seen.add(recipient_key)
            else:
                return None
        elif isinstance(row, str):
            raw_value = row.strip()
            if not raw_value:
                continue
            if raw_value.lower().startswith("user:"):
                raw_text = raw_value.split(":", 1)[1].strip()
                user_id = _coerce_positive_int(raw_text)
                if not user_id:
                    return None
                recipient_key = f"user:{user_id}"
                if recipient_key in seen:
                    continue;
                normalized.append({
                    "type": "user",
                    "value": str(user_id),
                    "label": raw_text
                })
                seen.add(recipient_key)
            elif raw_value.lower().startswith("department:"):
                raw_text = raw_value.split(":", 1)[1].strip()
                if not raw_text:
                    return None
                recipient_key = f"department:{raw_text.lower()}"
                if recipient_key in seen:
                    continue;
                normalized.append({
                    "type": "department",
                    "value": raw_text,
                    "label": raw_text
                })
                seen.add(recipient_key)
            elif raw_value.lower().startswith("email:"):
                raw_text = raw_value.split(":", 1)[1].strip().lower()
                if not _is_valid_alert_email(raw_text):
                    return None
                recipient_key = f"email:{raw_text}"
                if recipient_key in seen:
                    continue
                normalized.append({
                    "type": "email",
                    "value": raw_text,
                    "label": raw_text
                })
                seen.add(recipient_key)
            else:
                return None
        else:
            return None
    return normalized


def _serialize_subscription_alert_assignees(value):
    return _normalize_subscription_alert_assignees(value) or []


def _coerce_subscription_alert_assignees(value):
    normalized = _normalize_subscription_alert_assignees(value)
    if normalized is None:
        return None
    return normalized


def _get_org_admin_alert_recipients(org):
    if not org:
        return []
    rows = (
        OrganizationUser.objects
        .filter(organization=org, role="company_admin", is_active=True, user__is_active=True)
        .select_related("user")
    )
    recipients = []
    seen = set()
    for row in rows:
        user_id = _coerce_positive_int(row.user_id)
        if not user_id:
            continue
        recipient_key = f"user:{user_id}"
        if recipient_key in seen:
            continue
        label = _get_org_user_display_name(row.user)
        recipients.append({
            "type": "user",
            "value": str(user_id),
            "label": label
        })
        seen.add(recipient_key)
    return recipients


def _merge_subscription_alert_recipients(primary, org):
    merged = []
    seen = set()
    for entry in list(primary or []) + list(_get_org_admin_alert_recipients(org) or []):
        if not isinstance(entry, dict):
            continue
        entry_type = str(entry.get("type") or "").strip().lower()
        entry_value = str(entry.get("value") or "").strip()
        if not entry_type or not entry_value:
            continue
        key = f"{entry_type}:{entry_value.lower()}"
        if key in seen:
            continue
        merged.append(entry)
        seen.add(key)
    return merged


def _document_totals(document, gst_templates_by_id):
    items = document.get("items") if isinstance(document, dict) else []
    if not isinstance(items, list):
        items = []
    gst_template = gst_templates_by_id.get((document or {}).get("gstTemplateId")) if isinstance(document, dict) else None
    default_tax = Decimal("0")
    if isinstance(gst_template, dict):
        default_tax = (
            _to_decimal(gst_template.get("cgst"))
            + _to_decimal(gst_template.get("sgst"))
            + _to_decimal(gst_template.get("igst"))
            + _to_decimal(gst_template.get("cess"))
        )
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for row in items:
        if not isinstance(row, dict):
            continue
        qty = _to_decimal(row.get("qty"))
        rate = _to_decimal(row.get("rate"))
        line_total = qty * rate
        tax_pct = _to_decimal(row.get("taxPercent")) if str(row.get("taxPercent") or "").strip() else default_tax
        subtotal += line_total
        tax_total += (line_total * tax_pct) / Decimal("100")
    return {
        "subtotal": float(subtotal),
        "tax_total": float(tax_total),
        "grand_total": float(subtotal + tax_total),
    }


@require_http_methods(["GET", "POST"])
def org_enabled_modules(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "modules": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "modules": []})

    _ensure_org_modules(org)
    can_manage = _can_manage_modules(request.user)

    if request.method == "POST":
        if not can_manage:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        module_slug = (payload.get("module_slug") or "").strip().lower()
        enabled = payload.get("enabled")
        if not module_slug or not isinstance(enabled, bool):
            return JsonResponse({"detail": "invalid_payload"}, status=400)
        module = Module.objects.filter(slug=module_slug, is_active=True).first()
        if not module:
            return JsonResponse({"detail": "module_not_found"}, status=404)
        active_sub = _get_active_erp_subscription(org)
        allowed_slugs = _get_plan_erp_module_slugs(
            active_sub.plan if active_sub and active_sub.plan else None,
            subscription=active_sub,
        )
        if enabled and module_slug not in allowed_slugs:
            return JsonResponse({"detail": "module_not_allowed_for_plan"}, status=400)
        org_module, _ = OrganizationModule.objects.get_or_create(
            organization=org,
            module=module,
            defaults={"enabled": enabled},
        )
        if org_module.enabled != enabled:
            org_module.enabled = enabled
            org_module.save(update_fields=["enabled", "updated_at"])

    modules, enabled_modules = _serialize_modules(org)
    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "modules": enabled_modules,
            "enabled_modules": enabled_modules,
            "catalog": modules,
            "can_manage_modules": can_manage,
            "can_manage_users": _can_manage_users(request.user, org),
        }
    )


@require_http_methods(["GET", "POST"])
def org_users(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "users": [], "meta": {}}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": [], "meta": {}})

    can_manage_users = _can_manage_users(request.user, org)

    created_user_credentials = None
    credential_delivery = {
        "is_new_user": False,
        "email_sent": False,
        "status": "not_applicable",
    }

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        _sync_org_users_to_plan_limit(org, requested_by=request.user)
        current_users = _safe_serialize_org_users(org)
        current_meta = _build_org_user_meta(org, users=current_users)
        if not current_meta.get("can_add_users"):
            return JsonResponse(
                {
                    "detail": "employee_limit_reached",
                    "message": current_meta.get("limit_message") or "User limit reached. Add-on users required.",
                    "meta": current_meta,
                },
                status=403,
            )
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        first_name, last_name = _extract_person_name(payload)
        name = " ".join([first_name, last_name]).strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        phone_number = str(payload.get("phone_number") or "").strip()
        confirm_existing_user = bool(payload.get("confirm_existing_user"))
        role = (payload.get("role") or "org_user").strip().lower()
        employee_role = (payload.get("employee_role") or "").strip()
        employee_role_id = payload.get("employee_role_id")
        department = (payload.get("department") or "").strip()
        department_id = payload.get("department_id")
        if role not in ERP_EMPLOYEE_ROLES:
            role = "org_user"
        if department_id not in (None, ""):
            try:
                department_id = int(department_id)
            except (TypeError, ValueError):
                return JsonResponse({"detail": "invalid_department"}, status=400)
            selected_department = OrganizationDepartment.objects.filter(
                organization=org, id=department_id, is_active=True
            ).first()
            if not selected_department:
                return JsonResponse({"detail": "department_not_found"}, status=404)
            department = selected_department.name
        if employee_role_id not in (None, ""):
            try:
                employee_role_id = int(employee_role_id)
            except (TypeError, ValueError):
                return JsonResponse({"detail": "invalid_employee_role"}, status=400)
            selected_role = OrganizationEmployeeRole.objects.filter(
                organization=org,
                id=employee_role_id,
                is_active=True,
            ).first()
            if not selected_role:
                return JsonResponse({"detail": "employee_role_not_found"}, status=404)
            employee_role = selected_role.name
        if not name or not email or not password:
            return JsonResponse({"detail": "name_email_password_required"}, status=400)
        if len(password) < 6:
            return JsonResponse({"detail": "password_too_short"}, status=400)
        existing_user = User.objects.filter(email__iexact=email).first()

        newly_created_user = False
        plain_password_for_share = ""
        with transaction.atomic():
            if existing_user:
                existing_profile = UserProfile.objects.filter(user=existing_user).first()
                if existing_profile and existing_profile.organization_id and existing_profile.organization_id != org.id:
                    return JsonResponse({"detail": "email_belongs_to_another_organization"}, status=409)
                existing_products = _get_user_granted_products(existing_user)
                already_has_business_autopilot = any(
                    product["slug"] == BUSINESS_AUTOPILOT_PRODUCT_SLUG for product in existing_products
                )
                if not already_has_business_autopilot and not confirm_existing_user:
                    return JsonResponse(
                        {
                            "detail": "existing_org_user_requires_confirmation",
                            "message": "This user is already assigned to another product in this organization. The same password will continue to work.",
                            "same_password_allowed": True,
                            "existing_products": existing_products,
                        },
                        status=409,
                    )
                if already_has_business_autopilot:
                    return JsonResponse({"detail": "user_already_assigned_to_business_autopilot"}, status=409)
                user = existing_user
                if first_name or last_name:
                    user.first_name = first_name
                    user.last_name = last_name
                    user.save(update_fields=["first_name", "last_name"])
                if existing_profile:
                    existing_profile.organization = org
                    existing_profile.role = role
                    existing_profile.phone_number = phone_number
                    existing_profile.save(update_fields=["organization", "role", "phone_number"])
                else:
                    UserProfile.objects.create(
                        user=user,
                        organization=org,
                        role=role,
                        phone_number=phone_number,
                    )
            else:
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password=password,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=True,
                )
                UserProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "organization": org,
                        "role": role,
                        "phone_number": phone_number,
                    },
                )
                newly_created_user = True
                plain_password_for_share = str(password or "")

            OrganizationUser.objects.update_or_create(
                organization=org,
                user=user,
                defaults={
                    "role": role,
                    "employee_role": employee_role,
                    "department": department,
                    "is_active": True,
                },
            )
            _grant_business_autopilot_access(user, request.user, role)
            _sync_org_users_to_plan_limit(org, requested_by=request.user)

        is_existing_user_added = bool(existing_user) and not newly_created_user
        if newly_created_user or is_existing_user_added:
            login_url = PUBLIC_LOGIN_URL
            password_for_share = (
                plain_password_for_share
                if newly_created_user
                else "Use your existing password"
            )
            created_user_credentials = {
                "name": _get_org_user_display_name(user),
                "email": str(user.email or "").strip(),
                "password": password_for_share,
                "login_url": login_url,
            }
            mail_sent = send_templated_email(
                user.email,
                "Your Work Zilla login credentials",
                "emails/business_autopilot_user_credentials.txt",
                {
                    "name": created_user_credentials["name"] or "User",
                    "email": created_user_credentials["email"],
                    "password": password_for_share,
                    "login_url": login_url,
                    "organization_name": str(org.name or "").strip(),
                },
            )
            credential_delivery = {
                "is_new_user": bool(newly_created_user),
                "email_sent": bool(mail_sent),
                "status": "sent" if mail_sent else "failed",
            }

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    users = _safe_serialize_org_users(org)
    user_meta = _build_org_user_meta(org, users=users)
    lock_state = _compute_org_user_lock_ids(user_meta.get("employee_limit"), memberships=_list_org_user_memberships(org))
    users = _attach_locked_state(users, lock_state["locked_ids"])
    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "users": users,
            "employee_roles": _safe_serialize_employee_roles(org),
            "departments": _safe_serialize_departments(org),
            "can_manage_users": can_manage_users,
            "meta": user_meta,
            "created_user_credentials": created_user_credentials,
            "credential_delivery": credential_delivery,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def org_user_detail(request, membership_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": [], "meta": {}})

    can_manage_users = _can_manage_users(request.user, org)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id).select_related("user").first()
    if not membership:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    if request.method == "DELETE":
        _revoke_business_autopilot_access(membership.user)
        membership.delete()
        _sync_org_users_to_plan_limit(org, requested_by=request.user)
        users = _safe_serialize_org_users(org)
        meta = _build_org_user_meta(org, users=users)
        lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=_list_org_user_memberships(org))
        users = _attach_locked_state(users, lock_state["locked_ids"])
        return JsonResponse(
            {
                "authenticated": True,
                "users": users,
                "employee_roles": _safe_serialize_employee_roles(org),
                "departments": _safe_serialize_departments(org),
                "can_manage_users": can_manage_users,
                "meta": meta,
            }
        )

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    role = (payload.get("role") or membership.role or "org_user").strip().lower()
    if role not in ERP_EMPLOYEE_ROLES:
        role = "org_user"

    first_name, last_name = _extract_person_name(payload)
    name = " ".join([first_name, last_name]).strip()
    email = str(payload.get("email") or membership.user.email or "").strip().lower()
    password = str(payload.get("password") or "")
    phone_number = str(payload.get("phone_number") or "").strip()
    employee_role = (payload.get("employee_role") or "").strip()
    employee_role_id = payload.get("employee_role_id")
    department = (payload.get("department") or membership.department or "").strip()
    department_id = payload.get("department_id")
    is_active = payload.get("is_active")

    if not email:
        return JsonResponse({"detail": "email_required"}, status=400)
    if password and len(password) < 6:
        return JsonResponse({"detail": "password_too_short"}, status=400)

    existing_user = User.objects.filter(email__iexact=email).exclude(id=membership.user_id).first()
    if existing_user:
        return JsonResponse({"detail": "email_already_exists"}, status=409)

    if department_id not in (None, ""):
        try:
            department_id = int(department_id)
        except (TypeError, ValueError):
            return JsonResponse({"detail": "invalid_department"}, status=400)
        selected_department = OrganizationDepartment.objects.filter(
            organization=org,
            id=department_id,
            is_active=True,
        ).first()
        if not selected_department:
            return JsonResponse({"detail": "department_not_found"}, status=404)
        department = selected_department.name

    if employee_role_id not in (None, ""):
        try:
            employee_role_id = int(employee_role_id)
        except (TypeError, ValueError):
            return JsonResponse({"detail": "invalid_employee_role"}, status=400)
        selected_role = OrganizationEmployeeRole.objects.filter(
            organization=org,
            id=employee_role_id,
            is_active=True,
        ).first()
        if not selected_role:
            return JsonResponse({"detail": "employee_role_not_found"}, status=404)
        employee_role = selected_role.name

    with transaction.atomic():
        if name:
            membership.user.first_name = first_name
            membership.user.last_name = last_name
        membership.user.email = email
        membership.user.username = email
        if password:
            membership.user.set_password(password)
            membership.user.save(update_fields=["first_name", "last_name", "email", "username", "password"])
        else:
            membership.user.save(update_fields=["first_name", "last_name", "email", "username"])

        profile = UserProfile.objects.filter(user=membership.user).first()
        if profile:
            profile.organization = org
            profile.role = role
            profile.phone_number = phone_number
            profile.save(update_fields=["organization", "role", "phone_number"])
        else:
            UserProfile.objects.create(
                user=membership.user,
                organization=org,
                role=role,
                phone_number=phone_number,
            )

        membership.role = role
        membership.department = department
        membership.employee_role = employee_role
        if isinstance(is_active, bool) and is_active and not membership.is_active:
            _sync_org_users_to_plan_limit(org, requested_by=request.user)
            preview_meta = _build_org_user_meta(org, users=None)
            preview_lock_state = _compute_org_user_lock_ids(
                preview_meta.get("employee_limit"),
                memberships=_list_org_user_memberships(org),
            )
            if membership.id in preview_lock_state["locked_ids"]:
                return JsonResponse(
                    {
                        "detail": "employee_limit_reached",
                        "message": preview_meta.get("limit_message") or "User limit reached. Add-on users required.",
                        "meta": preview_meta,
                    },
                    status=403,
                )

        if isinstance(is_active, bool):
            membership.is_active = is_active
        membership.save(update_fields=["role", "department", "employee_role", "is_active", "updated_at"])
        if membership.is_active:
            _grant_business_autopilot_access(membership.user, request.user, role)
        else:
            _revoke_business_autopilot_access(membership.user)

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    users = _safe_serialize_org_users(org)
    meta = _build_org_user_meta(org, users=users)
    lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=_list_org_user_memberships(org))
    users = _attach_locked_state(users, lock_state["locked_ids"])
    return JsonResponse(
        {
            "authenticated": True,
            "users": users,
            "employee_roles": _safe_serialize_employee_roles(org),
            "departments": _safe_serialize_departments(org),
            "can_manage_users": can_manage_users,
            "meta": meta,
        }
    )


@require_http_methods(["POST"])
def org_user_toggle_status(request, membership_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": [], "meta": {}})

    can_manage_users = _can_manage_users(request.user, org)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id).select_related("user").first()
    if not membership or not membership.user:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        return JsonResponse({"detail": "enabled_required"}, status=400)

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    if enabled and not membership.is_active:
        preview_meta = _build_org_user_meta(org, users=None)
        preview_lock_state = _compute_org_user_lock_ids(
            preview_meta.get("employee_limit"),
            memberships=_list_org_user_memberships(org),
        )
        if membership.id in preview_lock_state["locked_ids"]:
            return JsonResponse(
                {
                    "detail": "employee_limit_reached",
                    "message": preview_meta.get("limit_message") or "User limit reached. Add-on users required.",
                    "meta": preview_meta,
                },
                status=403,
            )

    membership.is_active = enabled
    membership.save(update_fields=["is_active", "updated_at"])
    if enabled:
        _grant_business_autopilot_access(membership.user, request.user, membership.role or "org_user")
    else:
        _revoke_business_autopilot_access(membership.user)

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    users = _safe_serialize_org_users(org)
    meta = _build_org_user_meta(org, users=users)
    lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=_list_org_user_memberships(org))
    users = _attach_locked_state(users, lock_state["locked_ids"])
    message = "User activated." if enabled else "User deactivated."

    return JsonResponse(
        {
            "authenticated": True,
            "users": users,
            "employee_roles": _safe_serialize_employee_roles(org),
            "departments": _safe_serialize_departments(org),
            "can_manage_users": can_manage_users,
            "meta": meta,
            "message": message,
        }
    )


@require_http_methods(["POST"])
def org_user_resend_credentials(request, membership_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": []})

    can_manage_users = _can_manage_users(request.user, org)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id).select_related("user").first()
    if not membership or not membership.user:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    user = membership.user
    email = str(user.email or "").strip()
    if not email:
        return JsonResponse({"detail": "email_required"}, status=400)

    temp_password = _generate_temp_login_password()
    user.set_password(temp_password)
    user.save(update_fields=["password"])

    login_url = PUBLIC_LOGIN_URL
    credentials = {
        "name": _get_org_user_display_name(user),
        "email": email,
        "password": temp_password,
        "login_url": login_url,
    }
    mail_sent = send_templated_email(
        email,
        "Your Work Zilla login credentials",
        "emails/business_autopilot_user_credentials.txt",
        {
            "name": credentials["name"] or "User",
            "email": credentials["email"],
            "password": temp_password,
            "login_url": login_url,
            "organization_name": str(org.name or "").strip(),
        },
    )

    return JsonResponse(
        {
            "authenticated": True,
            "credentials": credentials,
            "email_sent": bool(mail_sent),
            "status": "sent" if mail_sent else "failed",
        }
    )


@require_http_methods(["POST"])
def org_user_verify_email(request, membership_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": [], "meta": {}})

    can_manage_users = _can_manage_users(request.user, org)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id).select_related("user").first()
    if not membership or not membership.user:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    user = membership.user
    email = str(user.email or "").strip()
    if not email:
        return JsonResponse({"detail": "email_required"}, status=400)

    if not bool(getattr(user, "email_verified", False)):
        mark_email_verified(user)
        user.email_verification_sent_at = None
        user.save(update_fields=["email_verification_sent_at"])

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    users = _safe_serialize_org_users(org)
    meta = _build_org_user_meta(org, users=users)
    lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=_list_org_user_memberships(org))
    users = _attach_locked_state(users, lock_state["locked_ids"])

    if membership.is_active and not (membership.id in lock_state["locked_ids"]):
        _grant_business_autopilot_access(user, request.user, membership.role or "org_user")

    return JsonResponse(
        {
            "authenticated": True,
            "users": users,
            "employee_roles": _safe_serialize_employee_roles(org),
            "departments": _safe_serialize_departments(org),
            "can_manage_users": can_manage_users,
            "meta": meta,
            "message": "User email verified successfully.",
        }
    )


@require_http_methods(["GET", "POST"])
def org_role_access(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "role_access_map": {}}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "role_access_map": {}})

    can_manage_users = _can_manage_users(request.user, org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        role_access_map = payload.get("role_access_map", payload)
        normalized_role_access_map = _normalize_role_access_map(role_access_map)
        settings_obj.business_autopilot_role_access_map = normalized_role_access_map
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])
    else:
        normalized_role_access_map = _normalize_role_access_map(
            settings_obj.business_autopilot_role_access_map or {}
        )

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "can_manage_users": can_manage_users,
            "role_access_map": normalized_role_access_map,
        }
    )


@require_http_methods(["GET", "POST"])
def org_employee_roles(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "employee_roles": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "employee_roles": []})

    can_manage_users = _can_manage_users(request.user, org)

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        conflicting_department_exists = (
            OrganizationDepartment.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exists()
        )
        if conflicting_department_exists:
            return JsonResponse({"detail": "employee_role_matches_department_name"}, status=400)
        existing_role = (
            OrganizationEmployeeRole.objects
            .filter(organization=org, name__iexact=name)
            .order_by("-is_active", "id")
            .first()
        )
        if existing_role:
            update_fields = []
            if not existing_role.is_active:
                existing_role.is_active = True
                update_fields.append("is_active")
            if existing_role.name != name:
                existing_role.name = name
                update_fields.append("name")
            if update_fields:
                try:
                    existing_role.save(update_fields=[*update_fields, "updated_at"])
                except IntegrityError:
                    return JsonResponse({"detail": "employee_role_exists"}, status=400)
        else:
            try:
                OrganizationEmployeeRole.objects.create(
                    organization=org,
                    name=name,
                    is_active=True,
                )
            except IntegrityError:
                return JsonResponse({"detail": "employee_role_exists"}, status=400)

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": can_manage_users,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def org_employee_role_detail(request, role_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if not _can_manage_users(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    role = OrganizationEmployeeRole.objects.filter(
        organization=org,
        id=role_id,
    ).first()
    if not role:
        return JsonResponse({"detail": "employee_role_not_found"}, status=404)

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        conflicting_department_exists = (
            OrganizationDepartment.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exists()
        )
        if conflicting_department_exists:
            return JsonResponse({"detail": "employee_role_matches_department_name"}, status=400)
        duplicate = (
            OrganizationEmployeeRole.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exclude(id=role.id)
            .exists()
        )
        if duplicate:
            return JsonResponse({"detail": "employee_role_exists"}, status=400)
        role.name = name
        role.is_active = True
        try:
            role.save(update_fields=["name", "is_active", "updated_at"])
        except IntegrityError:
            return JsonResponse({"detail": "employee_role_exists"}, status=400)
    else:
        if role.is_active:
            role.is_active = False
            role.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": _can_manage_users(request.user, org),
        }
    )


@require_http_methods(["GET", "POST"])
def org_departments(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "departments": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "departments": []})

    can_manage_users = _can_manage_users(request.user, org)

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        conflicting_role_exists = (
            OrganizationEmployeeRole.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exists()
        )
        if conflicting_role_exists:
            return JsonResponse({"detail": "department_matches_employee_role_name"}, status=400)
        existing_department = (
            OrganizationDepartment.objects
            .filter(organization=org, name__iexact=name)
            .order_by("-is_active", "id")
            .first()
        )
        if existing_department:
            update_fields = []
            if not existing_department.is_active:
                existing_department.is_active = True
                update_fields.append("is_active")
            if existing_department.name != name:
                existing_department.name = name
                update_fields.append("name")
            if update_fields:
                try:
                    existing_department.save(update_fields=[*update_fields, "updated_at"])
                except IntegrityError:
                    return JsonResponse({"detail": "department_exists"}, status=400)
        else:
            try:
                OrganizationDepartment.objects.create(
                    organization=org,
                    name=name,
                    is_active=True,
                )
            except IntegrityError:
                return JsonResponse({"detail": "department_exists"}, status=400)

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "departments": _serialize_departments(org),
            "can_manage_users": can_manage_users,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def org_department_detail(request, department_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if not _can_manage_users(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    department = OrganizationDepartment.objects.filter(
        organization=org,
        id=department_id,
    ).first()
    if not department:
        return JsonResponse({"detail": "department_not_found"}, status=404)

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        conflicting_role_exists = (
            OrganizationEmployeeRole.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exists()
        )
        if conflicting_role_exists:
            return JsonResponse({"detail": "department_matches_employee_role_name"}, status=400)
        duplicate = (
            OrganizationDepartment.objects
            .filter(organization=org, name__iexact=name, is_active=True)
            .exclude(id=department.id)
            .exists()
        )
        if duplicate:
            return JsonResponse({"detail": "department_exists"}, status=400)
        department.name = name
        department.is_active = True
        try:
            department.save(update_fields=["name", "is_active", "updated_at"])
        except IntegrityError:
            return JsonResponse({"detail": "department_exists"}, status=400)
    else:
        if department.is_active:
            department.is_active = False
            department.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "departments": _serialize_departments(org),
            "employee_roles": _serialize_employee_roles(org),
            "can_manage_users": _can_manage_users(request.user, org),
        }
    )


@require_http_methods(["GET", "PUT"])
def payroll_workspace(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse(
            {
                "authenticated": True,
                "organization": None,
                "organization_profile": {
                    "organizationName": "",
                    "country": "India",
                    "currency": "INR",
                    "timezone": "UTC",
                },
                "payroll_settings": _default_payroll_settings_payload(),
                "salary_structures": [],
                "salary_history": [],
                "payroll_entries": [],
                "payslips": [],
                "employee_directory": [],
                "permissions": {
                    "can_manage_payroll": False,
                    "can_view_all_payroll": False,
                    "can_view_salary_history": False,
                },
            }
        )

    can_manage_payroll = _can_manage_payroll(request.user, org)
    can_view_salary_history = _can_view_salary_history(request.user, org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    payroll_settings = _get_or_create_payroll_settings(org)
    standard_template = _ensure_standard_salary_template(org)

    if request.method == "PUT":
        if not can_manage_payroll:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)

        org_profile = payload.get("organization_profile") if isinstance(payload, dict) else {}
        payroll_payload = payload.get("payroll_settings") if isinstance(payload, dict) else {}
        structure_payloads = payload.get("salary_structures") if isinstance(payload, dict) else []
        history_payloads = payload.get("salary_history") if isinstance(payload, dict) else []
        entry_payloads = payload.get("payroll_entries") if isinstance(payload, dict) else []
        payslip_payloads = payload.get("payslips") if isinstance(payload, dict) else []

        with transaction.atomic():
            org.name = str((org_profile or {}).get("organizationName") or org.name).strip() or org.name
            org.country = str((org_profile or {}).get("country") or org.country or "India").strip() or "India"
            org.currency = str((org_profile or {}).get("currency") or org.currency or "INR").strip().upper()[:10] or "INR"
            org.save(update_fields=["name", "country", "currency"])

            settings_obj.org_timezone = str((org_profile or {}).get("timezone") or settings_obj.org_timezone or "UTC").strip() or "UTC"
            settings_obj.save(update_fields=["org_timezone"])

            payroll_settings.enable_pf = _to_bool((payroll_payload or {}).get("enablePf"), True)
            payroll_settings.enable_esi = _to_bool((payroll_payload or {}).get("enableEsi"), True)
            payroll_settings.pf_employee_percent = _to_decimal((payroll_payload or {}).get("pfEmployeePercent") or "12")
            payroll_settings.pf_employer_percent = _to_decimal((payroll_payload or {}).get("pfEmployerPercent") or "12")
            payroll_settings.esi_employee_percent = _to_decimal((payroll_payload or {}).get("esiEmployeePercent") or "0.75")
            payroll_settings.esi_employer_percent = _to_decimal((payroll_payload or {}).get("esiEmployerPercent") or "3.25")
            payroll_settings.updated_by = request.user
            payroll_settings.save()

            existing_structures = {row.id: row for row in SalaryStructure.objects.filter(organization=org)}
            keep_structure_ids = set()
            structure_id_map = {}
            for item in structure_payloads if isinstance(structure_payloads, list) else []:
                if not isinstance(item, dict):
                    continue
                structure_id = _coerce_int(item.get("id"))
                row = existing_structures.get(structure_id) if structure_id else None
                if not row:
                    row = SalaryStructure(organization=org)
                row.name = str(item.get("name") or "").strip() or f"Structure {timezone.now().strftime('%H%M%S')}"
                row.is_default = _to_bool(item.get("isDefault"), False)
                row.basic_salary_percent = _to_decimal(item.get("basicSalaryPercent") or "40")
                row.hra_percent = _to_decimal(item.get("hraPercent") or "20")
                row.conveyance_fixed = _to_decimal(item.get("conveyanceFixed") or item.get("conveyance") or "1600")
                row.auto_special_allowance = _to_bool(item.get("autoSpecialAllowance"), True)
                row.basic_salary = _to_decimal(item.get("basicSalary"))
                row.hra = _to_decimal(item.get("hra"))
                row.conveyance = _to_decimal(item.get("conveyance"))
                row.special_allowance = _to_decimal(item.get("specialAllowance"))
                row.bonus = _to_decimal(item.get("bonus"))
                row.other_allowances = _to_decimal(item.get("otherAllowances"))
                row.apply_pf = _to_bool(item.get("applyPf"), True)
                row.apply_esi = _to_bool(item.get("applyEsi"), True)
                row.professional_tax = _to_decimal(item.get("professionalTax"))
                row.other_deduction = _to_decimal(item.get("otherDeduction"))
                row.notes = str(item.get("notes") or "").strip()
                row.save()
                keep_structure_ids.add(row.id)
                structure_id_map[str(item.get("id") or "")] = row.id
            SalaryStructure.objects.filter(organization=org).exclude(id__in=keep_structure_ids).delete()

            keep_history_ids = set()
            history_id_map = {}
            if can_view_salary_history:
                existing_history = {row.id: row for row in EmployeeSalaryHistory.objects.filter(organization=org)}
                for item in history_payloads if isinstance(history_payloads, list) else []:
                    if not isinstance(item, dict):
                        continue
                    history_id = _coerce_int(item.get("id"))
                    row = existing_history.get(history_id) if history_id else None
                    if not row:
                        row = EmployeeSalaryHistory(organization=org)
                    resolved_structure_id = _coerce_int(item.get("salaryStructureId"))
                    resolved_structure_id = structure_id_map.get(str(item.get("salaryStructureId")), resolved_structure_id)
                    row.employee_name = str(item.get("employeeName") or "").strip()
                    row.source_user_id = _coerce_int(item.get("sourceUserId"))
                    row.salary_structure_id = resolved_structure_id if resolved_structure_id in keep_structure_ids else resolved_structure_id
                    row.current_salary = _to_decimal(item.get("currentSalary") or item.get("monthlySalaryAmount"))
                    row.monthly_salary_amount = _to_decimal(item.get("monthlySalaryAmount"))
                    row.increment_type = str(item.get("incrementType") or "percentage").strip().lower() or "percentage"
                    if row.increment_type not in {"percentage", "fixed"}:
                        row.increment_type = "percentage"
                    row.increment_value = _to_decimal(item.get("incrementValue"))
                    effective_from = str(item.get("effectiveFrom") or "").strip()
                    row.effective_from = effective_from or timezone.localdate().isoformat()
                    row.increment_amount = _to_decimal(item.get("incrementAmount"))
                    row.new_salary = _to_decimal(item.get("newSalary") or item.get("monthlySalaryAmount"))
                    row.notes = str(item.get("notes") or "").strip()
                    row.save()
                    keep_history_ids.add(row.id)
                    history_id_map[str(item.get("id") or "")] = row.id
                EmployeeSalaryHistory.objects.filter(organization=org).exclude(id__in=keep_history_ids).delete()
            default_structure_id = next((row_id for row_id in keep_structure_ids if existing_structures.get(row_id) and existing_structures[row_id].is_default), None)
            explicit_default_ids = []
            for row in SalaryStructure.objects.filter(organization=org, id__in=keep_structure_ids):
                if row.is_default:
                    explicit_default_ids.append(row.id)
            if explicit_default_ids:
                SalaryStructure.objects.filter(organization=org).exclude(id=explicit_default_ids[0]).update(is_default=False)
            else:
                standard_template = _ensure_standard_salary_template(org)
                keep_structure_ids.add(standard_template.id)

            existing_entries = {row.id: row for row in PayrollEntry.objects.filter(organization=org)}
            keep_entry_ids = set()
            entry_id_map = {}
            for item in entry_payloads if isinstance(entry_payloads, list) else []:
                if not isinstance(item, dict):
                    continue
                entry_id = _coerce_int(item.get("id"))
                row = existing_entries.get(entry_id) if entry_id else None
                if not row:
                    row = PayrollEntry(organization=org)
                resolved_structure_id = _coerce_int(item.get("salaryStructureId"))
                resolved_structure_id = structure_id_map.get(str(item.get("salaryStructureId")), resolved_structure_id)
                resolved_history_id = _coerce_int(item.get("salaryHistoryId"))
                resolved_history_id = history_id_map.get(str(item.get("salaryHistoryId")), resolved_history_id)
                row.employee_name = str(item.get("employeeName") or "").strip()
                row.source_user_id = _coerce_int(item.get("sourceUserId"))
                row.payroll_month = _normalize_payroll_month(item.get("month"))
                row.currency = str(item.get("currency") or org.currency or "INR").strip().upper()[:10] or "INR"
                row.salary_structure_id = resolved_structure_id
                row.salary_history_id = resolved_history_id
                row.gross_salary = _to_decimal(item.get("grossSalary"))
                row.pf_employee_amount = _to_decimal(item.get("pfEmployeeAmount"))
                row.pf_employer_amount = _to_decimal(item.get("pfEmployerAmount"))
                row.esi_employee_amount = _to_decimal(item.get("esiEmployeeAmount"))
                row.esi_employer_amount = _to_decimal(item.get("esiEmployerAmount"))
                row.professional_tax_amount = _to_decimal(item.get("professionalTaxAmount"))
                row.other_deduction_amount = _to_decimal(item.get("otherDeductionAmount"))
                row.total_deductions = _to_decimal(item.get("totalDeductions"))
                row.net_salary = _to_decimal(item.get("netSalary"))
                row.earnings = item.get("earnings") if isinstance(item.get("earnings"), dict) else {}
                row.deductions = item.get("deductions") if isinstance(item.get("deductions"), dict) else {}
                row.status = str(item.get("status") or "processed").strip().lower() or "processed"
                row.save()
                keep_entry_ids.add(row.id)
                entry_id_map[str(item.get("id") or "")] = row.id
            PayrollEntry.objects.filter(organization=org).exclude(id__in=keep_entry_ids).delete()

            existing_payslips = {row.id: row for row in Payslip.objects.filter(organization=org)}
            keep_payslip_ids = set()
            for item in payslip_payloads if isinstance(payslip_payloads, list) else []:
                if not isinstance(item, dict):
                    continue
                payslip_id = _coerce_int(item.get("id"))
                row = existing_payslips.get(payslip_id) if payslip_id else None
                if not row:
                    row = Payslip(organization=org)
                resolved_entry_id = _coerce_int(item.get("payrollEntryId"))
                resolved_entry_id = entry_id_map.get(str(item.get("payrollEntryId")), resolved_entry_id)
                if not resolved_entry_id:
                    continue
                row.payroll_entry_id = resolved_entry_id
                row.slip_number = str(item.get("slipNumber") or f"SLIP-{resolved_entry_id}").strip()
                row.generated_for_month = _normalize_payroll_month(item.get("generatedForMonth") or item.get("month"))
                row.employee_name = str(item.get("employeeName") or "").strip()
                row.source_user_id = _coerce_int(item.get("sourceUserId"))
                row.currency = str(item.get("currency") or org.currency or "INR").strip().upper()[:10] or "INR"
                row.save()
                keep_payslip_ids.add(row.id)
            Payslip.objects.filter(organization=org).exclude(id__in=keep_payslip_ids).delete()

    salary_structures = list(
        SalaryStructure.objects.filter(organization=org).order_by("name", "id")
    )
    salary_history = list(
        EmployeeSalaryHistory.objects.filter(organization=org).select_related("salary_structure")
    ) if can_view_salary_history else []
    payroll_entries_qs = PayrollEntry.objects.filter(organization=org).select_related("salary_structure", "salary_history", "payslip")
    payslips_qs = Payslip.objects.filter(organization=org).select_related("payroll_entry")

    if not can_manage_payroll:
        payroll_entries_qs = payroll_entries_qs.filter(source_user_id=request.user.id)
        payslips_qs = payslips_qs.filter(source_user_id=request.user.id)
        salary_history = [row for row in salary_history if row.source_user_id == request.user.id]

    payroll_entries = list(payroll_entries_qs.order_by("-payroll_month", "employee_name", "-id"))
    payslips = list(payslips_qs.order_by("-generated_at", "-id"))

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "organization_profile": _serialize_org_payroll_profile(org),
            "payroll_settings": _serialize_payroll_settings(payroll_settings),
            "salary_structures": [_serialize_salary_structure(row) for row in salary_structures],
            "salary_history": [_serialize_salary_history(row) for row in salary_history],
            "payroll_entries": [_serialize_payroll_entry(row) for row in payroll_entries],
            "payslips": [_serialize_payslip(row) for row in payslips],
            "employee_directory": _serialize_org_users(org),
            "permissions": {
                "can_manage_payroll": can_manage_payroll,
                "can_view_all_payroll": can_manage_payroll,
                "can_view_salary_history": can_view_salary_history,
            },
        }
    )


@require_http_methods(["GET"])
def employees_search(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    if not _can_view_salary_history(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    query = str(request.GET.get("q") or "").strip().lower()
    if not query:
        return JsonResponse([], safe=False)

    memberships = (
        OrganizationUser.objects
        .filter(organization=org, is_active=True, user__is_active=True, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user")
    )
    matches = []
    for member in memberships:
        display_name = _get_org_user_display_name(member.user)
        haystack = " ".join(
            [
                display_name,
                str(member.user.username or ""),
                str(member.user.email or ""),
                str(member.department or ""),
                str(member.employee_role or ""),
            ]
        ).strip().lower()
        if query not in haystack:
            continue
        matches.append(
            {
                "id": member.user_id,
                "name": display_name,
                "employee_id": _format_employee_code(member.user_id),
            }
        )

    matches.sort(key=lambda row: (str(row.get("name") or "").lower(), row.get("id") or 0))
    return JsonResponse(matches[:20], safe=False)


@require_http_methods(["GET"])
def employee_salary_history(request, employee_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    if not _can_view_salary_history(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = (
        OrganizationUser.objects
        .filter(organization=org, user_id=employee_id)
        .select_related("user")
        .first()
    )
    history_rows = list(
        EmployeeSalaryHistory.objects
        .filter(organization=org, source_user_id=employee_id)
        .select_related("salary_structure")
        .order_by("effective_from", "id")
    )
    if not membership and not history_rows:
        return JsonResponse({"detail": "employee_not_found"}, status=404)

    employee_name = ""
    if history_rows:
        employee_name = str(history_rows[0].employee_name or "").strip()
    if not employee_name and membership:
        employee_name = _get_org_user_display_name(membership.user)

    return JsonResponse(
        {
            "employee_id": employee_id,
            "employee_code": _format_employee_code(employee_id),
            "employee_name": employee_name,
            "history": [_serialize_salary_history_detail(row) for row in history_rows],
        }
    )


@require_http_methods(["GET"])
def payroll_payslip_pdf(request, payslip_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    payslip = (
        Payslip.objects
        .filter(organization=org, id=payslip_id)
        .select_related("payroll_entry", "payroll_entry__salary_structure")
        .first()
    )
    if not payslip:
        return JsonResponse({"detail": "payslip_not_found"}, status=404)

    can_manage_payroll = _can_manage_payroll(request.user, org)
    if not can_manage_payroll and payslip.source_user_id != request.user.id:
        return JsonResponse({"detail": "forbidden"}, status=403)

    payroll_entry = payslip.payroll_entry
    currency = payslip.currency or payroll_entry.currency or org.currency or "INR"
    earnings = payroll_entry.earnings if isinstance(payroll_entry.earnings, dict) else {}
    deductions = payroll_entry.deductions if isinstance(payroll_entry.deductions, dict) else {}

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 18 * mm
    top = height - 18 * mm

    pdf.setTitle(f"Payslip {payslip.slip_number}")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(left, top, org.name or "Organization")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(left, top - 14, f"Payslip for {payslip.generated_for_month}")
    pdf.drawRightString(width - left, top - 14, f"Slip No: {payslip.slip_number}")

    info_y = top - 38
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left, info_y, "Employee Name")
    pdf.drawString(left + 75 * mm, info_y, "Employee ID")
    pdf.drawString(left + 120 * mm, info_y, "Currency")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(left, info_y - 14, payslip.employee_name or "-")
    pdf.drawString(left + 75 * mm, info_y - 14, f"EMP-{payslip.source_user_id or payroll_entry.id}")
    pdf.drawString(left + 120 * mm, info_y - 14, currency)

    section_y = info_y - 42
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left, section_y, "Earnings")
    pdf.drawString(left + 105 * mm, section_y, "Deductions")

    row_y = section_y - 16
    pdf.setFont("Helvetica", 10)
    for index in range(max(len(earnings), len(deductions), 1)):
        earning_items = list(earnings.items())
        deduction_items = list(deductions.items())
        if index < len(earning_items):
            label, amount = earning_items[index]
            pdf.drawString(left, row_y, str(label))
            pdf.drawRightString(left + 80 * mm, row_y, _format_currency_value(currency, amount))
        if index < len(deduction_items):
            label, amount = deduction_items[index]
            pdf.drawString(left + 105 * mm, row_y, str(label))
            pdf.drawRightString(width - left, row_y, _format_currency_value(currency, amount))
        row_y -= 14

    row_y -= 10
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left, row_y, "Gross Salary")
    pdf.drawRightString(left + 80 * mm, row_y, _format_currency_value(currency, payroll_entry.gross_salary))
    pdf.drawString(left + 105 * mm, row_y, "Net Salary")
    pdf.drawRightString(width - left, row_y, _format_currency_value(currency, payroll_entry.net_salary))
    row_y -= 16
    pdf.setFont("Helvetica", 10)
    pdf.drawString(left, row_y, f"Total Deductions: {_format_currency_value(currency, payroll_entry.total_deductions)}")
    pdf.drawString(left + 105 * mm, row_y, f"Generated: {timezone.localtime(payslip.generated_at).strftime('%Y-%m-%d %H:%M') if payslip.generated_at else '-'}")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'inline; filename="{payslip.slip_number}.pdf"'
    return response


@require_http_methods(["GET", "PUT"])
def accounts_workspace(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "data": _default_accounts_workspace()})

    workspace = _get_accounts_workspace(org)

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        data = _normalize_accounts_workspace(payload.get("data"))
        workspace.data = data
        workspace.updated_by = request.user
        workspace.save(update_fields=["data", "updated_by", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "data": _normalize_accounts_workspace(workspace.data),
            "updated_at": workspace.updated_at.isoformat() if workspace.updated_at else "",
        }
)


def _coerce_positive_int(value):
    number = _coerce_int(value)
    return number if number and number > 0 else None


def _coerce_non_negative_int(value):
    number = _coerce_int(value)
    if number is None:
        return None
    return number if number >= 0 else None


def _coerce_subscription_alert_days(value):
    source_values = _normalize_subscription_alert_days(value)
    if source_values is None:
        return None
    return [int(item) for item in source_values]


def _serialize_accounts_customer_options(org):
    workspace = _get_accounts_workspace(org)
    rows = workspace.data.get("customers") if isinstance(workspace.data, dict) else []
    if not isinstance(rows, list):
        return []
    options = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        customer_id = str(row.get("id") or "").strip()
        if not customer_id:
            continue
        customer_name = str(row.get("companyName") or row.get("name") or row.get("clientName") or "").strip()
        if not customer_name:
            continue
        options.append({
            "id": customer_id,
            "name": customer_name,
        })
    return options


@require_http_methods(["GET", "POST"])
def accounts_subscription_categories(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method == "POST" and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    if request.method == "GET":
        rows = list(
            SubscriptionCategory.objects
            .filter(organization=org)
            .order_by("name", "id")
        )
        return JsonResponse({"categories": [_serialize_subscription_category(row) for row in rows]})

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    name = str(payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name_required"}, status=400)

    description = str(payload.get("description") or "").strip()
    try:
        row = SubscriptionCategory.objects.create(
            organization=org,
            name=name,
            description=description,
        )
    except IntegrityError:
        return JsonResponse({"detail": "category_exists"}, status=409)

    return JsonResponse(
        {
            "category": _serialize_subscription_category(row),
        },
        status=201,
    )


@require_http_methods(["GET", "PUT", "DELETE"])
def accounts_subscription_category_detail(request, category_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method in {"PUT", "DELETE"} and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    row = SubscriptionCategory.objects.filter(organization=org, id=category_id).first()
    if not row:
        return JsonResponse({"detail": "category_not_found"}, status=404)

    if request.method == "GET":
        return JsonResponse({"category": _serialize_subscription_category(row)})

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)

        name = str(payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)

        description = str(payload.get("description") or "").strip()
        row.name = name
        row.description = description
        try:
            row.save(update_fields=["name", "description"])
        except IntegrityError:
            return JsonResponse({"detail": "category_exists"}, status=409)
        return JsonResponse({"category": _serialize_subscription_category(row)})

    row.delete()
    return JsonResponse({"deleted": True})


@require_http_methods(["GET", "POST"])
def accounts_subscription_sub_categories(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method == "POST" and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    if request.method == "GET":
        rows = list(
            SubscriptionSubCategory.objects
            .filter(organization=org)
            .select_related("category")
            .order_by("category_id", "name", "id")
        )
        return JsonResponse({"subCategories": [_serialize_subscription_sub_category(row) for row in rows]})

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    category_id = _coerce_positive_int(payload.get("categoryId") or payload.get("category_id"))
    if not category_id:
        return JsonResponse({"detail": "category_required"}, status=400)
    category = SubscriptionCategory.objects.filter(organization=org, id=category_id).first()
    if not category:
        return JsonResponse({"detail": "category_not_found"}, status=404)

    name = str(payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"detail": "name_required"}, status=400)

    description = str(payload.get("description") or "").strip()
    try:
        row = SubscriptionSubCategory.objects.create(
            organization=org,
            category=category,
            name=name,
            description=description,
        )
    except IntegrityError:
        return JsonResponse({"detail": "sub_category_exists"}, status=409)

    return JsonResponse(
        {
            "subCategory": _serialize_subscription_sub_category(row),
        },
        status=201,
    )


@require_http_methods(["GET", "PUT", "DELETE"])
def accounts_subscription_sub_category_detail(request, sub_category_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method in {"PUT", "DELETE"} and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    row = SubscriptionSubCategory.objects.filter(organization=org, id=sub_category_id).select_related("category").first()
    if not row:
        return JsonResponse({"detail": "sub_category_not_found"}, status=404)

    if request.method == "GET":
        return JsonResponse({"subCategory": _serialize_subscription_sub_category(row)})

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)

        name = str(payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        category_id = _coerce_positive_int(payload.get("categoryId") or payload.get("category_id"))
        if category_id:
            category = SubscriptionCategory.objects.filter(organization=org, id=category_id).first()
            if not category:
                return JsonResponse({"detail": "category_not_found"}, status=404)
            row.category = category

        row.name = name
        row.description = str(payload.get("description") or "").strip()
        try:
            row.save(update_fields=["category", "name", "description"])
        except IntegrityError:
            return JsonResponse({"detail": "sub_category_exists"}, status=409)
        return JsonResponse({"subCategory": _serialize_subscription_sub_category(row)})

    row.delete()
    return JsonResponse({"deleted": True})


@require_http_methods(["GET", "POST"])
def accounts_subscriptions(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method == "POST" and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    customer_lookup = _get_accounts_customer_lookup(org)

    if request.method == "GET":
        rows = list(
            Subscription.objects
            .filter(organization=org)
            .select_related("category", "sub_category", "created_by")
            .order_by("-created_at")
        )
        payload = {
            "subscriptions": [_serialize_subscription(row, customer_lookup=customer_lookup) for row in rows],
            "categoryOptions": [_serialize_subscription_category(row) for row in SubscriptionCategory.objects.filter(organization=org).order_by("name")],
            "subCategoryOptions": [_serialize_subscription_sub_category(row) for row in SubscriptionSubCategory.objects.filter(organization=org).select_related("category").order_by("category_id", "name")],
            "customerOptions": _serialize_accounts_customer_options(org),
        }
        return JsonResponse(payload)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    start_date = _parse_iso_date(payload.get("startDate") or payload.get("start_date"))
    if not start_date:
        return JsonResponse({"detail": "start_date_required"}, status=400)

    end_date = _parse_iso_date(payload.get("endDate") or payload.get("end_date"))
    status = _normalize_subscription_status(payload.get("status"))
    category_id = _coerce_positive_int(payload.get("categoryId") or payload.get("category_id"))
    sub_category_id = _coerce_positive_int(payload.get("subCategoryId") or payload.get("sub_category_id"))

    category = None
    if category_id:
        category = SubscriptionCategory.objects.filter(organization=org, id=category_id).first()
        if not category:
            return JsonResponse({"detail": "category_not_found"}, status=404)

    sub_category = None
    if sub_category_id:
        sub_category = SubscriptionSubCategory.objects.filter(organization=org, id=sub_category_id).first()
        if not sub_category:
            return JsonResponse({"detail": "sub_category_not_found"}, status=404)
        if category and sub_category.category_id != category.id:
            return JsonResponse({"detail": "sub_category_category_mismatch"}, status=400)

    customer_id = _coerce_positive_int(payload.get("customerId") or payload.get("customer_id"))
    raw_plan_duration_days = payload.get("planDurationDays", payload.get("plan_duration_days", 30))
    plan_duration_days = _coerce_positive_int(raw_plan_duration_days)
    if raw_plan_duration_days is not None and plan_duration_days is None and str(raw_plan_duration_days).strip() not in ("", "None", "null"):
        return JsonResponse({"detail": "plan_duration_invalid"}, status=400)
    amount = _to_decimal(payload.get("amount"))
    currency = str(payload.get("currency") or org.currency or "INR").strip().upper() or "INR"
    payment_description = str(payload.get("paymentDescription") or payload.get("payment_description") or "").strip()
    subscription_title = str(payload.get("subscriptionTitle") or payload.get("subscription_title") or "").strip()
    if not subscription_title:
        return JsonResponse({"detail": "subscription_title_required"}, status=400)
    raw_email_alert_recipients = payload.get("emailAlertAssignTo") if "emailAlertAssignTo" in payload else payload.get("email_alert_assign_to")
    raw_whatsapp_alert_recipients = payload.get("whatsappAlertAssignTo") if "whatsappAlertAssignTo" in payload else payload.get("whatsapp_alert_assign_to")
    email_alert_recipients = _coerce_subscription_alert_assignees(raw_email_alert_recipients)
    if raw_email_alert_recipients is not None and email_alert_recipients is None:
        return JsonResponse({"detail": "email_alert_assign_to_invalid"}, status=400)
    whatsapp_alert_recipients = _coerce_subscription_alert_assignees(raw_whatsapp_alert_recipients)
    if raw_whatsapp_alert_recipients is not None and whatsapp_alert_recipients is None:
        return JsonResponse({"detail": "whatsapp_alert_assign_to_invalid"}, status=400)
    email_alert_recipients = _merge_subscription_alert_recipients(email_alert_recipients, org)
    whatsapp_alert_recipients = _merge_subscription_alert_recipients(whatsapp_alert_recipients, org)
    raw_email_alert_days = payload.get("emailAlertDays") if "emailAlertDays" in payload else payload.get("email_alert_days")
    raw_whatsapp_alert_days = payload.get("whatsappAlertDays") if "whatsappAlertDays" in payload else payload.get("whatsapp_alert_days")
    email_alert_days = _coerce_subscription_alert_days(raw_email_alert_days)
    if raw_email_alert_days is not None and raw_email_alert_days != "" and email_alert_days is None:
        return JsonResponse({"detail": "email_alert_days_invalid"}, status=400)
    whatsapp_alert_days = _coerce_subscription_alert_days(raw_whatsapp_alert_days)
    if raw_whatsapp_alert_days is not None and raw_whatsapp_alert_days != "" and whatsapp_alert_days is None:
        return JsonResponse({"detail": "whatsapp_alert_days_invalid"}, status=400)

    next_billing_date = _calculate_next_billing_date(start_date)

    row = Subscription.objects.create(
        organization=org,
        category=category,
        sub_category=sub_category,
        subscription_title=subscription_title,
        customer_id=customer_id,
        plan_duration_days=plan_duration_days,
        payment_description=payment_description,
        amount=amount,
        currency=currency,
        start_date=start_date,
        end_date=end_date,
        email_alert_days=email_alert_days,
        whatsapp_alert_days=whatsapp_alert_days,
        email_alert_assign_to=email_alert_recipients,
        whatsapp_alert_assign_to=whatsapp_alert_recipients,
        next_billing_date=next_billing_date,
        status=status,
        created_by=request.user,
    )
    return JsonResponse(
        {
            "subscription": _serialize_subscription(row, customer_lookup=_get_accounts_customer_lookup(org)),
        },
        status=201,
    )


@require_http_methods(["GET", "PUT", "DELETE"])
def accounts_subscription_detail(request, subscription_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)
    if request.method in {"PUT", "DELETE"} and not _can_manage_modules(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    row = (
        Subscription.objects
        .filter(organization=org, id=subscription_id)
        .select_related("category", "sub_category", "created_by")
        .first()
    )
    if not row:
        return JsonResponse({"detail": "subscription_not_found"}, status=404)

    if request.method == "GET":
        return JsonResponse({"subscription": _serialize_subscription(row, customer_lookup=_get_accounts_customer_lookup(org))})

    if request.method == "PUT":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)

        start_date = _parse_iso_date(payload.get("startDate") or payload.get("start_date"))
        if start_date:
            row.start_date = start_date
        end_date = _parse_iso_date(payload.get("endDate") or payload.get("end_date"))

        row.subscription_title = str(payload.get("subscriptionTitle") or payload.get("subscription_title") or row.subscription_title).strip() or row.subscription_title
        row.payment_description = str(payload.get("paymentDescription") or payload.get("payment_description") or row.payment_description).strip()
        amount = payload.get("amount")
        if amount is not None:
            row.amount = _to_decimal(amount)
        if "planDurationDays" in payload or "plan_duration_days" in payload:
            raw_plan_duration_days = payload.get("planDurationDays", payload.get("plan_duration_days"))
            plan_duration_days = _coerce_positive_int(raw_plan_duration_days)
            if plan_duration_days is None and str(raw_plan_duration_days).strip() not in ("", "None", "null"):
                return JsonResponse({"detail": "plan_duration_invalid"}, status=400)
            row.plan_duration_days = plan_duration_days
        row.currency = str(payload.get("currency") or row.currency).strip().upper() or "INR"
        row.status = _normalize_subscription_status(payload.get("status") or row.status)
        row.customer_id = _coerce_positive_int(payload.get("customerId") or payload.get("customer_id")) or row.customer_id
        if "emailAlertDays" in payload or "email_alert_days" in payload:
            raw_email_alert_days = payload.get("emailAlertDays") if "emailAlertDays" in payload else payload.get("email_alert_days")
            email_alert_days = _coerce_subscription_alert_days(raw_email_alert_days)
            if raw_email_alert_days is not None and raw_email_alert_days != "" and email_alert_days is None:
                return JsonResponse({"detail": "email_alert_days_invalid"}, status=400)
            row.email_alert_days = email_alert_days
        if "whatsappAlertDays" in payload or "whatsapp_alert_days" in payload:
            raw_whatsapp_alert_days = payload.get("whatsappAlertDays") if "whatsappAlertDays" in payload else payload.get("whatsapp_alert_days")
            whatsapp_alert_days = _coerce_subscription_alert_days(raw_whatsapp_alert_days)
            if raw_whatsapp_alert_days is not None and raw_whatsapp_alert_days != "" and whatsapp_alert_days is None:
                return JsonResponse({"detail": "whatsapp_alert_days_invalid"}, status=400)
            row.whatsapp_alert_days = whatsapp_alert_days
        if "emailAlertAssignTo" in payload or "email_alert_assign_to" in payload:
            raw_email_alert_recipients = payload.get("emailAlertAssignTo") if "emailAlertAssignTo" in payload else payload.get("email_alert_assign_to")
            email_alert_recipients = _coerce_subscription_alert_assignees(raw_email_alert_recipients)
            if raw_email_alert_recipients is not None and email_alert_recipients is None:
                return JsonResponse({"detail": "email_alert_assign_to_invalid"}, status=400)
            row.email_alert_assign_to = _merge_subscription_alert_recipients(email_alert_recipients, org)
        if "whatsappAlertAssignTo" in payload or "whatsapp_alert_assign_to" in payload:
            raw_whatsapp_alert_recipients = payload.get("whatsappAlertAssignTo") if "whatsappAlertAssignTo" in payload else payload.get("whatsapp_alert_assign_to")
            whatsapp_alert_recipients = _coerce_subscription_alert_assignees(raw_whatsapp_alert_recipients)
            if raw_whatsapp_alert_recipients is not None and whatsapp_alert_recipients is None:
                return JsonResponse({"detail": "whatsapp_alert_assign_to_invalid"}, status=400)
            row.whatsapp_alert_assign_to = _merge_subscription_alert_recipients(whatsapp_alert_recipients, org)

        category_id_raw = "categoryId" in payload and payload.get("categoryId")
        category_id = _coerce_positive_int(payload.get("categoryId") if category_id_raw else payload.get("category_id"))
        if category_id_raw:
            if not category_id:
                return JsonResponse({"detail": "category_invalid"}, status=400)
            category = SubscriptionCategory.objects.filter(organization=org, id=category_id).first()
            if not category:
                return JsonResponse({"detail": "category_not_found"}, status=404)
            row.category = category

        sub_category_id_raw = "subCategoryId" in payload and payload.get("subCategoryId")
        sub_category_id = _coerce_positive_int(payload.get("subCategoryId") if sub_category_id_raw else payload.get("sub_category_id"))
        if sub_category_id_raw:
            if not sub_category_id:
                return JsonResponse({"detail": "sub_category_invalid"}, status=400)
            sub_category = SubscriptionSubCategory.objects.filter(organization=org, id=sub_category_id).first()
            if not sub_category:
                return JsonResponse({"detail": "sub_category_not_found"}, status=404)
            if row.category_id and sub_category.category_id != row.category_id:
                return JsonResponse({"detail": "sub_category_category_mismatch"}, status=400)
            row.sub_category = sub_category

        if start_date:
            row.next_billing_date = _calculate_next_billing_date(row.start_date)
        else:
            row.next_billing_date = _calculate_next_billing_date(row.start_date)
        if end_date is not None:
            row.end_date = end_date

        row.save(update_fields=[
            "category",
            "sub_category",
            "subscription_title",
            "email_alert_assign_to",
            "whatsapp_alert_assign_to",
            "plan_duration_days",
            "email_alert_days",
            "whatsapp_alert_days",
            "customer_id",
            "payment_description",
            "amount",
            "currency",
            "start_date",
            "end_date",
            "next_billing_date",
            "status",
        ])
        return JsonResponse({"subscription": _serialize_subscription(row, customer_lookup=_get_accounts_customer_lookup(org))})

    row.delete()
    return JsonResponse({"deleted": True})


@require_http_methods(["GET", "POST"])
def org_openai_settings(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    if not _can_manage_openai(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        account_email = str(payload.get("account_email") or "").strip()
        model = str(payload.get("model") or "gpt-4o-mini").strip() or "gpt-4o-mini"
        api_key = str(payload.get("api_key") or "").strip()
        enabled = bool(payload.get("enabled"))
        update_fields = []
        if "api_key" in payload and api_key:
            settings_obj.business_autopilot_openai_api_key = api_key
            update_fields.append("business_autopilot_openai_api_key")
        settings_obj.business_autopilot_ai_agent_name = DEFAULT_BA_OPENAI_AGENT_NAME
        settings_obj.business_autopilot_openai_account_email = account_email[:254]
        settings_obj.business_autopilot_openai_model = model[:120]
        settings_obj.business_autopilot_openai_enabled = enabled
        update_fields.extend([
            "business_autopilot_ai_agent_name",
            "business_autopilot_openai_account_email",
            "business_autopilot_openai_model",
            "business_autopilot_openai_enabled",
        ])
        settings_obj.save(update_fields=list(dict.fromkeys(update_fields)))
        return JsonResponse({
            "saved": True,
            **_serialize_openai_settings(settings_obj),
        })

    return JsonResponse(_serialize_openai_settings(settings_obj))


@require_http_methods(["POST"])
def org_openai_test(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    if not _can_manage_openai(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    api_key = str(payload.get("api_key") or settings_obj.business_autopilot_openai_api_key or "").strip()
    model = str(payload.get("model") or settings_obj.business_autopilot_openai_model or "gpt-4o-mini").strip() or "gpt-4o-mini"
    if not api_key:
        return JsonResponse({"detail": "openai_api_key_missing"}, status=400)

    try:
        response = requests.post(
            OPENAI_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "Reply with exactly: Connection OK"},
                    {"role": "user", "content": "Test connection."},
                ],
                "max_tokens": 16,
                "temperature": 0,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        return JsonResponse({"detail": f"openai_request_failed: {exc}"}, status=502)

    data = response.json() if response.content else {}
    if response.status_code >= 400:
        return JsonResponse({"detail": data.get("error", {}).get("message") or "openai_connection_failed"}, status=400)
    return JsonResponse({"ok": True, "model": model})


@require_http_methods(["POST"])
def org_openai_chat(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    if not _can_manage_openai(request.user, org):
        return JsonResponse({"detail": "forbidden"}, status=403)

    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    api_key = str(settings_obj.business_autopilot_openai_api_key or "").strip()
    if not api_key:
        return JsonResponse({"detail": "openai_api_key_missing"}, status=400)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    message = str(payload.get("message") or "").strip()
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    if not message:
        return JsonResponse({"detail": "message_required"}, status=400)

    agent_name = str(settings_obj.business_autopilot_ai_agent_name or DEFAULT_BA_OPENAI_AGENT_NAME).strip() or DEFAULT_BA_OPENAI_AGENT_NAME
    model = str(settings_obj.business_autopilot_openai_model or "gpt-4o-mini").strip() or "gpt-4o-mini"
    context_json = json.dumps(context, ensure_ascii=True)[:24000]
    system_prompt = (
        f"You are {agent_name}, an assistant for Work Zilla Business Autopilot. "
        "Answer only from the provided organization context. "
        "If data is missing, clearly say it is not available in the current dashboard data. "
        "When appropriate, answer in short step-by-step bullets. "
        "Do not invent names, counts, dates, or meetings."
    )

    try:
        response = requests.post(
            OPENAI_CHAT_COMPLETIONS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": (
                            "Organization context JSON:\n"
                            f"{context_json}\n\n"
                            f"User question: {message}"
                        ),
                    },
                ],
                "temperature": 0.2,
                "max_tokens": 500,
            },
            timeout=60,
        )
    except requests.RequestException as exc:
        return JsonResponse({"detail": f"openai_request_failed: {exc}"}, status=502)

    data = response.json() if response.content else {}
    if response.status_code >= 400:
        return JsonResponse({"detail": data.get("error", {}).get("message") or "openai_chat_failed"}, status=400)
    answer = (
        (((data.get("choices") or [{}])[0]).get("message") or {}).get("content")
        if isinstance(data, dict)
        else ""
    )
    answer_text = str(answer or "").strip() or "No response received."
    return JsonResponse({
        "reply": answer_text,
        "agent_name": agent_name,
        "model": model,
    })


@require_http_methods(["GET"])
def accounts_document_print(request, doc_type: str, doc_id: str):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    normalized_doc_type = (doc_type or "").strip().lower()
    if normalized_doc_type not in {"estimate", "invoice"}:
        return JsonResponse({"detail": "invalid_doc_type"}, status=400)

    workspace = _get_accounts_workspace(org)
    data = _normalize_accounts_workspace(workspace.data)
    list_key = "estimates" if normalized_doc_type == "estimate" else "invoices"
    document = next((row for row in data.get(list_key, []) if str(row.get("id")) == str(doc_id)), None)
    if not document:
        return JsonResponse({"detail": "document_not_found"}, status=404)

    gst_templates = {str(row.get("id")): row for row in data.get("gstTemplates", []) if isinstance(row, dict)}
    billing_templates = {str(row.get("id")): row for row in data.get("billingTemplates", []) if isinstance(row, dict)}
    totals = _document_totals(document, gst_templates)
    gst_template = gst_templates.get(str(document.get("gstTemplateId") or ""))
    billing_template = billing_templates.get(str(document.get("billingTemplateId") or ""))
    items = document.get("items") if isinstance(document.get("items"), list) else []

    line_rows = []
    for row in items:
        if not isinstance(row, dict):
            continue
        qty = _to_decimal(row.get("qty"))
        rate = _to_decimal(row.get("rate"))
        amount = qty * rate
        line_rows.append(
            {
                "description": row.get("description") or "-",
                "qty": str(row.get("qty") or ""),
                "rate": float(rate),
                "tax_percent": float(_to_decimal(row.get("taxPercent"))),
                "amount": float(amount),
            }
        )

    context = {
        "org": org,
        "doc_type": normalized_doc_type,
        "doc_type_label": "Estimate" if normalized_doc_type == "estimate" else "Invoice",
        "document": document,
        "items": line_rows,
        "gst_template": gst_template,
        "billing_template": billing_template,
        "totals": totals,
        "gst_total_percent": float(
            (_to_decimal(gst_template.get("cgst")) + _to_decimal(gst_template.get("sgst")) + _to_decimal(gst_template.get("igst")) + _to_decimal(gst_template.get("cess")))
            if isinstance(gst_template, dict)
            else Decimal("0")
        ),
    }
    return render(request, "business_autopilot/accounts/document_print.html", context)


def _crm_is_admin(user: User, org: Organization):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    profile_role = str(getattr(profile, "role", "") or "").strip().lower()
    if profile_role in {"company_admin", "org_admin", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    membership_role = str(getattr(membership, "role", "") or "").strip().lower() if membership else ""
    return membership_role == "company_admin"


def _crm_to_decimal(value):
    try:
        normalized = str(value or "0").strip() or "0"
        normalized = normalized.replace(",", "")
        normalized = "".join(ch for ch in normalized if ch.isdigit() or ch in {".", "-"})
        return Decimal(normalized or "0")
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _crm_order_id(org: Organization):
    next_id = (CrmSalesOrder.objects.filter(organization=org).count() or 0) + 1
    return f"SO-{timezone.now().strftime('%Y%m')}-{next_id:05d}"


def _crm_clean_user_id_list(value):
    raw = value if isinstance(value, list) else []
    user_ids = []
    for item in raw:
        parsed = _coerce_positive_int(item)
        if parsed:
            user_ids.append(parsed)
    return list(dict.fromkeys(user_ids))


def _crm_clean_int_list(value):
    raw = value if isinstance(value, list) else []
    numbers = []
    for item in raw:
        try:
            parsed = int(str(item or "").strip())
        except (TypeError, ValueError):
            continue
        if parsed < 0:
            continue
        numbers.append(parsed)
    return list(dict.fromkeys(numbers))


def _crm_can_access_row(user: User, org: Organization, row):
    if _crm_is_admin(user, org):
        return True
    user_ids = set(_crm_clean_user_id_list(getattr(row, "assigned_user_ids", [])))
    user_ids.update(_crm_clean_user_id_list(getattr(row, "owner_user_ids", [])))
    assigned_user_id = getattr(row, "assigned_user_id", None)
    if assigned_user_id:
        user_ids.add(int(assigned_user_id))
    created_by_id = getattr(row, "created_by_id", None)
    if created_by_id:
        user_ids.add(int(created_by_id))
    return int(user.id) in user_ids


def _serialize_crm_lead(row: CrmLead):
    return {
        "id": row.id,
        "lead_name": row.lead_name,
        "company": row.company,
        "phone": row.phone,
        "lead_amount": float(row.lead_amount or 0),
        "lead_source": row.lead_source,
        "assign_type": row.assign_type,
        "assigned_user_id": row.assigned_user_id,
        "assigned_user_name": row.assigned_user.get_full_name() or row.assigned_user.email if row.assigned_user_id else "",
        "assigned_user_ids": _crm_clean_user_id_list(row.assigned_user_ids),
        "assigned_team": row.assigned_team,
        "stage": row.stage,
        "status": row.status,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_by_name": _get_org_user_display_name(row.created_by) if row.created_by_id else "",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _serialize_crm_deal(row: CrmDeal):
    return {
        "id": row.id,
        "lead_id": row.lead_id,
        "deal_name": row.deal_name,
        "company": row.company,
        "phone": row.phone,
        "deal_value": float(row.deal_value or 0),
        "stage": row.stage,
        "status": row.status,
        "assigned_user_id": row.assigned_user_id,
        "assigned_user_name": row.assigned_user.get_full_name() or row.assigned_user.email if row.assigned_user_id else "",
        "assigned_user_ids": _crm_clean_user_id_list(row.assigned_user_ids),
        "assigned_team": row.assigned_team,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_by_name": _get_org_user_display_name(row.created_by) if row.created_by_id else "",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _serialize_crm_sales_order(row: CrmSalesOrder):
    return {
        "id": row.id,
        "deal_id": row.deal_id,
        "order_id": row.order_id,
        "customer_name": row.customer_name,
        "company": row.company,
        "phone": row.phone,
        "amount": float(row.amount or 0),
        "products": row.products if isinstance(row.products, list) else [],
        "quantity": int(row.quantity or 0),
        "price": float(row.price or 0),
        "tax": float(row.tax or 0),
        "total_amount": float(row.total_amount or 0),
        "status": row.status,
        "assigned_user_id": row.assigned_user_id,
        "assigned_user_name": _get_org_user_display_name(row.assigned_user) if row.assigned_user_id else "",
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_by_name": _get_org_user_display_name(row.created_by) if row.created_by_id else "",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _serialize_crm_meeting(row: CrmMeeting):
    return {
        "id": row.id,
        "title": row.title,
        "company_or_client_name": row.company_or_client_name,
        "related_to": row.related_to,
        "meeting_date": row.meeting_date.isoformat() if row.meeting_date else "",
        "meeting_time": row.meeting_time.strftime("%H:%M") if row.meeting_time else "",
        "owner": row.owner_names,
        "owner_user_ids": _crm_clean_user_id_list(row.owner_user_ids),
        "meeting_mode": row.meeting_mode,
        "reminder_channel": row.reminder_channels if isinstance(row.reminder_channels, list) else [],
        "reminder_days": _crm_clean_int_list(row.reminder_days),
        "reminder_minutes": _crm_clean_int_list(row.reminder_minutes),
        "reminder_summary": row.reminder_summary,
        "status": row.status,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _crm_meeting_recipient_emails(org: Organization, row: CrmMeeting):
    emails = []
    owner_ids = _crm_clean_user_id_list(row.owner_user_ids)
    if owner_ids:
        users = (
            OrganizationUser.objects
            .filter(organization=org, user_id__in=owner_ids, is_active=True)
            .select_related("user")
        )
        for membership in users:
            email = str(getattr(membership.user, "email", "") or "").strip().lower()
            if email:
                emails.append(email)
    if not emails and row.created_by_id:
        fallback_email = str(getattr(row.created_by, "email", "") or "").strip().lower()
        if fallback_email:
            emails.append(fallback_email)
    return list(dict.fromkeys(emails))


def _dispatch_due_crm_meeting_reminders(org: Organization = None, now=None, limit_per_run: int = 500):
    now_value = now or timezone.now()
    queryset = CrmMeeting.objects.filter(is_deleted=False).exclude(status__in=["Completed", "Cancelled", "Missed"])
    if org:
        queryset = queryset.filter(organization=org)
    rows = list(queryset.select_related("organization", "created_by").order_by("meeting_date", "meeting_time", "id")[:limit_per_run])
    if not rows:
        return {"checked": 0, "sent": 0}

    sent = 0
    for row in rows:
        if not row.meeting_date or not row.meeting_time:
            continue
        meeting_dt = datetime.combine(row.meeting_date, row.meeting_time)
        if timezone.is_naive(meeting_dt):
            meeting_dt = timezone.make_aware(meeting_dt, timezone.get_current_timezone())
        channels = {str(item or "").strip().lower() for item in (row.reminder_channels if isinstance(row.reminder_channels, list) else [])}
        if "email" not in channels:
            continue
        day_offsets = _crm_clean_int_list(row.reminder_days)
        minute_offsets = _crm_clean_int_list(row.reminder_minutes)
        schedule_points = []
        schedule_points.extend([("day", days, meeting_dt - timedelta(days=days)) for days in day_offsets])
        schedule_points.extend([("minute", minutes, meeting_dt - timedelta(minutes=minutes)) for minutes in minute_offsets])
        if not schedule_points:
            continue
        sent_map = row.reminder_email_sent_map if isinstance(row.reminder_email_sent_map, dict) else {}
        updated_map = dict(sent_map)
        recipients = _crm_meeting_recipient_emails(row.organization, row)
        if not recipients:
            continue
        for offset_type, offset_value, trigger_dt in schedule_points:
            key = f"{offset_type}:{offset_value}"
            if updated_map.get(key):
                continue
            if now_value < trigger_dt:
                continue
            if now_value > (meeting_dt + timedelta(minutes=15)):
                continue
            subject = f"Meeting Reminder: {row.title or 'Meeting'}"
            context = {
                "meeting_title": row.title or "Meeting",
                "company_or_client_name": row.company_or_client_name or "-",
                "related_to": row.related_to or "-",
                "meeting_date": row.meeting_date.isoformat() if row.meeting_date else "",
                "meeting_time": row.meeting_time.strftime("%I:%M %p") if row.meeting_time else "",
                "meeting_mode": row.meeting_mode or "-",
                "offset_type": "days" if offset_type == "day" else "minutes",
                "offset_value": offset_value,
                "owner": row.owner_names or "-",
            }
            mail_sent = send_templated_email(recipients, subject, "emails/crm_meeting_reminder.txt", context)
            if mail_sent:
                updated_map[key] = now_value.isoformat()
                sent += 1
        if updated_map != sent_map:
            row.reminder_email_sent_map = updated_map
            row.save(update_fields=["reminder_email_sent_map", "updated_at"])
    return {"checked": len(rows), "sent": sent}


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def crm_leads(request, lead_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        lead_name = str(payload.get("lead_name") or payload.get("name") or "").strip()
        if not lead_name:
            return JsonResponse({"detail": "lead_name_required"}, status=400)
        assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id"))
        assigned_user = None
        if assigned_user_id:
            assigned_user = User.objects.filter(id=assigned_user_id).first()
        row = CrmLead.objects.create(
            organization=org,
            lead_name=lead_name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            phone=str(payload.get("phone") or "").strip()[:40],
            lead_amount=_crm_to_decimal(payload.get("lead_amount")),
            lead_source=str(payload.get("lead_source") or "").strip()[:120],
            assign_type="Team" if str(payload.get("assign_type") or "").strip().lower() == "team" else "Users",
            assigned_user=assigned_user,
            assigned_user_ids=_crm_clean_user_id_list(payload.get("assigned_user_ids")),
            assigned_team=str(payload.get("assigned_team") or "").strip()[:180],
            stage=str(payload.get("stage") or "New").strip()[:30] or "New",
            status=str(payload.get("status") or "Open").strip()[:30] or "Open",
            created_by=request.user,
            updated_by=request.user,
        )
        return JsonResponse({"lead": _serialize_crm_lead(row)}, status=201)

    if request.method == "GET" and not lead_id:
        rows = [
            row
            for row in CrmLead.objects.filter(organization=org).select_related("assigned_user", "created_by").order_by("-created_at")
            if _crm_can_access_row(request.user, org, row)
        ]
        pipeline_value = sum((_crm_to_decimal(row.lead_amount) for row in rows if not row.is_deleted), Decimal("0"))
        return JsonResponse(
            {
                "leads": [_serialize_crm_lead(row) for row in rows],
                "pipeline_value": float(pipeline_value),
            }
        )

    row = CrmLead.objects.filter(organization=org, id=lead_id).select_related("assigned_user", "created_by").first() if lead_id else None
    if not row:
        return JsonResponse({"detail": "lead_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, row):
        return JsonResponse({"detail": "forbidden"}, status=403)

    if request.method == "PATCH":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        update_fields = ["updated_by", "updated_at"]
        if "lead_name" in payload or "name" in payload:
            lead_name = str(payload.get("lead_name") or payload.get("name") or "").strip()
            if not lead_name:
                return JsonResponse({"detail": "lead_name_required"}, status=400)
            row.lead_name = lead_name[:180]
            update_fields.append("lead_name")
        if "company" in payload:
            row.company = str(payload.get("company") or "").strip()[:180]
            update_fields.append("company")
        if "phone" in payload:
            row.phone = str(payload.get("phone") or "").strip()[:40]
            update_fields.append("phone")
        if "lead_amount" in payload or "leadAmount" in payload:
            row.lead_amount = _crm_to_decimal(payload.get("lead_amount") if "lead_amount" in payload else payload.get("leadAmount"))
            update_fields.append("lead_amount")
        if "lead_source" in payload or "leadSource" in payload:
            row.lead_source = str(payload.get("lead_source") or payload.get("leadSource") or "").strip()[:120]
            update_fields.append("lead_source")
        if "assign_type" in payload or "assignType" in payload:
            assign_type = str(payload.get("assign_type") or payload.get("assignType") or "").strip().lower()
            row.assign_type = "Team" if assign_type == "team" else "Users"
            update_fields.append("assign_type")
        if "assigned_user_id" in payload or "assignedUserId" in payload:
            assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id") if "assigned_user_id" in payload else payload.get("assignedUserId"))
            row.assigned_user = User.objects.filter(id=assigned_user_id).first() if assigned_user_id else None
            update_fields.append("assigned_user")
        if "assigned_user_ids" in payload or "assignedUserIds" in payload:
            row.assigned_user_ids = _crm_clean_user_id_list(
                payload.get("assigned_user_ids") if "assigned_user_ids" in payload else payload.get("assignedUserIds")
            )
            update_fields.append("assigned_user_ids")
        if "assigned_team" in payload or "assignedTeam" in payload:
            row.assigned_team = str(payload.get("assigned_team") or payload.get("assignedTeam") or "").strip()[:180]
            update_fields.append("assigned_team")
        if "stage" in payload:
            row.stage = str(payload.get("stage") or "New").strip()[:30] or "New"
            update_fields.append("stage")
        if "status" in payload:
            row.status = str(payload.get("status") or "Open").strip()[:30] or "Open"
            update_fields.append("status")
        if "is_deleted" in payload:
            if not _crm_is_admin(request.user, org):
                return JsonResponse({"detail": "forbidden"}, status=403)
            is_deleted = bool(payload.get("is_deleted"))
            row.is_deleted = is_deleted
            row.deleted_at = timezone.now() if is_deleted else None
            row.deleted_by = request.user if is_deleted else None
            update_fields.extend(["is_deleted", "deleted_at", "deleted_by"])
        row.updated_by = request.user
        row.save(update_fields=list(dict.fromkeys(update_fields)))
        return JsonResponse({"lead": _serialize_crm_lead(row)})

    if request.method == "DELETE":
        permanent = str(request.GET.get("permanent") or "").strip().lower() in {"1", "true", "yes"}
        if permanent:
            if not _crm_is_admin(request.user, org):
                return JsonResponse({"detail": "forbidden"}, status=403)
            row.delete()
            return JsonResponse({"deleted": True, "permanent": True})
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.updated_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_by", "updated_at"])
        return JsonResponse({"deleted": True})

    return JsonResponse({"detail": "invalid_method"}, status=405)


@require_http_methods(["POST"])
def crm_convert_to_deal(request, lead_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    lead = CrmLead.objects.filter(organization=org, id=lead_id, is_deleted=False).first()
    if not lead:
        return JsonResponse({"detail": "lead_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, lead):
        return JsonResponse({"detail": "forbidden"}, status=403)
    existing_deal = CrmDeal.objects.filter(organization=org, lead=lead, is_deleted=False).first()
    if existing_deal:
        return JsonResponse({"deal": _serialize_crm_deal(existing_deal), "already_converted": True})
    with transaction.atomic():
        deal = CrmDeal.objects.create(
            organization=org,
            lead=lead,
            deal_name=f"{lead.lead_name} Opportunity",
            company=lead.company,
            phone=lead.phone,
            deal_value=_crm_to_decimal(lead.lead_amount),
            stage="Qualified",
            status="Open",
            assigned_user=lead.assigned_user,
            assigned_user_ids=_crm_clean_user_id_list(lead.assigned_user_ids),
            assigned_team=lead.assigned_team,
            created_by=request.user,
            updated_by=request.user,
        )
        lead.status = "Converted"
        lead.stage = "Qualified"
        lead.updated_by = request.user
        lead.save(update_fields=["status", "stage", "updated_by", "updated_at"])
    return JsonResponse({"deal": _serialize_crm_deal(deal), "lead": _serialize_crm_lead(lead)})


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def crm_deals(request, deal_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    if request.method == "GET" and not deal_id:
        rows = [
        row
        for row in CrmDeal.objects.filter(organization=org).select_related("assigned_user", "lead", "created_by").order_by("-created_at")
        if _crm_can_access_row(request.user, org, row)
    ]
        pipeline_value = sum((_crm_to_decimal(row.deal_value) for row in rows if not row.is_deleted), Decimal("0"))
        return JsonResponse({"deals": [_serialize_crm_deal(row) for row in rows], "pipeline_value": float(pipeline_value)})

    if request.method == "POST" and not deal_id:
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        deal_name = str(payload.get("deal_name") or "").strip()
        if not deal_name:
            return JsonResponse({"detail": "deal_name_required"}, status=400)
        lead = None
        lead_id = _coerce_positive_int(payload.get("lead_id"))
        if lead_id:
            lead = CrmLead.objects.filter(organization=org, id=lead_id).first()
        assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id"))
        assigned_user = User.objects.filter(id=assigned_user_id).first() if assigned_user_id else None
        row = CrmDeal.objects.create(
            organization=org,
            lead=lead,
            deal_name=deal_name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            phone=str(payload.get("phone") or "").strip()[:40],
            deal_value=_crm_to_decimal(payload.get("deal_value")),
            stage=str(payload.get("stage") or "Qualified").strip()[:30] or "Qualified",
            status=str(payload.get("status") or "Open").strip()[:30] or "Open",
            assigned_user=assigned_user,
            assigned_user_ids=_crm_clean_user_id_list(payload.get("assigned_user_ids")),
            assigned_team=str(payload.get("assigned_team") or "").strip()[:180],
            created_by=request.user,
            updated_by=request.user,
        )
        return JsonResponse({"deal": _serialize_crm_deal(row)}, status=201)

    row = CrmDeal.objects.filter(organization=org, id=deal_id).first() if deal_id else None
    if not row:
        return JsonResponse({"detail": "deal_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, row):
        return JsonResponse({"detail": "forbidden"}, status=403)

    if request.method == "PATCH":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        if "stage" in payload:
            stage = str(payload.get("stage") or "").strip()
            if stage in {"Qualified", "Proposal", "Won", "Lost"}:
                row.stage = stage
        if "status" in payload:
            status = str(payload.get("status") or "").strip()
            if status in {"Open", "Won", "Lost"}:
                row.status = status
        if "deal_value" in payload:
            row.deal_value = _crm_to_decimal(payload.get("deal_value"))
        row.updated_by = request.user
        row.save(update_fields=["stage", "status", "deal_value", "updated_by", "updated_at"])
        return JsonResponse({"deal": _serialize_crm_deal(row)})

    if request.method == "DELETE":
        if not _crm_is_admin(request.user, org):
            return JsonResponse({"detail": "forbidden"}, status=403)
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_at"])
        return JsonResponse({"deleted": True})

    return JsonResponse({"detail": "invalid_method"}, status=405)


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def crm_meetings(request, meeting_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    if request.method == "GET" and not meeting_id:
        _dispatch_due_crm_meeting_reminders(org=org)
        rows = [
            row
            for row in CrmMeeting.objects.filter(organization=org).order_by("-created_at")
            if _crm_can_access_row(request.user, org, row)
        ]
        return JsonResponse({"meetings": [_serialize_crm_meeting(row) for row in rows]})

    if request.method == "POST" and not meeting_id:
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        title = str(payload.get("title") or payload.get("meeting_title") or "").strip()
        if not title:
            return JsonResponse({"detail": "title_required"}, status=400)
        meeting_date = parse_date(str(payload.get("meeting_date") or payload.get("meetingDate") or "").strip() or "")
        meeting_time = parse_time(str(payload.get("meeting_time") or payload.get("meetingTime") or "").strip() or "")
        row = CrmMeeting.objects.create(
            organization=org,
            title=title[:180],
            company_or_client_name=str(payload.get("company_or_client_name") or payload.get("companyOrClientName") or "").strip()[:180],
            related_to=str(payload.get("related_to") or payload.get("relatedTo") or "").strip()[:180],
            meeting_date=meeting_date,
            meeting_time=meeting_time,
            owner_names=str(payload.get("owner") or "").strip()[:500],
            owner_user_ids=_crm_clean_user_id_list(payload.get("owner_user_ids") or payload.get("ownerUserIds")),
            meeting_mode=str(payload.get("meeting_mode") or payload.get("meetingMode") or "").strip()[:30],
            reminder_channels=payload.get("reminder_channel") if isinstance(payload.get("reminder_channel"), list)
            else payload.get("reminderChannel") if isinstance(payload.get("reminderChannel"), list)
            else [],
            reminder_days=_crm_clean_int_list(payload.get("reminder_days") if payload.get("reminder_days") is not None else payload.get("reminderDays")),
            reminder_minutes=_crm_clean_int_list(payload.get("reminder_minutes") if payload.get("reminder_minutes") is not None else payload.get("reminderMinutes")),
            reminder_summary=str(payload.get("reminder_summary") or payload.get("reminderSummary") or "").strip()[:255],
            status=str(payload.get("status") or "Scheduled").strip()[:30] or "Scheduled",
            created_by=request.user,
            updated_by=request.user,
        )
        _dispatch_due_crm_meeting_reminders(org=org)
        return JsonResponse({"meeting": _serialize_crm_meeting(row)}, status=201)

    row = CrmMeeting.objects.filter(organization=org, id=meeting_id).first() if meeting_id else None
    if not row:
        return JsonResponse({"detail": "meeting_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, row):
        return JsonResponse({"detail": "forbidden"}, status=403)

    if request.method == "PATCH":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        if "title" in payload or "meeting_title" in payload:
            title = str(payload.get("title") or payload.get("meeting_title") or "").strip()
            if title:
                row.title = title[:180]
        if "company_or_client_name" in payload or "companyOrClientName" in payload:
            row.company_or_client_name = str(payload.get("company_or_client_name") or payload.get("companyOrClientName") or "").strip()[:180]
        if "related_to" in payload or "relatedTo" in payload:
            row.related_to = str(payload.get("related_to") or payload.get("relatedTo") or "").strip()[:180]
        if "meeting_date" in payload or "meetingDate" in payload:
            row.meeting_date = parse_date(str(payload.get("meeting_date") or payload.get("meetingDate") or "").strip() or "")
        if "meeting_time" in payload or "meetingTime" in payload:
            row.meeting_time = parse_time(str(payload.get("meeting_time") or payload.get("meetingTime") or "").strip() or "")
        if "owner" in payload:
            row.owner_names = str(payload.get("owner") or "").strip()[:500]
        if "owner_user_ids" in payload or "ownerUserIds" in payload:
            row.owner_user_ids = _crm_clean_user_id_list(payload.get("owner_user_ids") or payload.get("ownerUserIds"))
        if "meeting_mode" in payload or "meetingMode" in payload:
            row.meeting_mode = str(payload.get("meeting_mode") or payload.get("meetingMode") or "").strip()[:30]
        if "reminder_channel" in payload or "reminderChannel" in payload:
            channels = payload.get("reminder_channel") if isinstance(payload.get("reminder_channel"), list) else payload.get("reminderChannel")
            row.reminder_channels = channels if isinstance(channels, list) else []
        if "reminder_days" in payload or "reminderDays" in payload:
            row.reminder_days = _crm_clean_int_list(payload.get("reminder_days") if payload.get("reminder_days") is not None else payload.get("reminderDays"))
        if "reminder_minutes" in payload or "reminderMinutes" in payload:
            row.reminder_minutes = _crm_clean_int_list(payload.get("reminder_minutes") if payload.get("reminder_minutes") is not None else payload.get("reminderMinutes"))
        if "reminder_summary" in payload or "reminderSummary" in payload:
            row.reminder_summary = str(payload.get("reminder_summary") or payload.get("reminderSummary") or "").strip()[:255]
        if "status" in payload:
            row.status = str(payload.get("status") or row.status).strip()[:30] or row.status
        if "is_deleted" in payload:
            is_deleted = bool(payload.get("is_deleted"))
            row.is_deleted = is_deleted
            row.deleted_at = timezone.now() if is_deleted else None
            row.deleted_by = request.user if is_deleted else None
        row.updated_by = request.user
        row.save()
        _dispatch_due_crm_meeting_reminders(org=org)
        return JsonResponse({"meeting": _serialize_crm_meeting(row)})

    if request.method == "DELETE":
        permanent = str(request.GET.get("permanent") or "").strip() in {"1", "true", "yes"}
        if permanent:
            if not _crm_is_admin(request.user, org):
                return JsonResponse({"detail": "forbidden"}, status=403)
            row.delete()
            return JsonResponse({"deleted": True, "permanent": True})
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.updated_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_by", "updated_at"])
        return JsonResponse({"deleted": True})

    return JsonResponse({"detail": "invalid_method"}, status=405)


@require_http_methods(["GET", "POST", "DELETE"])
def crm_sales_orders(request, order_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    if request.method == "GET" and not order_id:
        rows = CrmSalesOrder.objects.filter(organization=org).select_related("assigned_user", "deal", "created_by").order_by("-created_at")
        visible_rows = [row for row in rows if _crm_is_admin(request.user, org) or row.assigned_user_id == request.user.id]
        return JsonResponse({"sales_orders": [_serialize_crm_sales_order(row) for row in visible_rows]})

    if request.method == "DELETE":
        if not _crm_is_admin(request.user, org):
            return JsonResponse({"detail": "forbidden"}, status=403)
        row = CrmSalesOrder.objects.filter(organization=org, id=order_id).first()
        if not row:
            return JsonResponse({"detail": "sales_order_not_found"}, status=404)
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_at"])
        return JsonResponse({"deleted": True})

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)
    customer_name = str(payload.get("customer_name") or "").strip()
    if not customer_name:
        return JsonResponse({"detail": "customer_name_required"}, status=400)
    quantity = _coerce_positive_int(payload.get("quantity")) or 1
    price = _crm_to_decimal(payload.get("price"))
    tax = _crm_to_decimal(payload.get("tax"))
    amount = _crm_to_decimal(payload.get("amount"))
    total_amount = amount if amount > 0 else (price * Decimal(quantity)) + tax
    assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id"))
    assigned_user = User.objects.filter(id=assigned_user_id).first() if assigned_user_id else request.user
    row = CrmSalesOrder.objects.create(
        organization=org,
        order_id=_crm_order_id(org),
        customer_name=customer_name[:180],
        company=str(payload.get("company") or "").strip()[:180],
        phone=str(payload.get("phone") or "").strip()[:40],
        amount=amount,
        products=payload.get("products") if isinstance(payload.get("products"), list) else [],
        quantity=quantity,
        price=price,
        tax=tax,
        total_amount=total_amount,
        status=str(payload.get("status") or "Pending").strip()[:20] or "Pending",
        assigned_user=assigned_user,
        created_by=request.user,
        updated_by=request.user,
    )
    return JsonResponse({"sales_order": _serialize_crm_sales_order(row)}, status=201)


@require_http_methods(["POST"])
def crm_convert_to_sales_order(request, deal_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)
    deal = CrmDeal.objects.filter(organization=org, id=deal_id, is_deleted=False).first()
    if not deal:
        return JsonResponse({"detail": "deal_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, deal):
        return JsonResponse({"detail": "forbidden"}, status=403)
    if str(deal.stage or "").strip().lower() != "won" and str(deal.status or "").strip().lower() != "won":
        return JsonResponse({"detail": "deal_not_won"}, status=400)
    existing = CrmSalesOrder.objects.filter(organization=org, deal=deal, is_deleted=False).first()
    if existing:
        return JsonResponse({"sales_order": _serialize_crm_sales_order(existing), "already_converted": True})
    with transaction.atomic():
        amount = _crm_to_decimal(deal.deal_value)
        customer_name = str(deal.lead.lead_name if deal.lead_id else deal.deal_name).strip()[:180]
        row = CrmSalesOrder.objects.create(
            organization=org,
            deal=deal,
            order_id=_crm_order_id(org),
            customer_name=customer_name or "Customer",
            company=str(deal.company or "").strip()[:180],
            phone=str(deal.phone or "").strip()[:40],
            amount=amount,
            quantity=1,
            price=amount,
            tax=Decimal("0"),
            total_amount=amount,
            status="Pending",
            assigned_user=deal.assigned_user,
            created_by=request.user,
            updated_by=request.user,
        )
    return JsonResponse({"sales_order": _serialize_crm_sales_order(row)})
