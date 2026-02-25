import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.shortcuts import render

from apps.backend.common_auth.models import User
from core.models import Organization, UserProfile

from .models import (
    Module,
    OrganizationModule,
    OrganizationUser,
    OrganizationEmployeeRole,
    OrganizationDepartment,
    AccountsWorkspace,
)


MODULE_PATHS = {
    "crm": "/crm",
    "hrm": "/hrm",
    "projects": "/projects",
    "accounts": "/accounts",
    "ticketing": "/ticketing",
    "stocks": "/stocks",
}

ERP_EMPLOYEE_ROLES = {"company_admin", "org_user", "hr_view"}
ACCOUNTS_ALLOWED_ROOT_KEYS = {"customers", "itemMasters", "gstTemplates", "billingTemplates", "estimates", "invoices"}


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
            "name": (member.user.first_name or member.user.username or "").strip(),
            "email": member.user.email or "",
            "role": member.role or "org_user",
            "department": member.department or "",
            "employee_role": member.employee_role or "",
            "is_active": bool(member.is_active and member.user.is_active),
            "created_at": member.created_at.isoformat() if member.created_at else "",
        }
        for member in memberships
    ]


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

    name = (payload.get("name") or "").strip()
    employee_role = (payload.get("employee_role") or "").strip()
    employee_role_id = payload.get("employee_role_id")
    department = (payload.get("department") or membership.department or "").strip()
    department_id = payload.get("department_id")
    is_active = payload.get("is_active")

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
            membership.user.first_name = name
            membership.user.save(update_fields=["first_name"])

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
