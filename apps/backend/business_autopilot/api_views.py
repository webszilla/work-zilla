import json
from decimal import Decimal, InvalidOperation
from io import BytesIO

from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import DatabaseError, OperationalError, transaction
from django.shortcuts import render
from django.utils import timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from apps.backend.common_auth.models import User
from core.models import Organization, OrganizationSettings, UserProfile, Subscription

from .models import (
    Module,
    OrganizationModule,
    OrganizationUser,
    OrganizationEmployeeRole,
    OrganizationDepartment,
    AccountsWorkspace,
    EmployeeSalaryHistory,
    PayrollEntry,
    PayrollSettings,
    Payslip,
    SalaryStructure,
)


MODULE_PATHS = {
    "crm": "/crm",
    "hrm": "/hrm",
    "projects": "/projects",
    "accounts": "/accounts",
    "ticketing": "/ticketing",
    "stocks": "/stocks",
}

DEFAULT_ERP_MODULES = [
    {"name": "CRM", "slug": "crm", "sort_order": 1},
    {"name": "HR Management", "slug": "hrm", "sort_order": 2},
    {"name": "Project Management", "slug": "projects", "sort_order": 3},
    {"name": "Accounts / ERP", "slug": "accounts", "sort_order": 4},
    {"name": "Ticketing System", "slug": "ticketing", "sort_order": 5},
    {"name": "Inventory", "slug": "stocks", "sort_order": 6},
]

ERP_EMPLOYEE_ROLES = {"company_admin", "org_user", "hr_view"}
ACCOUNTS_ALLOWED_ROOT_KEYS = {"customers", "itemMasters", "gstTemplates", "billingTemplates", "estimates", "invoices"}
ERP_MODULE_SLUG_SET = set(MODULE_PATHS.keys())


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
        return ["crm", "hrm", "projects", "accounts"]
    if "starter" in key:
        return ["crm", "hrm", "projects", "accounts"]
    if "growth" in key:
        return ["crm", "hrm", "projects", "accounts", "ticketing", "stocks"]
    if "pro" in key:
        return ["crm", "hrm", "projects", "accounts", "ticketing", "stocks"]
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
        Subscription.objects
        .filter(organization=org, plan__product__slug="business-autopilot-erp")
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
            "name": _get_org_user_display_name(member.user),
            "first_name": str(getattr(member.user, "first_name", "") or "").strip(),
            "last_name": str(getattr(member.user, "last_name", "") or "").strip(),
            "employeeId": _format_employee_code(member.user_id),
            "email": member.user.email or "",
            "role": member.role or "org_user",
            "department": member.department or "",
            "employee_role": member.employee_role or "",
            "is_active": bool(member.is_active and member.user.is_active),
            "created_at": member.created_at.isoformat() if member.created_at else "",
        }
        for member in memberships
    ]


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
            "can_manage_users": _can_manage_users(request.user),
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

    if request.method == "POST":
        if not can_manage_users:
            return JsonResponse({"detail": "forbidden"}, status=403)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        first_name, last_name = _extract_person_name(payload)
        name = " ".join([first_name, last_name]).strip()
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
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

        with transaction.atomic():
            if existing_user:
                existing_profile = UserProfile.objects.filter(user=existing_user).first()
                if existing_profile and existing_profile.organization_id and existing_profile.organization_id != org.id:
                    return JsonResponse({"detail": "email_belongs_to_another_organization"}, status=409)
                user = existing_user
                if first_name or last_name:
                    user.first_name = first_name
                    user.last_name = last_name
                    user.save(update_fields=["first_name", "last_name"])
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
                    first_name=first_name,
                    last_name=last_name,
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
        return JsonResponse(
            {
                "authenticated": True,
                "users": _serialize_org_users(org),
                "employee_roles": _serialize_employee_roles(org),
                "departments": _serialize_departments(org),
                "can_manage_users": can_manage_users,
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
            profile.save(update_fields=["organization", "role"])

        membership.role = role
        membership.department = department
        membership.employee_role = employee_role
        if isinstance(is_active, bool):
            membership.is_active = is_active
        membership.save(update_fields=["role", "department", "employee_role", "is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "users": _serialize_org_users(org),
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": can_manage_users,
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
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        OrganizationEmployeeRole.objects.get_or_create(
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
    if not _can_manage_users(request.user):
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
        duplicate = (
            OrganizationEmployeeRole.objects
            .filter(organization=org, name=name, is_active=True)
            .exclude(id=role.id)
            .exists()
        )
        if duplicate:
            return JsonResponse({"detail": "employee_role_exists"}, status=400)
        role.name = name
        role.is_active = True
        role.save(update_fields=["name", "is_active", "updated_at"])
    else:
        if role.is_active:
            role.is_active = False
            role.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "can_manage_users": _can_manage_users(request.user),
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
    if not _can_manage_users(request.user):
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
        duplicate = (
            OrganizationDepartment.objects
            .filter(organization=org, name=name, is_active=True)
            .exclude(id=department.id)
            .exists()
        )
        if duplicate:
            return JsonResponse({"detail": "department_exists"}, status=400)
        department.name = name
        department.is_active = True
        department.save(update_fields=["name", "is_active", "updated_at"])
    else:
        if department.is_active:
            department.is_active = False
            department.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "departments": _serialize_departments(org),
            "employee_roles": _serialize_employee_roles(org),
            "can_manage_users": _can_manage_users(request.user),
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
