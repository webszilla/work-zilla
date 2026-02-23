import json

from django.db import DatabaseError
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction

from apps.backend.common_auth.models import User
from apps.backend.worksuite.core.subscription_utils import (
    is_free_plan,
    is_subscription_active,
    maybe_expire_subscription,
)
from core.models import Organization, UserProfile, Subscription

from .models import (
    Module,
    OrganizationDepartment,
    OrganizationEmployeeRole,
    OrganizationModule,
    OrganizationUser,
)


MODULE_PATHS = {
    "crm": "/crm",
    "hrm": "/hrm",
    "projects": "/projects",
    "accounts": "/accounts",
}

ERP_EMPLOYEE_ROLES = {"company_admin", "org_user", "hr_view"}
ERP_PAGE_ACCESS = ["/", "/crm", "/hrm", "/projects", "/accounts", "/users", "/billing", "/plans", "/profile"]
ERP_PRODUCT_SLUG = "business-autopilot-erp"


def _normalize_page_access(raw_value):
    if not isinstance(raw_value, list):
        return ERP_PAGE_ACCESS.copy()
    allowed = []
    for item in raw_value:
        value = str(item or "").strip().lower()
        if value in ERP_PAGE_ACCESS and value not in allowed:
            allowed.append(value)
    if "/" not in allowed:
        allowed.insert(0, "/")
    return allowed or ERP_PAGE_ACCESS.copy()


def _resolve_org(user: User):
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    return Organization.objects.filter(owner=user).first()


def _can_manage_modules(user: User):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    if not profile:
        return False
    return profile.role in {"company_admin", "org_user", "superadmin", "super_admin"}


def _can_manage_users(user: User):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    if not profile:
        return False
    return profile.role in {"company_admin", "superadmin", "super_admin"}


def _ensure_org_modules(org):
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


def _serialize_employee_roles(org):
    rows = (
        OrganizationEmployeeRole.objects
        .filter(organization=org, is_active=True)
        .order_by("name")
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "is_active": bool(row.is_active),
            "page_access": _normalize_page_access(getattr(row, "page_access", [])),
        }
        for row in rows
    ]


def _serialize_departments(org):
    rows = (
        OrganizationDepartment.objects
        .filter(organization=org, is_active=True)
        .order_by("name")
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "is_active": bool(row.is_active),
        }
        for row in rows
    ]


def _resolve_user_page_access(org, user):
    try:
        membership = (
            OrganizationUser.objects
            .only("id", "organization_id", "user_id", "employee_role", "is_active")
            .filter(organization=org, user=user, is_active=True)
            .first()
        )
    except DatabaseError:
        return ERP_PAGE_ACCESS.copy()
    if not membership:
        return ERP_PAGE_ACCESS.copy()
    role_name = (membership.employee_role or "").strip()
    if not role_name:
        return ERP_PAGE_ACCESS.copy()
    try:
        role_obj = (
            OrganizationEmployeeRole.objects
            .only("id", "organization_id", "name", "is_active", "page_access")
            .filter(
                organization=org,
                name=role_name,
                is_active=True,
            )
            .first()
        )
    except DatabaseError:
        return ERP_PAGE_ACCESS.copy()
    if not role_obj:
        return ERP_PAGE_ACCESS.copy()
    try:
        return _normalize_page_access(role_obj.page_access)
    except DatabaseError:
        return ERP_PAGE_ACCESS.copy()


def _serialize_org_users(org):
    memberships = (
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user")
        .order_by("-id")
    )
    return [
        {
            "id": member.user_id,
            "membership_id": member.id,
            "name": (member.user.first_name or member.user.username or "").strip(),
            "email": member.user.email or "",
            "role": member.role or "org_user",
            "employee_role": member.employee_role or "",
            "department": member.department or "",
            "is_active": bool(member.is_active and member.user.is_active),
            "created_at": member.created_at.isoformat() if member.created_at else "",
        }
        for member in memberships
    ]


def _subscription_for_business_autopilot(org):
    if not org:
        return None
    org_id = getattr(org, "id", None)
    if not org_id:
        return None
    product_filter = Q(plan__product__slug=ERP_PRODUCT_SLUG)
    sub = (
        Subscription.objects
        .filter(organization_id=org_id, status__in=("active", "trialing"))
        .filter(product_filter)
        .select_related("plan")
        .order_by("-start_date")
        .first()
    )
    if not sub:
        return None
    if not is_subscription_active(sub):
        maybe_expire_subscription(sub)
        return None
    return sub


def _erp_user_quota(org):
    sub = _subscription_for_business_autopilot(org)
    plan = sub.plan if sub and sub.plan_id else None
    is_trial = bool(sub and sub.status == "trialing")
    current_users = (
        OrganizationUser.objects
        .filter(organization=org, is_active=True, role__in=ERP_EMPLOYEE_ROLES)
        .exclude(role="company_admin")
        .count()
    )

    included_users = 0
    addon_count = int(sub.addon_count or 0) if sub else 0
    allow_addons = bool(plan.allow_addons) if plan else False
    addon_unit_price = 0
    addon_currency = "INR"
    billing_cycle = sub.billing_cycle if sub and sub.billing_cycle in ("monthly", "yearly") else "monthly"

    if plan:
        limits = plan.limits if isinstance(plan.limits, dict) else {}
        if is_free_plan(plan):
            included_users = 3
        else:
            included_users = int(limits.get("included_users") or 0)
        if billing_cycle == "yearly":
            addon_unit_price = float(limits.get("user_price_inr_year") or 0)
        else:
            addon_unit_price = float(limits.get("user_price_inr_month") or 0)

    total_allowed = max(0, included_users + addon_count)
    remaining = max(0, total_allowed - current_users)

    return {
        "has_subscription": bool(sub and plan),
        "plan_name": plan.name if plan else "",
        "is_trialing": is_trial,
        "is_free_plan": bool(plan and is_free_plan(plan)),
        "billing_cycle": billing_cycle,
        "included_users": included_users,
        "addon_count": addon_count,
        "current_users": current_users,
        "total_allowed_users": total_allowed,
        "remaining_users": remaining,
        "allow_addons": allow_addons,
        "addon_unit_price": addon_unit_price,
        "addon_currency": addon_currency,
        "can_create_user": bool(sub and plan and remaining > 0),
        "renew_start_url": f"/my-account/billing/renew/start/?product={ERP_PRODUCT_SLUG}",
    }, sub


def _serialize_modules(org):
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
            "enabled": bool(row.enabled),
            "eligible": True,
            "path": MODULE_PATHS.get(row.module.slug, f"/{row.module.slug}"),
        }
        for row in rows
    ]
    enabled_modules = [module for module in modules if module["enabled"]]
    return modules, enabled_modules


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
            "can_manage_users": _can_manage_users(request.user),
            "erp_page_access": ERP_PAGE_ACCESS,
            "current_role_page_access": _resolve_user_page_access(org, request.user),
        }
    )


@require_http_methods(["GET", "POST"])
def org_users(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "users": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": []})

    can_manage_users = _can_manage_users(request.user)
    quota, active_sub = _erp_user_quota(org)

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        role = (payload.get("role") or "org_user").strip().lower()
        employee_role = (payload.get("employee_role") or "").strip()
        employee_role_id = payload.get("employee_role_id")
        department = (payload.get("department") or "").strip()
        department_id = payload.get("department_id")
        if role not in ERP_EMPLOYEE_ROLES:
            role = "org_user"
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
        if not name or not email or not password:
            return JsonResponse({"detail": "name_email_password_required"}, status=400)
        if len(password) < 6:
            return JsonResponse({"detail": "password_too_short"}, status=400)

        if not quota.get("can_create_user"):
            return JsonResponse(
                {
                    "detail": "user_limit_reached",
                    "user_quota": quota,
                },
                status=409,
            )
        existing_user = User.objects.filter(email__iexact=email).first()

        with transaction.atomic():
            if existing_user:
                existing_profile = UserProfile.objects.filter(user=existing_user).first()
                if existing_profile and existing_profile.organization_id and existing_profile.organization_id != org.id:
                    return JsonResponse({"detail": "email_belongs_to_another_organization"}, status=409)
                user = existing_user
                if name:
                    user.first_name = name
                    user.save(update_fields=["first_name"])
                if existing_profile:
                    existing_profile.organization = org
                    existing_profile.role = role
                    existing_profile.save(update_fields=["organization", "role"])
                else:
                    UserProfile.objects.create(user=user, organization=org, role=role)
            else:
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    password=password,
                    first_name=name,
                    is_active=True,
                )
                UserProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "organization": org,
                        "role": role,
                    },
                )

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

    users = _serialize_org_users(org)
    quota, _ = _erp_user_quota(org)
    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "users": users,
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": can_manage_users,
            "user_quota": quota,
        }
    )


@require_http_methods(["POST"])
def org_users_addon_checkout(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None}, status=404)

    if not _can_manage_users(request.user):
        return JsonResponse({"detail": "forbidden"}, status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    try:
        target_addon_count = int(payload.get("target_addon_count") or 0)
    except (TypeError, ValueError):
        target_addon_count = 0
    target_addon_count = max(0, target_addon_count)

    quota, sub = _erp_user_quota(org)
    if not sub or not sub.plan_id:
        return JsonResponse({"detail": "subscription_not_found", "user_quota": quota}, status=400)
    if quota.get("is_free_plan"):
        return JsonResponse(
            {
                "detail": "free_plan_upgrade_required",
                "redirect_url": f"/pricing/?product={ERP_PRODUCT_SLUG}",
                "user_quota": quota,
            },
            status=400,
        )
    if not sub.plan.allow_addons:
        return JsonResponse({"detail": "addons_not_available", "user_quota": quota}, status=400)
    if target_addon_count <= int(sub.addon_count or 0):
        return JsonResponse({"detail": "target_addon_count_invalid", "user_quota": quota}, status=400)

    request.session["renew_product_slug"] = ERP_PRODUCT_SLUG
    request.session["renew_plan_id"] = sub.plan_id
    request.session["renew_currency"] = "inr"
    request.session["renew_billing"] = sub.billing_cycle or "monthly"
    request.session["renew_addon_count"] = target_addon_count
    request.session.modified = True

    return JsonResponse(
        {
            "ok": True,
            "redirect_url": "/my-account/billing/renew/",
            "target_addon_count": target_addon_count,
            "user_quota": quota,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def org_user_detail(request, membership_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "users": []})

    can_manage_users = _can_manage_users(request.user)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id).select_related("user").first()
    if not membership:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    if request.method == "DELETE":
        membership.delete()
        quota, _ = _erp_user_quota(org)
        return JsonResponse(
            {
                "authenticated": True,
                "users": _serialize_org_users(org),
                "employee_roles": _serialize_employee_roles(org),
                "departments": _serialize_departments(org),
                "can_manage_users": can_manage_users,
                "user_quota": quota,
            }
        )

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    role = (payload.get("role") or membership.role or "org_user").strip().lower()
    if role not in ERP_EMPLOYEE_ROLES:
        role = "org_user"

    name = (payload.get("name") or "").strip()
    employee_role = (payload.get("employee_role") or "").strip()
    employee_role_id = payload.get("employee_role_id")
    department = (payload.get("department") or "").strip()
    department_id = payload.get("department_id")
    is_active = payload.get("is_active")

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

    with transaction.atomic():
        if name:
            membership.user.first_name = name
            membership.user.save(update_fields=["first_name"])

        profile = UserProfile.objects.filter(user=membership.user).first()
        if profile:
            profile.organization = org
            profile.role = role
            profile.save(update_fields=["organization", "role"])

        membership.role = role
        membership.employee_role = employee_role
        membership.department = department
        if isinstance(is_active, bool):
            membership.is_active = is_active
        membership.save(update_fields=["role", "employee_role", "department", "is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "users": _serialize_org_users(org),
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": can_manage_users,
            "user_quota": _erp_user_quota(org)[0],
        }
    )


@require_http_methods(["GET", "POST"])
def org_employee_roles(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "employee_roles": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "employee_roles": []})

    can_manage_users = _can_manage_users(request.user)

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        page_access = _normalize_page_access(payload.get("page_access"))
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        role_obj, _ = OrganizationEmployeeRole.objects.get_or_create(
            organization=org,
            name=name,
            defaults={"is_active": True, "page_access": page_access},
        )
        if role_obj.page_access != page_access:
            role_obj.page_access = page_access
            role_obj.save(update_fields=["page_access", "updated_at"])

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
        return JsonResponse({"authenticated": True, "organization": None, "employee_roles": []})

    can_manage_users = _can_manage_users(request.user)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    role = OrganizationEmployeeRole.objects.filter(organization=org, id=role_id).first()
    if not role:
        return JsonResponse({"detail": "employee_role_not_found"}, status=404)

    if request.method == "DELETE":
        role_name = role.name
        role.delete()
        OrganizationUser.objects.filter(organization=org, employee_role=role_name).update(employee_role="")
        return JsonResponse(
            {
                "authenticated": True,
                "employee_roles": _serialize_employee_roles(org),
                "users": _serialize_org_users(org),
                "can_manage_users": can_manage_users,
            }
        )

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    name = (payload.get("name") or "").strip() or role.name
    raw_page_access = payload.get("page_access")
    page_access = _normalize_page_access(raw_page_access) if raw_page_access is not None else _normalize_page_access(role.page_access)

    existing = OrganizationEmployeeRole.objects.filter(organization=org, name=name).exclude(id=role.id).first()
    if existing:
        return JsonResponse({"detail": "employee_role_already_exists"}, status=409)

    old_name = role.name
    role.name = name
    role.page_access = page_access
    role.is_active = True
    role.save(update_fields=["name", "page_access", "is_active", "updated_at"])
    if old_name != name:
        OrganizationUser.objects.filter(organization=org, employee_role=old_name).update(employee_role=name)

    return JsonResponse(
        {
            "authenticated": True,
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "users": _serialize_org_users(org),
            "can_manage_users": can_manage_users,
        }
    )


@require_http_methods(["GET", "POST"])
def org_departments(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "departments": []}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "departments": []})

    can_manage_users = _can_manage_users(request.user)

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
        OrganizationDepartment.objects.get_or_create(
            organization=org,
            name=name,
            defaults={"is_active": True},
        )

    return JsonResponse(
        {
            "authenticated": True,
            "organization": {
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
            },
            "departments": _serialize_departments(org),
            "users": _serialize_org_users(org),
            "can_manage_users": can_manage_users,
        }
    )


@require_http_methods(["PUT", "DELETE"])
def org_department_detail(request, department_id: int):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "departments": []})

    can_manage_users = _can_manage_users(request.user)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    department = OrganizationDepartment.objects.filter(organization=org, id=department_id).first()
    if not department:
        return JsonResponse({"detail": "department_not_found"}, status=404)

    if request.method == "DELETE":
        old_name = department.name
        department.delete()
        OrganizationUser.objects.filter(organization=org, department=old_name).update(department="")
        return JsonResponse(
            {
                "authenticated": True,
                "departments": _serialize_departments(org),
                "users": _serialize_org_users(org),
                "can_manage_users": can_manage_users,
            }
        )

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    name = (payload.get("name") or "").strip() or department.name
    existing = OrganizationDepartment.objects.filter(organization=org, name=name).exclude(id=department.id).first()
    if existing:
        return JsonResponse({"detail": "department_already_exists"}, status=409)

    old_name = department.name
    department.name = name
    department.is_active = True
    department.save(update_fields=["name", "is_active", "updated_at"])
    if old_name != name:
        OrganizationUser.objects.filter(organization=org, department=old_name).update(department=name)

    return JsonResponse(
        {
            "authenticated": True,
            "departments": _serialize_departments(org),
            "users": _serialize_org_users(org),
            "can_manage_users": can_manage_users,
        }
    )
