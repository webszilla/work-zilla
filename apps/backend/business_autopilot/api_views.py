import calendar
import base64
import binascii
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
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from apps.backend.common_auth.models import User
from apps.backend.products.models import Product
from core.models import BillingProfile, Organization, OrganizationSettings, UserProductAccess, UserProfile, Subscription as OrgSubscription, log_admin_activity
from core.email_utils import send_templated_email
from core.notification_emails import mark_email_verified

from .models import (
    Module,
    OrganizationModule,
    OrganizationUser,
    OrganizationEmployeeRole,
    OrganizationDepartment,
    CrmContact,
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
DELETE_PROTECTED_PROFILE_ROLES = {"org_admin", "owner", "superadmin", "super_admin"}
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
    "Create/Edit": "Create, View and Edit",
    "View and Edit": "View and Edit",
    "Create, View and Edit": "Create, View and Edit",
    "Full Access": "Full Access",
}
logger = logging.getLogger(__name__)

TEMP_PASSWORD_ALPHABET = string.ascii_letters + string.digits
TEMP_PASSWORD_LENGTH = 10
_BA_UNICODE_PDF_FONT = None


def _ba_hex_to_rgb(value, default="#22c55e"):
    raw = str(value or default).strip()
    if not raw.startswith("#"):
        raw = default
    raw = raw.lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        raw = default.lstrip("#")
    try:
        return tuple(int(raw[index:index + 2], 16) / 255 for index in (0, 2, 4))
    except ValueError:
        fallback = default.lstrip("#")
        return tuple(int(fallback[index:index + 2], 16) / 255 for index in (0, 2, 4))


def _ba_pdf_image_from_data_url(data_url):
    raw = str(data_url or "").strip()
    if not raw.startswith("data:image/") or "," not in raw:
        return None
    _, encoded = raw.split(",", 1)
    try:
        return ImageReader(BytesIO(base64.b64decode(encoded)))
    except (ValueError, TypeError, binascii.Error):
        return None


def _ba_pdf_image_from_file(file_field):
    if not file_field:
        return None
    try:
        if getattr(file_field, "path", ""):
            return ImageReader(file_field.path)
    except Exception:
        pass
    try:
        file_field.open("rb")
        try:
            return ImageReader(BytesIO(file_field.read()))
        finally:
            file_field.close()
    except Exception:
        return None


def _ba_resolve_org_logo_image(org, current_user=None):
    if not org:
        return None
    seen_profile_ids = set()
    profile_candidates = []

    if current_user and getattr(current_user, "is_authenticated", False):
        current_profile = (
            UserProfile.objects
            .filter(user=current_user, organization=org)
            .only("id", "profile_photo")
            .first()
        )
        if current_profile and current_profile.pk:
            profile_candidates.append(current_profile)
            seen_profile_ids.add(int(current_profile.pk))

    admin_profiles = (
        UserProfile.objects
        .filter(organization=org, profile_photo__isnull=False)
        .exclude(profile_photo="")
        .only("id", "profile_photo")
        .order_by("id")[:10]
    )
    for profile in admin_profiles:
        if not profile or not profile.pk:
            continue
        profile_id = int(profile.pk)
        if profile_id in seen_profile_ids:
            continue
        profile_candidates.append(profile)
        seen_profile_ids.add(profile_id)

    for profile in profile_candidates:
        logo_image = _ba_pdf_image_from_file(getattr(profile, "profile_photo", None))
        if logo_image:
            return logo_image

    return None


def _ba_draw_pdf_logo(pdf, image, x, top_y, max_width, max_height):
    if not image:
        return 0
    try:
        image_width, image_height = image.getSize()
    except Exception:
        return 0
    if not image_width or not image_height:
        return 0
    scale = min(max_width / image_width, max_height / image_height)
    draw_width = image_width * scale
    draw_height = image_height * scale
    pdf.drawImage(
        image,
        x,
        top_y - draw_height,
        width=draw_width,
        height=draw_height,
        mask="auto",
        preserveAspectRatio=True,
        anchor="nw",
    )
    return draw_height


def _ba_wrap_pdf_text(pdf, text, max_width, font_name="Helvetica", font_size=9):
    words = str(text or "").split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _ba_get_unicode_pdf_font():
    global _BA_UNICODE_PDF_FONT
    if _BA_UNICODE_PDF_FONT is not None:
        return _BA_UNICODE_PDF_FONT
    font_candidates = [
        ("ArialUnicodeWZ", "/Library/Fonts/Arial Unicode.ttf"),
        ("ArialUnicodeWZ", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        ("TimesNewRomanWZ", "/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
        ("ArialWZ", "/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for font_name, path in font_candidates:
        try:
            pdfmetrics.getFont(font_name)
            _BA_UNICODE_PDF_FONT = font_name
            return _BA_UNICODE_PDF_FONT
        except KeyError:
            pass
        try:
            pdfmetrics.registerFont(TTFont(font_name, path))
            _BA_UNICODE_PDF_FONT = font_name
            return _BA_UNICODE_PDF_FONT
        except Exception:
            continue
    _BA_UNICODE_PDF_FONT = ""
    return _BA_UNICODE_PDF_FONT



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
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
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
    active_membership = (
        OrganizationUser.objects
        .filter(user=user, is_active=True, is_deleted=False)
        .select_related("organization")
        .order_by("-updated_at", "-id")
        .first()
    )
    if active_membership and active_membership.organization:
        return active_membership.organization
    any_membership = (
        OrganizationUser.objects
        .filter(user=user, is_deleted=False)
        .select_related("organization")
        .order_by("-is_active", "-updated_at", "-id")
        .first()
    )
    if any_membership and any_membership.organization:
        return any_membership.organization
    legacy_membership = (
        OrganizationUser.objects
        .filter(user=user)
        .select_related("organization")
        .order_by("-is_active", "is_deleted", "-updated_at", "-id")
        .first()
    )
    if legacy_membership and legacy_membership.organization:
        return legacy_membership.organization
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
    normalized_role = _normalize_admin_role(profile.role)
    return normalized_role in {"company_admin", "org_admin", "owner", "org_user", "superadmin", "super_admin"}


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
    profile_role = _normalize_admin_role(getattr(profile, "role", ""))
    if profile_role in {"company_admin", "org_admin", "owner", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    if not membership:
        return False
    membership_role = _normalize_admin_role(getattr(membership, "role", ""))
    return membership_role in {"company_admin", "org_admin", "owner", "superadmin", "super_admin"}


def _mask_secret(value: str):
    secret = str(value or "").strip()
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}{'*' * max(0, len(secret) - 8)}{secret[-4:]}"


def _normalize_role_access_map(payload):
    raw_map = payload if isinstance(payload, dict) else {}
    normalized = {}
    user_sub_section_keys = ("employee", "clients", "vendors")
    for raw_key, raw_record in raw_map.items():
        key = str(raw_key or "").strip()
        if not key or len(key) > 200:
            continue
        record = raw_record if isinstance(raw_record, dict) else {}
        sections = record.get("sections") if isinstance(record.get("sections"), dict) else {}
        raw_user_sub_sections = (
            record.get("user_sub_sections")
            if isinstance(record.get("user_sub_sections"), dict)
            else {}
        )
        normalized_sections = {}
        for section_key in ROLE_ACCESS_SECTION_KEYS:
            raw_level = str(sections.get(section_key) or "No Access").strip()
            normalized_sections[section_key] = ROLE_ACCESS_LEVEL_ALIASES.get(raw_level, "No Access")
        normalized_user_sub_sections = {}
        for sub_key in user_sub_section_keys:
            raw_sub_record = (
                raw_user_sub_sections.get(sub_key)
                if isinstance(raw_user_sub_sections.get(sub_key), dict)
                else {}
            )
            raw_sub_access_level = str(raw_sub_record.get("access_level") or "No Access").strip()
            access_level = ROLE_ACCESS_LEVEL_ALIASES.get(raw_sub_access_level, "No Access")
            enabled = bool(raw_sub_record.get("enabled")) and access_level != "No Access"
            normalized_user_sub_sections[sub_key] = {
                "enabled": enabled,
                "access_level": access_level if enabled else "No Access",
            }
        normalized[key] = {
            "sections": normalized_sections,
            "user_sub_sections": normalized_user_sub_sections,
            "can_export": bool(record.get("can_export")),
            "can_delete": bool(record.get("can_delete")),
            "attendance_self_service": bool(record.get("attendance_self_service")),
            "remarks": str(record.get("remarks") or "").strip()[:500],
        }
    return normalized


def _crm_resolve_role_access_record(role_access_map, profile_role, employee_role):
    safe_map = role_access_map if isinstance(role_access_map, dict) else {}
    normalized_profile_role = _normalize_admin_role(profile_role)
    normalized_employee_role = _normalize_admin_role(employee_role)
    entries = [(key, value) for key, value in safe_map.items() if isinstance(value, dict)]

    if normalized_employee_role:
        for raw_key, value in entries:
            scope, raw_role = (str(raw_key or "").strip().split(":", 1) + [""])[:2]
            if scope == "employee_role" and _normalize_admin_role(raw_role) == normalized_employee_role:
                return value

    if normalized_profile_role:
        for raw_key, value in entries:
            scope, raw_role = (str(raw_key or "").strip().split(":", 1) + [""])[:2]
            if scope == "system" and _normalize_admin_role(raw_role) == normalized_profile_role:
                return value

    return None


def _crm_section_access_level(user: User, org: Organization, section_key: str = "crm"):
    if _crm_is_admin(user, org):
        return "Full Access"
    if not user or not user.is_authenticated or not org:
        return "No Access"
    settings_obj = OrganizationSettings.objects.filter(organization=org).only("business_autopilot_role_access_map").first()
    role_access_map = _normalize_role_access_map(getattr(settings_obj, "business_autopilot_role_access_map", {}) or {})
    profile = UserProfile.objects.filter(user=user).only("role").first()
    membership = _get_org_membership(user, org)
    role_access_record = _crm_resolve_role_access_record(
        role_access_map,
        getattr(profile, "role", ""),
        getattr(membership, "employee_role", ""),
    )
    if not role_access_record:
        return "No Access"
    sections = role_access_record.get("sections") if isinstance(role_access_record.get("sections"), dict) else {}
    return ROLE_ACCESS_LEVEL_ALIASES.get(str(sections.get(section_key) or "No Access").strip(), "No Access")


def _crm_has_view_access(user: User, org: Organization):
    access_level = _crm_section_access_level(user, org, "crm")
    return access_level in {"View", "View and Edit", "Create, View and Edit", "Full Access"}


def _crm_has_edit_access(user: User, org: Organization):
    access_level = _crm_section_access_level(user, org, "crm")
    return access_level in {"View and Edit", "Create, View and Edit", "Full Access"}


def _crm_has_create_access(user: User, org: Organization):
    access_level = _crm_section_access_level(user, org, "crm")
    return access_level in {"Create, View and Edit", "Full Access"}


def _crm_has_unrestricted_row_access(user: User, org: Organization):
    return _crm_section_access_level(user, org, "crm") in {"View and Edit", "Create, View and Edit", "Full Access"}


def _crm_business_autopilot_permission(user: User):
    if not user or not user.is_authenticated:
        return ""
    product = _get_business_autopilot_product()
    if not product:
        return ""
    access_row = (
        UserProductAccess.objects
        .filter(user=user, product=product)
        .only("permission")
        .first()
    )
    return str(getattr(access_row, "permission", "") or "").strip().lower()


def _crm_has_product_view_access(user: User):
    return _crm_business_autopilot_permission(user) in {
        UserProductAccess.PERMISSION_VIEW,
        UserProductAccess.PERMISSION_EDIT,
        UserProductAccess.PERMISSION_FULL,
    }


def _crm_has_product_edit_access(user: User):
    return _crm_business_autopilot_permission(user) in {
        UserProductAccess.PERMISSION_EDIT,
        UserProductAccess.PERMISSION_FULL,
    }


def _crm_row_matches_user(user: User, row):
    user_ids = set(_crm_clean_user_id_list(getattr(row, "assigned_user_ids", [])))
    user_ids.update(_crm_clean_user_id_list(getattr(row, "owner_user_ids", [])))
    assigned_user_id = getattr(row, "assigned_user_id", None)
    if assigned_user_id:
        user_ids.add(int(assigned_user_id))
    created_by_id = getattr(row, "created_by_id", None)
    if created_by_id:
        user_ids.add(int(created_by_id))
    return bool(user and user.is_authenticated and int(user.id) in user_ids)


def _crm_can_view_row(user: User, org: Organization, row):
    if _crm_is_admin(user, org):
        return True
    if _crm_has_product_view_access(user):
        return True
    if _crm_has_view_access(user, org):
        return True
    return _crm_row_matches_user(user, row)


def _crm_can_edit_row(user: User, org: Organization, row):
    if _crm_is_admin(user, org):
        return True
    if _crm_has_product_edit_access(user):
        return True
    if _crm_has_edit_access(user, org):
        return True
    return _crm_row_matches_user(user, row)


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
        .filter(organization=org, user=user, is_active=True, is_deleted=False)
        .only("id", "role", "department", "employee_role", "is_active", "is_deleted")
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


def _normalize_org_user_taxonomy_assignments(org):
    active_role_names = {
        str(name or "").strip().lower()
        for name in OrganizationEmployeeRole.objects.filter(organization=org, is_active=True).values_list("name", flat=True)
        if str(name or "").strip()
    }
    active_department_names = {
        str(name or "").strip().lower()
        for name in OrganizationDepartment.objects.filter(organization=org, is_active=True).values_list("name", flat=True)
        if str(name or "").strip()
    }
    memberships = list(
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
        .only("id", "employee_role", "department", "updated_at")
    )
    for membership in memberships:
        update_fields = []
        employee_role = str(membership.employee_role or "").strip()
        department = str(membership.department or "").strip()
        if employee_role and employee_role.lower() not in active_role_names:
            membership.employee_role = ""
            update_fields.append("employee_role")
        if department and department.lower() not in active_department_names:
            membership.department = ""
            update_fields.append("department")
        if update_fields:
            membership.save(update_fields=[*update_fields, "updated_at"])


def _serialize_org_users(org, *, include_deleted=False):
    _normalize_org_user_taxonomy_assignments(org)
    _sync_business_autopilot_membership_access(org)
    queryset = (
        OrganizationUser.objects
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES)
        .select_related("user", "user__userprofile")
        .order_by("-id")
    )
    memberships = queryset.filter(is_deleted=bool(include_deleted))
    return [_serialize_org_user_member(org, member) for member in memberships]


def _is_org_admin_account_member(org: Organization, member: OrganizationUser) -> bool:
    if not member:
        return False
    profile_role = _normalize_admin_role(getattr(getattr(member.user, "userprofile", None), "role", ""))
    membership_role = _normalize_admin_role(getattr(member, "role", ""))
    is_owner = bool(getattr(org, "owner_id", None) and member.user_id == org.owner_id)
    return (
        is_owner
        or membership_role == "company_admin"
        or profile_role in DELETE_PROTECTED_PROFILE_ROLES
    )


def _serialize_org_user_member(org: Organization, member: OrganizationUser):
    profile_role = _normalize_admin_role(getattr(getattr(member.user, "userprofile", None), "role", ""))
    is_org_admin_account = _is_org_admin_account_member(org, member)
    return {
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
        "profile_role": profile_role,
        "is_org_admin_account": is_org_admin_account,
        "can_delete": not is_org_admin_account,
        "can_toggle_status": not is_org_admin_account,
        "department": member.department or "",
        "employee_role": member.employee_role or "",
        "is_active": bool(member.is_active and member.user.is_active),
        "is_deleted": bool(member.is_deleted),
        "created_at": member.created_at.isoformat() if member.created_at else "",
        "deleted_at": member.deleted_at.isoformat() if member.deleted_at else "",
    }


def _safe_serialize_org_users(org, *, include_deleted=False):
    try:
        return _serialize_org_users(org, include_deleted=include_deleted)
    except (DatabaseError, OperationalError, IntegrityError):
        logger.exception("Failed to serialize Business Autopilot users for org_id=%s", getattr(org, "id", None))
        return []


def _build_membership_assignment_summary(memberships):
    rows = []
    for membership in memberships:
        display_name = _get_org_user_display_name(getattr(membership, "user", None))
        email = str(getattr(getattr(membership, "user", None), "email", "") or "").strip()
        label = display_name or email or f"User {membership.id}"
        rows.append(
            {
                "membership_id": membership.id,
                "user_id": membership.user_id,
                "name": display_name,
                "email": email,
                "label": label,
            }
        )
    return rows


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
        .filter(organization=org, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
        .select_related("user")
        .order_by("id")
    )


def _compute_org_user_lock_ids(employee_limit, memberships=None, org: Organization = None):
    rows = memberships if isinstance(memberships, list) else []
    safe_limit = max(0, int(employee_limit or 0))
    resolved_org = org if org else None
    protected_ids = []
    regular_rows = []
    for row in rows:
        current_org = resolved_org if resolved_org else getattr(row, "organization", None)
        if current_org and _is_org_admin_account_member(current_org, row):
            protected_ids.append(row.id)
        else:
            regular_rows.append(row)
    remaining_capacity = max(0, safe_limit - len(protected_ids))
    unlocked_ids = [*protected_ids, *[row.id for row in regular_rows[:remaining_capacity]]]
    locked_ids = [row.id for row in regular_rows[remaining_capacity:]]
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
    lock_state = _compute_org_user_lock_ids(employee_limit, memberships=memberships, org=org)
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


def _build_org_users_response_payload(org, can_manage_users, *, created_user_credentials=None, credential_delivery=None, message=""):
    users = _safe_serialize_org_users(org)
    deleted_users = _safe_serialize_org_users(org, include_deleted=True)
    meta = _build_org_user_meta(org, users=users)
    lock_state = _compute_org_user_lock_ids(
        meta.get("employee_limit"),
        memberships=_list_org_user_memberships(org),
        org=org,
    )
    users = _attach_locked_state(users, lock_state["locked_ids"])
    return {
        "authenticated": True,
        "organization_id": getattr(org, "id", None),
        "users": users,
        "deleted_users": deleted_users,
        "employee_roles": _safe_serialize_employee_roles(org),
        "departments": _safe_serialize_departments(org),
        "can_manage_users": can_manage_users,
        "meta": meta,
        "created_user_credentials": created_user_credentials,
        "credential_delivery": credential_delivery,
        "message": message,
    }


def _sync_org_users_to_plan_limit(org, requested_by=None):
    memberships = _list_org_user_memberships(org)
    if not memberships:
        return {"auto_disabled_ids": [], "auto_enabled_ids": []}

    meta = _build_org_user_meta(org, users=None)
    lock_state = _compute_org_user_lock_ids(meta.get("employee_limit"), memberships=memberships, org=org)
    locked_ids = lock_state["locked_ids"]
    auto_disabled = []
    auto_enabled = []

    # ORG admin account must always remain active.
    for row in memberships:
        if _is_org_admin_account_member(org, row) and not row.is_active:
            row.is_active = True
            row.save(update_fields=["is_active", "updated_at"])
            _grant_business_autopilot_access(row.user, requested_by or row.user, row.role or "company_admin")
            auto_enabled.append(row.id)

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


def _format_indian_currency_value(value, default="0.00"):
    normalized = _decimal_to_string(value, default)
    sign = ""
    if normalized.startswith("-"):
        sign = "-"
        normalized = normalized[1:]
    integer_part, _, decimal_part = normalized.partition(".")
    if len(integer_part) > 3:
        last_three = integer_part[-3:]
        remaining = integer_part[:-3]
        grouped_parts = []
        while len(remaining) > 2:
            grouped_parts.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            grouped_parts.insert(0, remaining)
        integer_part = ",".join(grouped_parts + [last_three])
    return f"{sign}{integer_part}.{decimal_part or '00'}"


def _format_pdf_inr(value, default="0.00"):
    return f"INR {_format_indian_currency_value(value, default)}"


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


def _default_india_gst_templates():
    return [
        {
            "id": "gst_default_india_igst",
            "name": "IGST",
            "taxScope": "Inter State",
            "cgst": "",
            "sgst": "",
            "igst": "18",
            "cess": "",
            "status": "Active",
            "notes": "",
        },
        {
            "id": "gst_default_india_cgst_sgst",
            "name": "CGST & SGST",
            "taxScope": "Intra State",
            "cgst": "9",
            "sgst": "9",
            "igst": "",
            "cess": "",
            "status": "Active",
            "notes": "",
        },
    ]


def _normalize_gst_template_text(value):
    return " ".join(str(value or "").strip().lower().split())


def _normalize_gst_template_number(value):
    return str(value or "").strip()


def _looks_like_legacy_india_gst_template(template):
    if not isinstance(template, dict):
        return False
    template_id = _normalize_gst_template_text(template.get("id"))
    template_name = _normalize_gst_template_text(template.get("name"))
    template_scope = _normalize_gst_template_text(template.get("taxScope") or template.get("scope"))
    cgst = _normalize_gst_template_number(template.get("cgst"))
    sgst = _normalize_gst_template_number(template.get("sgst"))
    igst = _normalize_gst_template_number(template.get("igst"))
    cess = _normalize_gst_template_number(template.get("cess"))

    if template_id in {
        "gst_india_igst",
        "gst_india_cgst_sgst",
        "gst_default_india_igst",
        "gst_default_india_cgst_sgst",
    }:
        return True

    if template_name in {"india gst", "igst", "cgst & sgst"} and template_scope in {"inter state", "intra state"}:
        return True

    return (
        template_name == "india gst"
        and cgst in {"9", "9.0"}
        and sgst in {"9", "9.0"}
        and igst in {"18", "18.0"}
        and cess in {"0", "0.0", ""}
    )


def _normalize_india_gst_templates(templates):
    canonical = _default_india_gst_templates()
    if not isinstance(templates, list):
        return canonical

    normalized = []
    for row in templates:
        row_id = _normalize_gst_template_text(row.get("id")) if isinstance(row, dict) else ""
        if row_id in {
            "gst_default_india_igst",
            "gst_default_india_cgst_sgst",
        } or _looks_like_legacy_india_gst_template(row):
            continue
        if isinstance(row, dict):
            normalized.append(row)

    return [*canonical, *normalized]


def _seed_accounts_workspace_defaults_for_org(payload, org):
    base = _normalize_accounts_workspace(payload)
    billing_profile = BillingProfile.objects.filter(organization=org).only("country").first()
    country = str(
        (getattr(billing_profile, "country", "") or getattr(org, "country", "") or "India")
    ).strip().lower()
    if country == "india":
        base["gstTemplates"] = _normalize_india_gst_templates(base.get("gstTemplates") or [])
    return base


def _ensure_accounts_workspace_defaults_for_org(org):
    workspace = AccountsWorkspace.objects.filter(organization=org).first()
    billing_profile = BillingProfile.objects.filter(organization=org).only("country").first()
    country = str(
        (getattr(billing_profile, "country", "") or getattr(org, "country", "") or "India")
    ).strip().lower()
    if not workspace:
        if country != "india":
            return None
        workspace = AccountsWorkspace.objects.create(
            organization=org,
            data=_default_accounts_workspace(),
        )
    seeded_data = _seed_accounts_workspace_defaults_for_org(workspace.data, org)
    if workspace.data != seeded_data:
        workspace.data = seeded_data
        workspace.save(update_fields=["data", "updated_at"])
    return workspace


def _normalize_accounts_workspace(payload):
    base = _default_accounts_workspace()
    if not isinstance(payload, dict):
        return base
    for key in ACCOUNTS_ALLOWED_ROOT_KEYS:
        value = payload.get(key)
        base[key] = value if isinstance(value, list) else []
    return base


def _merge_accounts_workspace(existing_payload, incoming_payload):
    existing = _normalize_accounts_workspace(existing_payload)
    if not isinstance(incoming_payload, dict):
        return existing
    merged = dict(existing)
    for key in ACCOUNTS_ALLOWED_ROOT_KEYS:
        if key not in incoming_payload:
            continue
        value = incoming_payload.get(key)
        if isinstance(value, list):
            merged[key] = value
    return _normalize_accounts_workspace(merged)


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


def _get_accounts_customer_display_name(row):
    company_name = str(row.get("companyName") or row.get("name") or "").strip()
    client_name = str(row.get("clientName") or "").strip()
    if company_name and client_name:
        return f"{company_name} / {client_name}"
    return company_name or client_name


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
        customer_name = _get_accounts_customer_display_name(row)
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
    workspace, created = AccountsWorkspace.objects.get_or_create(
        organization=org,
        defaults={"data": _default_accounts_workspace()},
    )
    original_data = workspace.data
    seeded_data = _seed_accounts_workspace_defaults_for_org(workspace.data, org)
    workspace.data = seeded_data
    if created or original_data != seeded_data:
        workspace.save(update_fields=["data", "updated_at"])
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


_LEGACY_AUTO_TAX_VALUES = {"0", "0.0", "0.00", "0.000"}
_GST_TEMPLATE_ID_ALIASES = {
    "gst_default_india_igst": "gst_default_india_igst",
    "gst_default_india_cgst_sgst": "gst_default_india_cgst_sgst",
    "gst_india_igst": "gst_default_india_igst",
    "gst_india_cgst_sgst": "gst_default_india_cgst_sgst",
}


def _document_template_components(gst_template):
    if not isinstance(gst_template, dict):
        return {
            "cgst": Decimal("0"),
            "sgst": Decimal("0"),
            "igst": Decimal("0"),
            "cess": Decimal("0"),
        }
    return {
        "cgst": _to_decimal(gst_template.get("cgst")),
        "sgst": _to_decimal(gst_template.get("sgst")),
        "igst": _to_decimal(gst_template.get("igst")),
        "cess": _to_decimal(gst_template.get("cess")),
    }


def _document_template_total_percent(gst_template):
    return sum(_document_template_components(gst_template).values(), Decimal("0"))


def _resolve_gst_template_by_id(gst_templates_by_id, template_id):
    raw_template_id = str(template_id or "").strip()
    if not raw_template_id:
        return None
    normalized_template_id = raw_template_id.lower().replace("-", "_").replace(" ", "_")
    canonical_template_id = _GST_TEMPLATE_ID_ALIASES.get(normalized_template_id, normalized_template_id)
    candidate_ids = []
    for value in (raw_template_id, normalized_template_id, canonical_template_id):
        if value and value not in candidate_ids:
            candidate_ids.append(value)
    if "cgst" in normalized_template_id and "sgst" in normalized_template_id:
        inferred = "gst_default_india_cgst_sgst"
        if inferred not in candidate_ids:
            candidate_ids.append(inferred)
    elif "igst" in normalized_template_id:
        inferred = "gst_default_india_igst"
        if inferred not in candidate_ids:
            candidate_ids.append(inferred)

    if isinstance(gst_templates_by_id, dict):
        for candidate_id in candidate_ids:
            direct = gst_templates_by_id.get(candidate_id)
            if isinstance(direct, dict):
                return direct

    for default_template in _default_india_gst_templates():
        default_template_id = str(default_template.get("id") or "").strip()
        if default_template_id in candidate_ids:
            return default_template

    return None


def _resolve_document_line_tax_override(row):
    if not isinstance(row, dict):
        return {
            "has_override": False,
            "tax_percent": Decimal("0"),
            "tax_percent_source": "auto",
        }

    raw_tax_value = row.get("taxPercent")
    if raw_tax_value is None:
        raw_tax_value = row.get("tax_percent")
    raw_tax_percent = str(raw_tax_value if raw_tax_value is not None else "").strip()
    raw_tax_source = row.get("taxPercentSource")
    if raw_tax_source is None:
        raw_tax_source = row.get("tax_percent_source")
    tax_source = str(raw_tax_source or "").strip().lower()

    if tax_source == "manual":
        has_override = bool(raw_tax_percent)
        return {
            "has_override": has_override,
            "tax_percent": _to_decimal(raw_tax_percent),
            "tax_percent_source": "manual" if has_override else "auto",
        }

    if tax_source in {"auto", "template"}:
        return {
            "has_override": False,
            "tax_percent": Decimal("0"),
            "tax_percent_source": "auto",
        }

    if (not raw_tax_percent) or (raw_tax_percent in _LEGACY_AUTO_TAX_VALUES):
        return {
            "has_override": False,
            "tax_percent": Decimal("0"),
            "tax_percent_source": "auto",
        }

    return {
        "has_override": True,
        "tax_percent": _to_decimal(raw_tax_percent),
        "tax_percent_source": "manual",
    }


def _document_totals(document, gst_templates_by_id):
    items = document.get("items") if isinstance(document, dict) else []
    if not isinstance(items, list):
        items = []
    gst_template_id = (
        str((document or {}).get("gstTemplateId") or (document or {}).get("gst_template_id") or "").strip()
        if isinstance(document, dict)
        else ""
    )
    gst_template = _resolve_gst_template_by_id(gst_templates_by_id, gst_template_id)
    template_components = _document_template_components(gst_template)
    default_tax = _document_template_total_percent(gst_template)
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    tax_breakdown = {
        "cgst": Decimal("0"),
        "sgst": Decimal("0"),
        "igst": Decimal("0"),
        "cess": Decimal("0"),
    }
    for row in items:
        if not isinstance(row, dict):
            continue
        qty = _to_decimal(row.get("qty"))
        rate = _to_decimal(row.get("rate"))
        line_total = qty * rate
        tax_override = _resolve_document_line_tax_override(row)
        tax_pct = tax_override["tax_percent"] if tax_override["has_override"] else default_tax
        component_total = sum(template_components.values(), Decimal("0"))
        if component_total > 0:
            effective_components = {
                key: (tax_pct * value) / component_total
                for key, value in template_components.items()
            }
        else:
            effective_components = {
                "cgst": Decimal("0"),
                "sgst": Decimal("0"),
                "igst": tax_pct,
                "cess": Decimal("0"),
            }
        subtotal += line_total
        tax_total += (line_total * tax_pct) / Decimal("100")
        for key, value in effective_components.items():
            tax_breakdown[key] += (line_total * value) / Decimal("100")
    breakdown_percent = {
        key: ((value / subtotal) * Decimal("100")) if subtotal > 0 else Decimal("0")
        for key, value in tax_breakdown.items()
    }
    return {
        "subtotal": float(subtotal),
        "tax_total": float(tax_total),
        "grand_total": float(subtotal + tax_total),
        "tax_breakdown": {key: float(value) for key, value in tax_breakdown.items()},
        "breakdown_percent": {key: float(value) for key, value in breakdown_percent.items()},
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
        existing_user = User.objects.filter(email__iexact=email).first()
        if not name or not email:
            return JsonResponse({"detail": "name_email_required"}, status=400)
        if not existing_user and not password:
            return JsonResponse({"detail": "password_required"}, status=400)
        if password and len(password) < 6:
            return JsonResponse({"detail": "password_too_short"}, status=400)

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
                    "is_deleted": False,
                    "deleted_at": None,
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
    payload = _build_org_users_response_payload(
        org,
        can_manage_users,
        created_user_credentials=created_user_credentials,
        credential_delivery=credential_delivery,
    )
    payload["organization"] = {
        "id": org.id,
        "name": org.name,
        "company_key": org.company_key,
    }
    return JsonResponse(payload)


@require_http_methods(["GET"])
def org_user_email_check(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "available": False}, status=404)

    can_manage_users = _can_manage_users(request.user, org)
    if not can_manage_users:
        return JsonResponse({"detail": "forbidden"}, status=403)

    email = str(request.GET.get("email") or "").strip().lower()
    if not email:
        return JsonResponse({"ok": False, "available": False, "message": "Email is required."}, status=400)
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return JsonResponse({"ok": False, "available": False, "message": "Enter a valid email."}, status=400)

    existing_user = User.objects.filter(email__iexact=email).first()
    if not existing_user:
        return JsonResponse(
            {
                "ok": True,
                "available": True,
                "existing_user": False,
                "same_password_allowed": False,
                "password_required": True,
                "message": "Email is available.",
            }
        )

    existing_profile = UserProfile.objects.filter(user=existing_user).first()
    if existing_profile and existing_profile.organization_id and existing_profile.organization_id != org.id:
        return JsonResponse(
            {
                "ok": True,
                "available": False,
                "existing_user": True,
                "same_password_allowed": False,
                "password_required": False,
                "belongs_to_another_organization": True,
                "message": "This email is already assigned to another organization.",
            },
            status=409,
        )

    existing_products = _get_user_granted_products(existing_user)
    already_has_business_autopilot = any(
        product["slug"] == BUSINESS_AUTOPILOT_PRODUCT_SLUG for product in existing_products
    )
    if already_has_business_autopilot:
        return JsonResponse(
            {
                "ok": True,
                "available": False,
                "existing_user": True,
                "same_password_allowed": True,
                "password_required": False,
                "already_assigned_to_business_autopilot": True,
                "existing_products": existing_products,
                "message": "This user is already created in Business Autopilot.",
            },
            status=409,
        )

    return JsonResponse(
        {
            "ok": True,
            "available": False,
            "existing_user": True,
            "same_password_allowed": True,
            "password_required": False,
            "existing_products": existing_products,
            "message": "This user is already created in another product. The same password will continue to work.",
        }
    )


@require_http_methods(["PUT", "DELETE", "POST"])
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

    payload = {}
    resolved_method = request.method
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        action = str(payload.get("action") or "").strip().lower()
        if action == "restore":
            resolved_method = "RESTORE"
        elif action in {"delete", "remove"}:
            resolved_method = "DELETE"
        elif action in {"update", "edit", "save"} or any(
            key in payload
            for key in {
                "first_name",
                "last_name",
                "name",
                "email",
                "password",
                "phone_number",
                "role",
                "department",
                "department_id",
                "employee_role",
                "employee_role_id",
                "is_active",
            }
        ):
            resolved_method = "PUT"
        else:
            return JsonResponse({"detail": "invalid_action"}, status=400)

    if resolved_method == "DELETE":
        if _is_org_admin_account_member(org, membership):
            return JsonResponse(
                {
                    "detail": "org_admin_delete_forbidden",
                    "message": "ORG admin account cannot be deleted from Users.",
                },
                status=403,
            )
        permanent = str(request.GET.get("permanent") or "").strip().lower() in {"1", "true", "yes"}
        if request.method == "POST":
            permanent_raw = str(payload.get("permanent") or "").strip().lower()
            permanent = permanent or permanent_raw in {"1", "true", "yes"}
        if membership.is_deleted and not permanent:
            return JsonResponse({"detail": "user_already_deleted"}, status=400)
        linked_leads = _crm_collect_leads_linked_to_user(org, membership.user_id)
        linked_deals = _crm_collect_deals_linked_to_user(org, membership.user_id)
        _revoke_business_autopilot_access(membership.user)
        if permanent:
            membership.delete()
            message = "User permanently deleted."
        else:
            membership.is_deleted = True
            membership.is_active = False
            membership.deleted_at = timezone.now()
            membership.save(update_fields=["is_deleted", "is_active", "deleted_at", "updated_at"])
            message = "User moved to deleted items."
        _sync_org_users_to_plan_limit(org, requested_by=request.user)
        payload = _build_org_users_response_payload(org, can_manage_users, message=message)
        payload["affected_leads"] = [_serialize_crm_lead(row) for row in linked_leads]
        payload["affected_deals"] = [_serialize_crm_deal(row) for row in linked_deals]
        payload["linked_records_message"] = (
            f"{len(linked_leads)} lead(s) and {len(linked_deals)} deal(s) were linked to this user."
            if linked_leads or linked_deals
            else ""
        )
        return JsonResponse(payload)

    if resolved_method == "RESTORE":
        if not membership.is_deleted:
            return JsonResponse({"detail": "user_not_deleted"}, status=400)
        _sync_org_users_to_plan_limit(org, requested_by=request.user)
        preview_meta = _build_org_user_meta(org, users=None)
        if not preview_meta.get("can_add_users"):
            return JsonResponse(
                {
                    "detail": "employee_limit_reached",
                    "message": preview_meta.get("limit_message") or "User limit reached. Add-on users required to restore this user.",
                    "meta": preview_meta,
                },
                status=403,
            )
        membership.is_deleted = False
        membership.deleted_at = None
        membership.is_active = True
        membership.save(update_fields=["is_deleted", "deleted_at", "is_active", "updated_at"])
        _sync_org_users_to_plan_limit(org, requested_by=request.user)
        membership.refresh_from_db()
        if membership.is_active:
            _grant_business_autopilot_access(membership.user, request.user, membership.role or "org_user")
        return JsonResponse(_build_org_users_response_payload(org, can_manage_users, message="User restored successfully."))

    if request.method != "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
    if membership.is_deleted:
        return JsonResponse({"detail": "user_not_found"}, status=404)

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
                org=org,
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
            if not is_active and _is_org_admin_account_member(org, membership):
                return JsonResponse(
                    {
                        "detail": "org_admin_deactivate_forbidden",
                        "message": "ORG admin account cannot be deactivated.",
                    },
                    status=403,
                )
            membership.is_active = is_active
        elif _is_org_admin_account_member(org, membership):
            membership.is_active = True
        membership.save(update_fields=["role", "department", "employee_role", "is_active", "updated_at"])
        if membership.is_active:
            _grant_business_autopilot_access(membership.user, request.user, role)
        else:
            _revoke_business_autopilot_access(membership.user)

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    return JsonResponse(_build_org_users_response_payload(org, can_manage_users))


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

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id, is_deleted=False).select_related("user").first()
    if not membership or not membership.user:
        return JsonResponse({"detail": "user_not_found"}, status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    enabled = payload.get("enabled")
    if not isinstance(enabled, bool):
        return JsonResponse({"detail": "enabled_required"}, status=400)
    if not enabled and _is_org_admin_account_member(org, membership):
        return JsonResponse(
            {
                "detail": "org_admin_deactivate_forbidden",
                "message": "ORG admin account cannot be deactivated.",
            },
            status=403,
        )

    _sync_org_users_to_plan_limit(org, requested_by=request.user)
    if enabled and not membership.is_active:
        preview_meta = _build_org_user_meta(org, users=None)
        preview_lock_state = _compute_org_user_lock_ids(
            preview_meta.get("employee_limit"),
            memberships=_list_org_user_memberships(org),
            org=org,
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
    lock_state = _compute_org_user_lock_ids(
        meta.get("employee_limit"),
        memberships=_list_org_user_memberships(org),
        org=org,
    )
    users = _attach_locked_state(users, lock_state["locked_ids"])
    message = "User activated." if enabled else "User deactivated."

    return JsonResponse(
        {
            "authenticated": True,
            "organization_id": getattr(org, "id", None),
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

    membership = OrganizationUser.objects.filter(organization=org, id=membership_id, is_deleted=False).select_related("user").first()
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
    lock_state = _compute_org_user_lock_ids(
        meta.get("employee_limit"),
        memberships=_list_org_user_memberships(org),
        org=org,
    )
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
        role_access_blob = str(payload.get("role_access_blob") or "").strip()
        if role_access_blob:
            try:
                decoded = base64.b64decode(role_access_blob.encode("ascii"), validate=True).decode("utf-8")
                role_access_map = json.loads(decoded or "{}")
            except (ValueError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError):
                return JsonResponse({"detail": "invalid_role_access_blob"}, status=400)
        else:
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


@require_http_methods(["PUT", "DELETE", "POST"])
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

    assigned_memberships = list(
        OrganizationUser.objects
        .filter(organization=org, employee_role__iexact=role.name, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
        .select_related("user")
        .order_by("id")
    )
    affected_users = _build_membership_assignment_summary(assigned_memberships)

    payload = {}
    resolved_method = request.method
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        action = str(payload.get("action") or "").strip().lower()
        if action in {"delete", "remove"}:
            resolved_method = "DELETE"
        elif action in {"update", "edit", "save"} or "name" in payload:
            resolved_method = "PUT"
        else:
            return JsonResponse({"detail": "invalid_action"}, status=400)

    if resolved_method == "PUT":
        if request.method != "POST":
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
            if assigned_memberships:
                for membership in assigned_memberships:
                    if membership.employee_role:
                        membership.employee_role = ""
                        membership.save(update_fields=["employee_role", "updated_at"])
            role.is_active = False
            role.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "employee_roles": _serialize_employee_roles(org),
            "departments": _serialize_departments(org),
            "users": _safe_serialize_org_users(org),
            "can_manage_users": _can_manage_users(request.user, org),
            "affected_users": affected_users,
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


@require_http_methods(["PUT", "DELETE", "POST"])
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

    assigned_memberships = list(
        OrganizationUser.objects
        .filter(organization=org, department__iexact=department.name, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
        .select_related("user")
        .order_by("id")
    )
    affected_users = _build_membership_assignment_summary(assigned_memberships)

    payload = {}
    resolved_method = request.method
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        action = str(payload.get("action") or "").strip().lower()
        if action in {"delete", "remove"}:
            resolved_method = "DELETE"
        elif action in {"update", "edit", "save"} or "name" in payload:
            resolved_method = "PUT"
        else:
            return JsonResponse({"detail": "invalid_action"}, status=400)

    if resolved_method == "PUT":
        if request.method != "POST":
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        name = (payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        previous_name = str(department.name or "").strip()
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
        if previous_name and previous_name.lower() != name.lower():
            OrganizationUser.objects.filter(
                organization=org,
                department__iexact=previous_name,
                role__in=ERP_EMPLOYEE_ROLES,
            ).update(department=name, updated_at=timezone.now())
    else:
        if department.is_active:
            if assigned_memberships:
                for membership in assigned_memberships:
                    if membership.department:
                        membership.department = ""
                        membership.save(update_fields=["department", "updated_at"])
            department.is_active = False
            department.save(update_fields=["is_active", "updated_at"])

    return JsonResponse(
        {
            "authenticated": True,
            "departments": _serialize_departments(org),
            "employee_roles": _serialize_employee_roles(org),
            "users": _safe_serialize_org_users(org),
            "can_manage_users": _can_manage_users(request.user, org),
            "affected_users": affected_users,
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
        .filter(organization=org, is_active=True, user__is_active=True, role__in=ERP_EMPLOYEE_ROLES, is_deleted=False)
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


@require_http_methods(["GET", "PUT", "POST"])
def accounts_workspace(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"authenticated": True, "organization": None, "data": _default_accounts_workspace()})

    workspace = _get_accounts_workspace(org)
    billing_profile = BillingProfile.objects.filter(organization=org).only("country").first()

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PUT", "PATCH", "UPDATE"}:
            resolved_method = "PUT"
        elif override_method == "PUT":
            resolved_method = "PUT"

    if resolved_method == "PUT":
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        data = _merge_accounts_workspace(workspace.data, payload.get("data"))
        data = _seed_accounts_workspace_defaults_for_org(data, org)
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
            "organization_profile": _serialize_org_payroll_profile(org),
            "billing_country": str(getattr(billing_profile, "country", "") or "").strip(),
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
        customer_name = _get_accounts_customer_display_name(row)
        if not customer_name:
            continue
        company_name = str(row.get("companyName") or row.get("name") or "").strip()
        client_name = str(row.get("clientName") or "").strip()
        phone_country_code = str(row.get("phoneCountryCode") or row.get("phone_country_code") or "+91").strip() or "+91"
        phone = str(row.get("phone") or "").strip()
        additional_phones = row.get("additionalPhones") if isinstance(row.get("additionalPhones"), list) else []
        phone_list = row.get("phoneList") if isinstance(row.get("phoneList"), list) else additional_phones
        email = str(row.get("email") or "").strip()
        additional_emails = row.get("additionalEmails") if isinstance(row.get("additionalEmails"), list) else []
        email_list = row.get("emailList") if isinstance(row.get("emailList"), list) else additional_emails
        billing_country = str(row.get("billingCountry") or row.get("country") or "").strip()
        billing_state = str(row.get("billingState") or row.get("state") or "").strip()
        billing_pincode = str(row.get("billingPincode") or row.get("pincode") or "").strip()
        shipping_country = str(row.get("shippingCountry") or row.get("country") or "").strip()
        shipping_state = str(row.get("shippingState") or row.get("state") or "").strip()
        shipping_pincode = str(row.get("shippingPincode") or row.get("pincode") or "").strip()
        options.append({
            "id": customer_id,
            "name": customer_name,
            "displayName": customer_name,
            "companyName": company_name,
            "clientName": client_name,
            "phoneCountryCode": phone_country_code,
            "phone": phone,
            "phoneList": phone_list,
            "additionalPhones": additional_phones,
            "email": email,
            "emailList": email_list,
            "additionalEmails": additional_emails,
            "billingCountry": billing_country,
            "billingState": billing_state,
            "billingPincode": billing_pincode,
            "shippingCountry": shipping_country,
            "shippingState": shipping_state,
            "shippingPincode": shipping_pincode,
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

    next_billing_date = _calculate_next_billing_date(start_date) if start_date else None

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
        if start_date is not None:
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

        row.next_billing_date = _calculate_next_billing_date(row.start_date) if row.start_date else None
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
    doc_type_aliases = {
        "estimate": "estimate",
        "invoice": "invoice",
        "salesorder": "sales_order",
        "sales-order": "sales_order",
        "sales_order": "sales_order",
        "sales order": "sales_order",
    }
    normalized_doc_type = doc_type_aliases.get(normalized_doc_type, normalized_doc_type)
    if normalized_doc_type not in {"estimate", "invoice", "sales_order"}:
        return JsonResponse({"detail": "invalid_doc_type"}, status=400)

    workspace = _get_accounts_workspace(org)
    data = _normalize_accounts_workspace(workspace.data)
    if normalized_doc_type == "sales_order":
        sales_order = (
            CrmSalesOrder.objects
            .filter(organization=org, id=doc_id, is_deleted=False)
            .select_related("deal")
            .first()
        )
        if not sales_order:
            return JsonResponse({"detail": "document_not_found"}, status=404)
        payload = _serialize_crm_sales_order(sales_order)
        document = {
            "id": sales_order.id,
            "docNo": sales_order.order_id,
            "customerName": payload.get("company") or payload.get("customer_name") or "-",
            "customerGstin": payload.get("customer_gstin") or "",
            "billingAddress": payload.get("billing_address") or "",
            "issueDate": payload.get("issue_date") or "",
            "dueDate": payload.get("due_date") or "",
            "status": "",
            "gstTemplateId": payload.get("gst_template_id") or "",
            "billingTemplateId": payload.get("billing_template_id") or "",
            "items": payload.get("items") or [],
            "notes": payload.get("notes") or "",
            "termsText": payload.get("terms_text") or "",
            "paymentStatusNotes": payload.get("payment_status_notes") or "",
            "paymentStatus": payload.get("payment_status") or sales_order.payment_status or "pending",
            "paidAmount": payload.get("paid_amount") if payload.get("paid_amount") is not None else sales_order.paid_amount,
            "paymentMode": payload.get("payment_mode") or sales_order.payment_mode or "",
            "paymentDate": payload.get("payment_date") or (sales_order.payment_date.isoformat() if sales_order.payment_date else ""),
            "transactionId": payload.get("transaction_id") or sales_order.transaction_id or "",
            "balanceAmount": payload.get("balance_amount") if payload.get("balance_amount") is not None else float(max(Decimal("0"), (sales_order.total_amount or Decimal("0")) - Decimal(str(sales_order.paid_amount or 0)))),
            "salesperson": payload.get("salesperson") or "",
            "sourceDealId": payload.get("source_deal_id") or "",
            "subtotal": payload.get("subtotal") or 0,
            "taxTotal": payload.get("tax_total") or 0,
            "grandTotal": payload.get("grand_total") or 0,
        }
    else:
        list_key = "estimates" if normalized_doc_type == "estimate" else "invoices"
        document = next((row for row in data.get(list_key, []) if str(row.get("id")) == str(doc_id)), None)
    if not document:
        return JsonResponse({"detail": "document_not_found"}, status=404)

    gst_templates = {str(row.get("id")): row for row in data.get("gstTemplates", []) if isinstance(row, dict)}
    billing_templates = {str(row.get("id")): row for row in data.get("billingTemplates", []) if isinstance(row, dict)}
    totals = _document_totals(document, gst_templates)
    gst_template = _resolve_gst_template_by_id(gst_templates, str(document.get("gstTemplateId") or ""))
    billing_template = billing_templates.get(str(document.get("billingTemplateId") or ""))
    org_billing_profile = (
        BillingProfile.objects
        .filter(organization=org)
        .only("company_name", "address_line1", "address_line2", "city", "state", "country", "gstin")
        .first()
    )
    items = document.get("items") if isinstance(document.get("items"), list) else []
    gst_template_default_tax = _document_template_total_percent(gst_template)

    line_rows = []
    for row in items:
        if not isinstance(row, dict):
            continue
        qty = _to_decimal(row.get("qty"))
        rate = _to_decimal(row.get("rate"))
        amount = qty * rate
        raw_description = str(row.get("description") or "").replace("\r\n", "\n")
        raw_custom_text = str(row.get("customText") or "").strip()
        if raw_custom_text:
            description_main = raw_description.strip()
            description_custom = raw_custom_text
        else:
            first_line, _, remaining = raw_description.partition("\n")
            description_main = first_line.strip()
            description_custom = remaining.strip()
        line_tax_override = _resolve_document_line_tax_override(row)
        line_tax_percent = line_tax_override["tax_percent"] if line_tax_override["has_override"] else gst_template_default_tax
        line_rows.append(
            {
                "description": description_main,
                "description_custom": description_custom,
                "hsn_sac_type": str(row.get("hsnSacType") or row.get("hsn_sac_type") or "").strip(),
                "hsn_sac_code": str(row.get("hsnSacCode") or row.get("hsnCode") or row.get("sacCode") or "").strip(),
                "qty": str(row.get("qty") or ""),
                "rate": float(rate),
                "tax_percent": float(line_tax_percent),
                "amount": float(amount),
            }
        )

    paid_amount_value = _to_decimal(document.get("paidAmount"))
    balance_amount_value = max(Decimal("0"), _to_decimal(totals.get("grand_total")) - paid_amount_value)

    context = {
        "org": org,
        "doc_type": normalized_doc_type,
        "doc_type_label": "Estimate" if normalized_doc_type == "estimate" else "Sales Order" if normalized_doc_type == "sales_order" else "Invoice",
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
        "theme_color": (billing_template or {}).get("themeColor") or "#22c55e",
        "company_logo_data_url": (billing_template or {}).get("companyLogoDataUrl") or "",
        "payment_status": str(document.get("paymentStatus") or "Pending").strip().title() or "Pending",
        "paid_amount": float(paid_amount_value),
        "balance_amount": float(balance_amount_value),
        "payment_mode": str(document.get("paymentMode") or "").strip(),
        "payment_date": str(document.get("paymentDate") or "").strip(),
        "transaction_id": str(document.get("transactionId") or "").strip(),
        "has_payment": paid_amount_value > 0,
    }
    if str(request.GET.get("format") or "").strip().lower() == "pdf":
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        left = 18 * mm
        right = width - 18 * mm
        top = height - 20 * mm
        logo_image = _ba_pdf_image_from_data_url(context["company_logo_data_url"])
        if not logo_image:
            logo_image = _ba_resolve_org_logo_image(org, request.user)
        money_font = _ba_get_unicode_pdf_font() or "Helvetica"
        tax_breakdown = totals.get("tax_breakdown") or {}
        breakdown_percent = totals.get("breakdown_percent") or {}
        gst_breakdown = []
        for key, label in (("cgst", "CGST"), ("sgst", "SGST"), ("igst", "IGST"), ("cess", "CESS")):
            amount = _to_decimal(tax_breakdown.get(key))
            if amount > 0:
                gst_breakdown.append((label, float(breakdown_percent.get(key) or 0), amount))

        pdf.setTitle(f"{context['doc_type_label']} {document.get('docNo') or doc_id}")
        pdf.setFillColorRGB(0, 0, 0)
        logo_height = _ba_draw_pdf_logo(pdf, logo_image, left, top + 1 * mm, 24 * mm, 14 * mm)
        right_section_x = right
        seller_x = left
        seller_header_y = top - (logo_height + 3 * mm if logo_height else 0)
        org_company_name = str(getattr(org_billing_profile, "company_name", "") or "").strip()
        seller_heading = org_company_name or str(org.name or "Organization")
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(seller_x, seller_header_y, seller_heading)
        pdf.setFont("Helvetica", 9)
        seller_lines = []
        org_address_line1 = str(getattr(org_billing_profile, "address_line1", "") or "").strip()
        org_address_line2 = str(getattr(org_billing_profile, "address_line2", "") or "").strip()
        org_city = str(getattr(org_billing_profile, "city", "") or "").strip()
        org_state = str(getattr(org_billing_profile, "state", "") or "").strip()
        org_country = str(getattr(org_billing_profile, "country", "") or "").strip()
        org_city_line = ", ".join([value for value in [org_city, org_state] if value])
        if org_address_line1:
            seller_lines.append(org_address_line1)
        if org_address_line2:
            seller_lines.append(org_address_line2)
        if org_city_line:
            seller_lines.append(org_city_line)
        elif org_country:
            seller_lines.append(org_country)
        seller_y = seller_header_y - 8 * mm
        for line in seller_lines[:3]:
            pdf.drawString(seller_x, seller_y, str(line))
            seller_y -= 4 * mm

        invoice_meta_y = top - 2 * mm
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawRightString(right_section_x, invoice_meta_y, context["doc_type_label"].upper())
        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(right_section_x, invoice_meta_y - 6 * mm, f"# {document.get('docNo') or '-'}")
        pdf.drawRightString(right_section_x, invoice_meta_y - 10 * mm, f"Date {document.get('issueDate') or '-'}")
        pdf.setFont(money_font, 9)
        pdf.drawRightString(right_section_x, invoice_meta_y - 14 * mm, f"Amount {_format_pdf_inr(totals.get('grand_total') or '0')}")
        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(right_section_x, invoice_meta_y - 18 * mm, f"Customer : {document.get('customerName') or '-'}")

        billing_address_lines = [line for line in str(document.get("billingAddress") or "").splitlines() if str(line).strip()]
        right_section_bottom = invoice_meta_y - 18 * mm
        left_section_bottom = seller_y if seller_lines else seller_header_y
        billed_y = min(left_section_bottom, right_section_bottom) - 8 * mm
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(left, billed_y, "BILLED TO")
        pdf.setFont("Helvetica", 9)
        billed_lines = [document.get("customerName") or "-"]
        customer_company = ""
        raw_customer = str(document.get("customerName") or "").strip()
        if raw_customer and raw_customer.lower() != str(org.name or "").strip().lower():
            customer_company = raw_customer
        if customer_company:
            billed_lines.append(customer_company)
        billed_lines.extend(billing_address_lines[:5])
        if document.get("customerGstin"):
            billed_lines.append(f"GSTIN: {document.get('customerGstin')}")
        billed_line_y = billed_y - 4 * mm
        for line in billed_lines[:7]:
            pdf.drawString(left, billed_line_y, str(line))
            billed_line_y -= 4 * mm

        details_y = billed_y
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawRightString(right_section_x, details_y, "DOCUMENT DETAILS")
        pdf.setFont("Helvetica", 9)
        details_rows = [
            f"Due Date {document.get('dueDate') or '-'}",
            f"Status {document.get('status') or '-'}",
        ]
        if isinstance(gst_template, dict) and str(gst_template.get("name") or "").strip():
            details_rows.append(f"GST Template {gst_template.get('name')}")
        for index, line in enumerate(details_rows, start=1):
            pdf.drawRightString(right_section_x, details_y - (index * 4 * mm), line)

        table_top = min(billed_line_y, details_y - (len(details_rows) + 1) * 4 * mm) - 8 * mm
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(left, table_top, "DESCRIPTION")
        pdf.drawString(left + 56 * mm, table_top, "GST")
        pdf.drawString(left + 90 * mm, table_top, "HSN / SAC")
        pdf.drawString(left + 112 * mm, table_top, "UNITS")
        pdf.drawString(left + 131 * mm, table_top, "UNIT PRICE")
        pdf.drawRightString(right, table_top, "AMOUNT")
        pdf.line(left, table_top - 2 * mm, right, table_top - 2 * mm)
        row_y = table_top - 8 * mm
        pdf.setFont("Helvetica", 9)
        for row in line_rows[:12]:
            line_tax = _to_decimal(row.get("tax_percent"))
            line_type = str(row.get("hsn_sac_type") or row.get("hsnSacType") or "HSN").strip().upper() or "HSN"
            line_type = "SAC" if line_type == "SAC" else "HSN"
            line_code = str(row.get("hsn_sac_code") or "").strip() or "-"
            line_code_display = f"{line_type} {line_code}" if line_code != "-" else line_type
            description_text = str(row.get("description_custom") or row.get("description") or "-")
            description_lines = _ba_wrap_pdf_text(pdf, description_text, 86 * mm, "Helvetica", 9)
            for idx, line in enumerate(description_lines[:2]):
                pdf.drawString(left, row_y - (idx * 4 * mm), line)
            text_bottom_y = row_y - ((len(description_lines[:2]) - 1) * 4 * mm)
            pdf.drawString(left + 90 * mm, text_bottom_y, line_code_display)
            pdf.drawString(left + 114 * mm, text_bottom_y, str(row.get("qty") or ""))
            pdf.setFont(money_font, 9)
            pdf.drawString(left + 131 * mm, text_bottom_y, _format_pdf_inr(row.get('rate') or '0'))
            pdf.drawRightString(right, text_bottom_y, _format_pdf_inr(row.get('amount') or '0'))
            pdf.setFont("Helvetica", 9)
            if line_tax > 0:
                pdf.setFont("Helvetica", 8)
                pdf.drawString(left + 56 * mm, text_bottom_y, f"GST {float(line_tax)}%")
                pdf.setFont("Helvetica", 9)
            pdf.line(left, text_bottom_y - 4 * mm, right, text_bottom_y - 4 * mm)
            row_y = text_bottom_y - 8 * mm

        summary_y = row_y - 8 * mm
        pdf.setFont(money_font, 9)
        pdf.drawRightString(right, summary_y, f"Sub Total {_format_pdf_inr(totals.get('subtotal') or '0')}")
        summary_y -= 5 * mm
        if gst_breakdown:
            for label, percent, tax_value in gst_breakdown:
                pdf.drawRightString(right, summary_y, f"{label} @ {percent:.2f}% {_format_pdf_inr(tax_value)}")
                summary_y -= 5 * mm
        else:
            pdf.drawRightString(right, summary_y, f"GST / Tax {_format_pdf_inr(totals.get('tax_total') or '0')}")
            summary_y -= 5 * mm
        pdf.setFont(money_font, 11)
        pdf.drawRightString(right, summary_y - 1 * mm, f"Total {_format_pdf_inr(totals.get('grand_total') or '0')}")

        payment_y = summary_y - 16 * mm
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(left, payment_y, "PAYMENT DETAILS")
        pdf.setFont("Helvetica", 9)
        payment_lines = [f"Payment Status: {context['payment_status']}"]
        if _to_decimal(context.get("paid_amount")) > 0:
            pdf.setFont(money_font, 9)
            payment_lines.append(f"Paid Amount: {_format_pdf_inr(context.get('paid_amount') or '0')}")
            payment_lines.append(f"Balance Amount: {_format_pdf_inr(context.get('balance_amount') or '0')}")
            pdf.setFont("Helvetica", 9)
            if context.get("payment_mode"):
                payment_lines.append(f"Payment Mode: {context['payment_mode']}")
            if context.get("payment_date"):
                payment_lines.append(f"Payment Date: {context['payment_date']}")
            if context.get("transaction_id"):
                payment_lines.append(f"Transaction ID: {context['transaction_id']}")
        payment_line_y = payment_y - 4 * mm
        for line in payment_lines[:6]:
            pdf.drawString(left, payment_line_y, str(line))
            payment_line_y -= 4 * mm

        pdf.showPage()
        pdf.save()
        buffer.seek(0)
        response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
        generated_at = timezone.localtime().strftime("%Y%m%d%H%M%S")
        filename = f"{normalized_doc_type}_{document.get('docNo') or doc_id}_{generated_at}.pdf".replace(" ", "_")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response["Pragma"] = "no-cache"
        response["Expires"] = "0"
        return response
    return render(request, "business_autopilot/accounts/document_print.html", context)


def _crm_is_admin(user: User, org: Organization):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    profile_role = _normalize_admin_role(getattr(profile, "role", ""))
    if profile_role in {"company_admin", "org_admin", "owner", "superadmin", "super_admin"}:
        return True
    membership = _get_org_membership(user, org)
    membership_role = _normalize_admin_role(getattr(membership, "role", "")) if membership else ""
    return membership_role in {"company_admin", "org_admin", "owner"}


def _crm_to_decimal(value):
    try:
        normalized = str(value or "0").strip() or "0"
        normalized = normalized.replace(",", "")
        normalized = "".join(ch for ch in normalized if ch.isdigit() or ch in {".", "-"})
        return Decimal(normalized or "0")
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def _normalize_payment_status(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "paid":
        return "paid"
    if normalized in {"partial", "partially paid"}:
        return "partial"
    return "pending"


def _crm_order_id(org: Organization):
    day_key = timezone.localdate().strftime("%d%m%Y")
    prefix = f"SO-{day_key}-"
    pattern = re.compile(rf"^{re.escape(prefix)}(\d{{3}})$")
    last_seq = 0
    existing_ids = (
        CrmSalesOrder.objects
        .filter(organization=org, order_id__startswith=prefix)
        .values_list("order_id", flat=True)
    )
    for raw_id in existing_ids:
        match = pattern.match(str(raw_id or "").strip())
        if not match:
            continue
        try:
            seq = int(match.group(1))
        except (TypeError, ValueError):
            continue
        if seq > last_seq:
            last_seq = seq
    return f"{prefix}{last_seq + 1:03d}"


def _crm_resolve_unique_order_id(org: Organization, requested_order_id: str = ""):
    requested = str(requested_order_id or "").strip()[:30]
    if requested:
        if not CrmSalesOrder.objects.filter(organization=org, order_id=requested).exists():
            return requested
    for _ in range(25):
        candidate = _crm_order_id(org)
        if not CrmSalesOrder.objects.filter(organization=org, order_id=candidate).exists():
            return candidate
    return _crm_order_id(org)


def _crm_body_row_id(payload, *keys):
    if not isinstance(payload, dict):
        return None
    for key in keys:
        row_id = _coerce_positive_int(payload.get(key))
        if row_id:
            return row_id
    return None


def _crm_reference_id_from_related_to(org: Organization, related_to: str):
    related_value = str(related_to or "").strip()
    if not related_value:
        return ""
    lead_match = (
        CrmLead.objects
        .filter(organization=org, is_deleted=False, lead_name__iexact=related_value)
        .order_by("-updated_at", "-id")
        .values_list("crm_reference_id", flat=True)
        .first()
    )
    if lead_match:
        return str(lead_match).strip()
    lead_company_match = (
        CrmLead.objects
        .filter(organization=org, is_deleted=False, company__iexact=related_value)
        .order_by("-updated_at", "-id")
        .values_list("crm_reference_id", flat=True)
        .first()
    )
    if lead_company_match:
        return str(lead_company_match).strip()
    deal_match = (
        CrmDeal.objects
        .filter(organization=org, is_deleted=False, deal_name__iexact=related_value)
        .order_by("-updated_at", "-id")
        .values_list("crm_reference_id", flat=True)
        .first()
    )
    if deal_match:
        return str(deal_match).strip()
    deal_company_match = (
        CrmDeal.objects
        .filter(organization=org, is_deleted=False, company__iexact=related_value)
        .order_by("-updated_at", "-id")
        .values_list("crm_reference_id", flat=True)
        .first()
    )
    if deal_company_match:
        return str(deal_company_match).strip()
    return ""


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


def _crm_sales_order_payload_dict(row: CrmSalesOrder):
    raw_payload = row.products if isinstance(row.products, dict) else {}
    if not isinstance(raw_payload, dict):
        raw_payload = {}
    items = raw_payload.get("items")
    if not isinstance(items, list):
        items = row.products if isinstance(row.products, list) else []
    return {
        **raw_payload,
        "items": [item for item in items if isinstance(item, dict)],
    }


def _crm_normalize_sales_order_items(items):
    normalized_items = []
    if not isinstance(items, list):
        return normalized_items
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        description = str(item.get("description") or item.get("customText") or "").strip()
        hsn_sac_type = str(item.get("hsnSacType") or item.get("hsn_sac_type") or "HSN").strip().upper() or "HSN"
        hsn_sac_code = str(item.get("hsnSacCode") or item.get("hsn_sac_code") or item.get("hsnCode") or item.get("sacCode") or "").strip()
        qty_value = _crm_to_decimal(item.get("qty"))
        qty = qty_value if qty_value > 0 else Decimal("1")
        rate = _crm_to_decimal(item.get("rate"))
        tax_override = _resolve_document_line_tax_override(item)
        qty_text = format(qty.quantize(Decimal("1")), "f") if qty == qty.to_integral() else format(qty.normalize(), "f")
        normalized_items.append({
            "id": str(item.get("id") or f"crm_so_line_{index + 1}").strip(),
            "itemMasterId": str(item.get("itemMasterId") or "").strip(),
            "inventoryItemId": str(item.get("inventoryItemId") or "").strip(),
            "description": description,
            "customText": str(item.get("customText") or "").strip(),
            "hsnSacType": "SAC" if hsn_sac_type == "SAC" else "HSN",
            "hsnSacCode": hsn_sac_code,
            "qty": qty_text,
            "rate": str(rate),
            "taxPercent": str(tax_override["tax_percent"]) if tax_override["has_override"] else "",
            "taxPercentSource": tax_override["tax_percent_source"],
        })
    return normalized_items


def _crm_sales_order_totals(items, default_tax_percent=Decimal("0")):
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    total_qty = Decimal("0")
    first_rate = Decimal("0")
    first_tax = Decimal("0")
    for index, item in enumerate(items):
        qty = _crm_to_decimal(item.get("qty"))
        rate = _crm_to_decimal(item.get("rate"))
        tax_override = _resolve_document_line_tax_override(item)
        tax_percent = tax_override["tax_percent"] if tax_override["has_override"] else _to_decimal(default_tax_percent)
        line_subtotal = qty * rate
        subtotal += line_subtotal
        tax_total += line_subtotal * (tax_percent / Decimal("100"))
        total_qty += qty
        if index == 0:
            first_rate = rate
            first_tax = tax_percent
    return {
        "subtotal": subtotal,
        "tax_total": tax_total,
        "grand_total": subtotal + tax_total,
        "total_qty": total_qty,
        "first_rate": first_rate,
        "first_tax": first_tax,
    }


def _crm_can_access_row(user: User, org: Organization, row):
    return _crm_can_view_row(user, org, row)


def _serialize_crm_lead(row: CrmLead):
    return {
        "id": row.id,
        "crm_reference_id": str(row.crm_reference_id or "").strip(),
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
        "priority": row.priority or "Medium",
        "status": row.status,
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_by_name": _get_org_user_display_name(row.created_by) if row.created_by_id else "",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _serialize_crm_contact(row: CrmContact):
    return {
        "id": row.id,
        "name": row.name,
        "company": row.company,
        "email": row.email,
        "phone_country_code": row.phone_country_code or "+91",
        "phone": row.phone,
        "tag": row.tag or "Client",
        "is_deleted": bool(row.is_deleted),
        "deleted_at": row.deleted_at.isoformat() if row.deleted_at else None,
        "created_by_id": row.created_by_id,
        "created_by_name": _get_org_user_display_name(row.created_by) if row.created_by_id else "",
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "updated_at": row.updated_at.isoformat() if row.updated_at else "",
    }


def _crm_collect_leads_linked_to_user(org: Organization, user_id: int):
    safe_user_id = _coerce_positive_int(user_id)
    if not safe_user_id:
        return []
    rows = (
        CrmLead.objects
        .filter(organization=org, is_deleted=False)
        .select_related("assigned_user", "created_by")
        .order_by("-created_at", "-id")
    )
    linked = []
    for row in rows:
        assigned_ids = set(_crm_clean_user_id_list(row.assigned_user_ids))
        if row.assigned_user_id_id:
            assigned_ids.add(int(row.assigned_user_id))
        if safe_user_id in assigned_ids:
            linked.append(row)
    return linked


def _crm_collect_deals_linked_to_user(org: Organization, user_id: int):
    safe_user_id = _coerce_positive_int(user_id)
    if not safe_user_id:
        return []
    rows = (
        CrmDeal.objects
        .filter(organization=org, is_deleted=False)
        .select_related("assigned_user", "lead", "created_by")
        .order_by("-created_at", "-id")
    )
    linked = []
    for row in rows:
        assigned_ids = set(_crm_clean_user_id_list(row.assigned_user_ids))
        if row.assigned_user_id_id:
            assigned_ids.add(int(row.assigned_user_id))
        if safe_user_id in assigned_ids:
            linked.append(row)
    return linked


def _crm_collect_contacts_linked_to_contact(row: CrmContact):
    company = str(getattr(row, "company", "") or "").strip().lower()
    name = str(getattr(row, "name", "") or "").strip().lower()
    email = str(getattr(row, "email", "") or "").strip().lower()
    phone = str(getattr(row, "phone", "") or "").strip()
    phone_code = str(getattr(row, "phone_country_code", "") or "+91").strip() or "+91"
    leads = []
    for lead in CrmLead.objects.filter(organization=row.organization, is_deleted=False).select_related("assigned_user", "created_by").order_by("-created_at", "-id"):
        lead_company = str(getattr(lead, "company", "") or "").strip().lower()
        lead_name = str(getattr(lead, "lead_name", "") or "").strip().lower()
        lead_phone = str(getattr(lead, "phone", "") or "").strip()
        if company and (lead_company == company or lead_name == company):
            leads.append(lead)
            continue
        if name and (lead_name == name or lead_company == name):
            leads.append(lead)
            continue
        if phone and lead_phone == phone:
            leads.append(lead)
            continue
    if email:
        # Email is stored on contacts, but leads do not currently persist it.
        # Keep the helper ready for future schema support without exposing stale assumptions.
        pass
    return leads


def _serialize_crm_deal(row: CrmDeal):
    crm_reference_id = str(row.crm_reference_id or "").strip()
    if not crm_reference_id and row.lead_id:
        crm_reference_id = str(getattr(row.lead, "crm_reference_id", "") or "").strip()
    return {
        "id": row.id,
        "crm_reference_id": crm_reference_id,
        "lead_id": row.lead_id,
        "deal_name": row.deal_name,
        "company": row.company,
        "phone": row.phone,
        "deal_value": float(row.deal_value or 0),
        "won_amount_final": float(row.won_amount_final or 0),
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
    crm_reference_id = str(row.crm_reference_id or "").strip()
    if not crm_reference_id and row.deal_id:
        deal_ref = str(getattr(row.deal, "crm_reference_id", "") or "").strip()
        lead_ref = str(getattr(getattr(row.deal, "lead", None), "crm_reference_id", "") or "").strip()
        crm_reference_id = deal_ref or lead_ref
    payload = _crm_sales_order_payload_dict(row)
    items = payload.get("items") if isinstance(payload.get("items"), list) else []
    totals = _crm_sales_order_totals(items)
    return {
        "id": row.id,
        "crm_reference_id": crm_reference_id,
        "deal_id": row.deal_id,
        "order_id": row.order_id,
        "customer_name": row.customer_name,
        "company": row.company,
        "phone": row.phone,
        "amount": float(row.amount or 0),
        "products": payload,
        "items": items,
        "quantity": int(row.quantity or 0),
        "price": float(row.price or 0),
        "tax": float(row.tax or 0),
        "total_amount": float(row.total_amount or 0),
        "status": row.status,
        "payment_status": row.payment_status,
        "paid_amount": float(row.paid_amount or 0),
        "payment_mode": row.payment_mode or "",
        "payment_date": row.payment_date.isoformat() if row.payment_date else "",
        "transaction_id": row.transaction_id or "",
        "balance_amount": float(max(Decimal("0"), (row.total_amount or Decimal("0")) - Decimal(str(row.paid_amount or 0)))),
        "issue_date": str(payload.get("issueDate") or payload.get("issue_date") or ""),
        "due_date": str(payload.get("dueDate") or payload.get("due_date") or ""),
        "gst_template_id": str(payload.get("gstTemplateId") or payload.get("gst_template_id") or ""),
        "billing_template_id": str(payload.get("billingTemplateId") or payload.get("billing_template_id") or ""),
        "salesperson": str(payload.get("salesperson") or ""),
        "customer_gstin": str(payload.get("customerGstin") or payload.get("customer_gstin") or ""),
        "billing_address": str(payload.get("billingAddress") or payload.get("billing_address") or ""),
        "notes": str(payload.get("notes") or ""),
        "terms_text": str(payload.get("termsText") or payload.get("terms_text") or ""),
        "payment_status_notes": str(payload.get("paymentStatusNotes") or payload.get("payment_status_notes") or ""),
        "source_deal_id": str(payload.get("sourceDealId") or payload.get("source_deal_id") or row.deal_id or ""),
        "converted_to_invoice": bool(payload.get("convertedToInvoice") or payload.get("converted_to_invoice")),
        "converted_invoice_id": str(payload.get("convertedInvoiceId") or payload.get("converted_invoice_id") or ""),
        "subtotal": float(totals["subtotal"]),
        "tax_total": float(totals["tax_total"]),
        "grand_total": float(totals["grand_total"]),
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
        "crm_reference_id": str(row.crm_reference_id or "").strip(),
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
        .filter(organization=org, user_id__in=owner_ids, is_active=True, is_deleted=False)
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

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PATCH", "DELETE"}:
            resolved_method = body_action
        elif override_method in {"PATCH", "DELETE"}:
            resolved_method = override_method

    if resolved_method in {"PATCH", "DELETE"} and not lead_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        lead_id = _crm_body_row_id(payload, "lead_id", "id")

    if resolved_method == "POST":
        if payload is None:
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
            priority=str(payload.get("priority") or "Medium").strip()[:30] or "Medium",
            status=str(payload.get("status") or "Open").strip()[:30] or "Open",
            created_by=request.user,
            updated_by=request.user,
        )
        return JsonResponse({"lead": _serialize_crm_lead(row)}, status=201)

    if resolved_method == "GET" and not lead_id:
        rows = [
            row
            for row in CrmLead.objects.filter(organization=org).select_related("assigned_user", "created_by").order_by("-created_at")
            if _crm_can_view_row(request.user, org, row)
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

    if resolved_method == "GET":
        return JsonResponse({"lead": _serialize_crm_lead(row)})

    if resolved_method == "PATCH":
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        update_fields = ["updated_by", "updated_at"]
        sync_related_deal = False
        if "lead_name" in payload or "name" in payload:
            lead_name = str(payload.get("lead_name") or payload.get("name") or "").strip()
            if not lead_name:
                return JsonResponse({"detail": "lead_name_required"}, status=400)
            row.lead_name = lead_name[:180]
            update_fields.append("lead_name")
            sync_related_deal = True
        if "company" in payload:
            row.company = str(payload.get("company") or "").strip()[:180]
            update_fields.append("company")
            sync_related_deal = True
        if "phone" in payload:
            row.phone = str(payload.get("phone") or "").strip()[:40]
            update_fields.append("phone")
            sync_related_deal = True
        if "lead_amount" in payload or "leadAmount" in payload:
            row.lead_amount = _crm_to_decimal(payload.get("lead_amount") if "lead_amount" in payload else payload.get("leadAmount"))
            update_fields.append("lead_amount")
            sync_related_deal = True
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
            sync_related_deal = True
        if "assigned_user_ids" in payload or "assignedUserIds" in payload:
            row.assigned_user_ids = _crm_clean_user_id_list(
                payload.get("assigned_user_ids") if "assigned_user_ids" in payload else payload.get("assignedUserIds")
            )
            update_fields.append("assigned_user_ids")
            sync_related_deal = True
        if "assigned_team" in payload or "assignedTeam" in payload:
            row.assigned_team = str(payload.get("assigned_team") or payload.get("assignedTeam") or "").strip()[:180]
            update_fields.append("assigned_team")
            sync_related_deal = True
        if "stage" in payload:
            row.stage = str(payload.get("stage") or "New").strip()[:30] or "New"
            update_fields.append("stage")
        if "priority" in payload:
            row.priority = str(payload.get("priority") or "Medium").strip()[:30] or "Medium"
            update_fields.append("priority")
        if "status" in payload:
            row.status = str(payload.get("status") or "Open").strip()[:30] or "Open"
            update_fields.append("status")
        if "is_deleted" in payload:
            is_deleted = bool(payload.get("is_deleted"))
            row.is_deleted = is_deleted
            row.deleted_at = timezone.now() if is_deleted else None
            row.deleted_by = request.user if is_deleted else None
            update_fields.extend(["is_deleted", "deleted_at", "deleted_by"])
        row.updated_by = request.user
        row.save(update_fields=list(dict.fromkeys(update_fields)))
        if sync_related_deal:
            linked_deals = CrmDeal.objects.filter(organization=org, lead=row, is_deleted=False)
            for linked_deal in linked_deals:
                linked_deal.crm_reference_id = str(row.crm_reference_id or "").strip()
                linked_deal.deal_name = str(row.lead_name or "").strip()[:180]
                linked_deal.company = row.company
                linked_deal.phone = row.phone
                linked_deal.deal_value = _crm_to_decimal(row.lead_amount)
                linked_deal.assigned_user = row.assigned_user
                linked_deal.assigned_user_ids = _crm_clean_user_id_list(row.assigned_user_ids)
                linked_deal.assigned_team = row.assigned_team
                linked_deal.updated_by = request.user
                linked_deal.save(
                    update_fields=[
                        "crm_reference_id",
                        "deal_name",
                        "company",
                        "phone",
                        "deal_value",
                        "assigned_user",
                        "assigned_user_ids",
                        "assigned_team",
                        "updated_by",
                        "updated_at",
                    ]
                )
        return JsonResponse({"lead": _serialize_crm_lead(row)})

    if resolved_method == "DELETE":
        if not _crm_can_edit_row(request.user, org, row):
            return JsonResponse({"detail": "forbidden"}, status=403)
        permanent = (
            str(request.GET.get("permanent") or "").strip().lower() in {"1", "true", "yes"}
            or bool((payload or {}).get("__crm_permanent"))
        )
        linked_leads = _crm_collect_contacts_linked_to_contact(row)
        if permanent:
            row.delete()
            return JsonResponse({
                "deleted": True,
                "permanent": True,
                "affected_leads": [_serialize_crm_lead(item) for item in linked_leads],
            })
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.updated_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_by", "updated_at"])
        return JsonResponse({
            "deleted": True,
            "affected_leads": [_serialize_crm_lead(item) for item in linked_leads],
        })

    return JsonResponse({"detail": "invalid_method"}, status=405)


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def crm_contacts(request, contact_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PATCH", "DELETE"}:
            resolved_method = body_action
        elif override_method in {"PATCH", "DELETE"}:
            resolved_method = override_method

    if resolved_method in {"PATCH", "DELETE"} and not contact_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        contact_id = _crm_body_row_id(payload, "contact_id", "id")

    if resolved_method == "GET" and not contact_id:
        rows = CrmContact.objects.filter(organization=org).select_related("created_by").order_by("-created_at")
        return JsonResponse({"contacts": [_serialize_crm_contact(row) for row in rows]})

    if resolved_method == "POST" and not contact_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        name = str(payload.get("name") or "").strip()
        if not name:
            return JsonResponse({"detail": "name_required"}, status=400)
        tag = str(payload.get("tag") or "Client").strip().title()
        if tag not in {"Client", "Prospect", "Vendor"}:
            tag = "Client"
        row = CrmContact.objects.create(
            organization=org,
            name=name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            email=str(payload.get("email") or "").strip()[:180],
            phone_country_code=str(payload.get("phone_country_code") or payload.get("phoneCountryCode") or "+91").strip()[:10] or "+91",
            phone=str(payload.get("phone") or "").strip()[:40],
            tag=tag,
            created_by=request.user,
            updated_by=request.user,
        )
        return JsonResponse({"contact": _serialize_crm_contact(row)}, status=201)

    row = CrmContact.objects.filter(organization=org, id=contact_id).select_related("created_by").first() if contact_id else None
    if not row:
        return JsonResponse({"detail": "contact_not_found"}, status=404)

    if resolved_method == "PATCH":
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        update_fields = ["updated_by", "updated_at"]
        if "name" in payload:
            name = str(payload.get("name") or "").strip()
            if not name:
                return JsonResponse({"detail": "name_required"}, status=400)
            row.name = name[:180]
            update_fields.append("name")
        if "company" in payload:
            row.company = str(payload.get("company") or "").strip()[:180]
            update_fields.append("company")
        if "email" in payload:
            row.email = str(payload.get("email") or "").strip()[:180]
            update_fields.append("email")
        if "phone_country_code" in payload or "phoneCountryCode" in payload:
            row.phone_country_code = str(payload.get("phone_country_code") or payload.get("phoneCountryCode") or "+91").strip()[:10] or "+91"
            update_fields.append("phone_country_code")
        if "phone" in payload:
            row.phone = str(payload.get("phone") or "").strip()[:40]
            update_fields.append("phone")
        if "tag" in payload:
            tag = str(payload.get("tag") or "Client").strip().title()
            row.tag = tag if tag in {"Client", "Prospect", "Vendor"} else "Client"
            update_fields.append("tag")
        if "is_deleted" in payload:
            is_deleted = bool(payload.get("is_deleted"))
            row.is_deleted = is_deleted
            row.deleted_at = timezone.now() if is_deleted else None
            row.deleted_by = request.user if is_deleted else None
            update_fields.extend(["is_deleted", "deleted_at", "deleted_by"])
        row.updated_by = request.user
        row.save(update_fields=list(dict.fromkeys(update_fields)))
        return JsonResponse({"contact": _serialize_crm_contact(row)})

    if resolved_method == "DELETE":
        if not _crm_can_edit_row(request.user, org, row):
            return JsonResponse({"detail": "forbidden"}, status=403)
        permanent = (
            str(request.GET.get("permanent") or "").strip().lower() in {"1", "true", "yes"}
            or bool((payload or {}).get("__crm_permanent"))
        )
        if permanent:
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
    if _crm_to_decimal(lead.lead_amount) <= Decimal("0"):
        return JsonResponse({"detail": "lead_amount_required_for_conversion"}, status=400)
    existing_deal = CrmDeal.objects.filter(organization=org, lead=lead, is_deleted=False).first()
    if existing_deal:
        # Keep converted deal in sync with latest lead data when user retries convert.
        existing_deal.crm_reference_id = str(lead.crm_reference_id or "").strip()
        existing_deal.deal_name = str(lead.lead_name or "").strip()[:180]
        existing_deal.company = lead.company
        existing_deal.phone = lead.phone
        existing_deal.deal_value = _crm_to_decimal(lead.lead_amount)
        existing_deal.assigned_user = lead.assigned_user
        existing_deal.assigned_user_ids = _crm_clean_user_id_list(lead.assigned_user_ids)
        existing_deal.assigned_team = lead.assigned_team
        existing_deal.updated_by = request.user
        existing_deal.save(
            update_fields=[
                "crm_reference_id",
                "deal_name",
                "company",
                "phone",
                "deal_value",
                "assigned_user",
                "assigned_user_ids",
                "assigned_team",
                "updated_by",
                "updated_at",
            ]
        )
        if lead.status != "Converted" or lead.stage != "Qualified":
            lead.status = "Converted"
            lead.stage = "Qualified"
            lead.updated_by = request.user
            lead.save(update_fields=["status", "stage", "updated_by", "updated_at"])
        return JsonResponse(
            {
                "deal": _serialize_crm_deal(existing_deal),
                "lead": _serialize_crm_lead(lead),
                "already_converted": True,
                "synced": True,
            }
        )
    with transaction.atomic():
        deal = CrmDeal.objects.create(
            organization=org,
            lead=lead,
            crm_reference_id=str(lead.crm_reference_id or "").strip(),
            deal_name=str(lead.lead_name or "").strip()[:180],
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

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PATCH", "DELETE"}:
            resolved_method = body_action
        elif override_method in {"PATCH", "DELETE"}:
            resolved_method = override_method

    if resolved_method in {"PATCH", "DELETE"} and not deal_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        deal_id = _crm_body_row_id(payload, "deal_id", "id")

    if resolved_method == "GET" and not deal_id:
        rows = [
        row
        for row in CrmDeal.objects.filter(organization=org).select_related("assigned_user", "lead", "created_by").order_by("-created_at")
        if _crm_can_view_row(request.user, org, row)
    ]
        pipeline_value = sum((_crm_to_decimal(row.deal_value) for row in rows if not row.is_deleted), Decimal("0"))
        return JsonResponse({"deals": [_serialize_crm_deal(row) for row in rows], "pipeline_value": float(pipeline_value)})

    if resolved_method == "POST" and not deal_id:
        if payload is None:
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
        deal_crm_reference_id = str(payload.get("crm_reference_id") or "").strip()[:32]
        if lead and not deal_crm_reference_id:
            deal_crm_reference_id = str(lead.crm_reference_id or "").strip()[:32]
        assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id"))
        assigned_user = User.objects.filter(id=assigned_user_id).first() if assigned_user_id else None
        row = CrmDeal.objects.create(
            organization=org,
            lead=lead,
            crm_reference_id=deal_crm_reference_id,
            deal_name=deal_name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            phone=str(payload.get("phone") or "").strip()[:40],
            deal_value=_crm_to_decimal(payload.get("deal_value")),
            won_amount_final=_crm_to_decimal(payload.get("won_amount_final")),
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

    if resolved_method == "GET":
        return JsonResponse({"deal": _serialize_crm_deal(row)})

    if resolved_method == "PATCH":
        if payload is None:
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
        if "won_amount_final" in payload or "wonAmountFinal" in payload:
            row.won_amount_final = _crm_to_decimal(
                payload.get("won_amount_final") if "won_amount_final" in payload else payload.get("wonAmountFinal")
            )
        update_fields = ["stage", "status", "deal_value", "won_amount_final", "updated_by", "updated_at"]
        if not row.crm_reference_id and row.lead_id:
            lead_ref = str(getattr(row.lead, "crm_reference_id", "") or "").strip()
            if lead_ref:
                row.crm_reference_id = lead_ref
                update_fields.append("crm_reference_id")
        row.updated_by = request.user
        row.save(update_fields=update_fields)
        return JsonResponse({"deal": _serialize_crm_deal(row)})

    if resolved_method == "DELETE":
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

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PATCH", "DELETE"}:
            resolved_method = body_action
        elif override_method in {"PATCH", "DELETE"}:
            resolved_method = override_method

    if resolved_method in {"PATCH", "DELETE"} and not meeting_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        meeting_id = _crm_body_row_id(payload, "meeting_id", "id")

    if resolved_method == "GET" and not meeting_id:
        _dispatch_due_crm_meeting_reminders(org=org)
        rows = [
            row
            for row in CrmMeeting.objects.filter(organization=org).order_by("-created_at")
            if _crm_can_view_row(request.user, org, row)
        ]
        return JsonResponse({"meetings": [_serialize_crm_meeting(row) for row in rows]})

    if resolved_method == "POST" and not meeting_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        try:
            meeting_id = _crm_body_row_id(payload, "meeting_id", "id")
        except Exception:
            meeting_id = None
        title = str(payload.get("title") or payload.get("meeting_title") or "").strip()
        if not title:
            return JsonResponse({"detail": "title_required"}, status=400)
        related_to_value = str(payload.get("related_to") or payload.get("relatedTo") or "").strip()[:180]
        meeting_crm_reference_id = str(payload.get("crm_reference_id") or payload.get("crmReferenceId") or "").strip()[:32]
        if not meeting_crm_reference_id:
            meeting_crm_reference_id = _crm_reference_id_from_related_to(org, related_to_value)
        meeting_date = parse_date(str(payload.get("meeting_date") or payload.get("meetingDate") or "").strip() or "")
        meeting_time = parse_time(str(payload.get("meeting_time") or payload.get("meetingTime") or "").strip() or "")
        row = CrmMeeting.objects.create(
            organization=org,
            crm_reference_id=meeting_crm_reference_id,
            title=title[:180],
            company_or_client_name=str(payload.get("company_or_client_name") or payload.get("companyOrClientName") or "").strip()[:180],
            related_to=related_to_value,
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

    if resolved_method == "PATCH":
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        related_to_changed = False
        if "title" in payload or "meeting_title" in payload:
            title = str(payload.get("title") or payload.get("meeting_title") or "").strip()
            if title:
                row.title = title[:180]
        if "company_or_client_name" in payload or "companyOrClientName" in payload:
            row.company_or_client_name = str(payload.get("company_or_client_name") or payload.get("companyOrClientName") or "").strip()[:180]
        if "related_to" in payload or "relatedTo" in payload:
            row.related_to = str(payload.get("related_to") or payload.get("relatedTo") or "").strip()[:180]
            related_to_changed = True
        if "crm_reference_id" in payload or "crmReferenceId" in payload:
            row.crm_reference_id = str(payload.get("crm_reference_id") or payload.get("crmReferenceId") or "").strip()[:32]
        elif related_to_changed and not str(row.crm_reference_id or "").strip():
            row.crm_reference_id = _crm_reference_id_from_related_to(org, row.related_to)
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
            if not _crm_is_admin(request.user, org):
                return JsonResponse({"detail": "forbidden"}, status=403)
            is_deleted = bool(payload.get("is_deleted"))
            row.is_deleted = is_deleted
            row.deleted_at = timezone.now() if is_deleted else None
            row.deleted_by = request.user if is_deleted else None
        row.updated_by = request.user
        row.save()
        _dispatch_due_crm_meeting_reminders(org=org)
        return JsonResponse({"meeting": _serialize_crm_meeting(row)})

    if resolved_method == "DELETE":
        if not _crm_is_admin(request.user, org):
            return JsonResponse({"detail": "forbidden"}, status=403)
        permanent = (
            str(request.GET.get("permanent") or "").strip() in {"1", "true", "yes"}
            or bool((payload or {}).get("__crm_permanent"))
        )
        if permanent:
            row.delete()
            return JsonResponse({"deleted": True, "permanent": True})
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.updated_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_by", "updated_at"])
        return JsonResponse({"deleted": True})

    return JsonResponse({"detail": "invalid_method"}, status=405)


@require_http_methods(["GET", "POST", "PATCH", "DELETE"])
def crm_sales_orders(request, order_id: int = None):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)
    org = _resolve_org(request.user)
    if not org:
        return JsonResponse({"detail": "organization_not_found"}, status=404)

    resolved_method = request.method
    payload = None
    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"detail": "invalid_json"}, status=400)
        override_method = str(request.META.get("HTTP_X_HTTP_METHOD_OVERRIDE") or "").strip().upper()
        body_action = str(payload.get("__crm_action") or payload.get("action") or "").strip().upper()
        if body_action in {"PATCH", "DELETE"}:
            resolved_method = body_action
        elif override_method in {"PATCH", "DELETE"}:
            resolved_method = override_method

    if resolved_method in {"PATCH", "DELETE"} and not order_id:
        if payload is None:
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                return JsonResponse({"detail": "invalid_json"}, status=400)
        order_id = _crm_body_row_id(payload, "sales_order_id", "id")

    if resolved_method == "GET" and not order_id:
        rows = CrmSalesOrder.objects.filter(organization=org).select_related("assigned_user", "deal", "deal__lead", "created_by").order_by("-created_at")
        visible_rows = [row for row in rows if _crm_can_view_row(request.user, org, row)]
        return JsonResponse({"sales_orders": [_serialize_crm_sales_order(row) for row in visible_rows]})

    row = CrmSalesOrder.objects.filter(organization=org, id=order_id).select_related("deal", "assigned_user", "created_by").first() if order_id else None
    if order_id and not row:
        return JsonResponse({"detail": "sales_order_not_found"}, status=404)
    if row and not _crm_can_access_row(request.user, org, row):
        return JsonResponse({"detail": "forbidden"}, status=403)
    can_edit_payment_details = _crm_is_admin(request.user, org)

    if resolved_method == "DELETE":
        if not _crm_is_admin(request.user, org):
            return JsonResponse({"detail": "forbidden"}, status=403)
        permanent = (
            str(request.GET.get("permanent") or "").strip().lower() in {"1", "true", "yes"}
            or bool((payload or {}).get("__crm_permanent"))
        )
        if permanent:
            row.delete()
            return JsonResponse({"deleted": True, "permanent": True})
        row.is_deleted = True
        row.deleted_at = timezone.now()
        row.deleted_by = request.user
        row.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_at"])
        return JsonResponse({"deleted": True})

    try:
        if payload is None:
            payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)
    customer_name = str(payload.get("customer_name") or "").strip()
    if not customer_name:
        return JsonResponse({"detail": "customer_name_required"}, status=400)
    crm_reference_id = str(payload.get("crm_reference_id") or payload.get("crmReferenceId") or "").strip()[:32]
    source_deal_id = _coerce_positive_int(payload.get("source_deal_id") or payload.get("sourceDealId") or payload.get("deal_id"))
    source_deal = None
    if source_deal_id:
        source_deal = CrmDeal.objects.filter(organization=org, id=source_deal_id).select_related("lead").first()
    if source_deal and not crm_reference_id:
        crm_reference_id = str(source_deal.crm_reference_id or getattr(source_deal.lead, "crm_reference_id", "") or "").strip()[:32]
    gst_template_id = str(payload.get("gst_template_id") or payload.get("gstTemplateId") or "").strip()
    accounts_workspace = _get_accounts_workspace(org)
    accounts_data = _normalize_accounts_workspace(accounts_workspace.data)
    gst_templates_by_id = {
        str(item.get("id")): item
        for item in accounts_data.get("gstTemplates", [])
        if isinstance(item, dict)
    }
    default_tax_percent = _document_template_total_percent(
        _resolve_gst_template_by_id(gst_templates_by_id, gst_template_id)
    )
    normalized_items = _crm_normalize_sales_order_items(payload.get("items"))
    totals = _crm_sales_order_totals(normalized_items, default_tax_percent=default_tax_percent)
    subtotal_amount = _crm_to_decimal(payload.get("amount")) if not normalized_items else totals["subtotal"]
    total_amount = _crm_to_decimal(payload.get("total_amount")) if not normalized_items else totals["grand_total"]
    quantity = _coerce_positive_int(payload.get("quantity")) or int(totals["total_qty"] or Decimal("1")) or 1
    price = _crm_to_decimal(payload.get("price")) if not normalized_items else totals["first_rate"]
    tax = _crm_to_decimal(payload.get("tax")) if not normalized_items else totals["first_tax"]
    assigned_user_id = _coerce_positive_int(payload.get("assigned_user_id"))
    assigned_user = User.objects.filter(id=assigned_user_id).first() if assigned_user_id else request.user
    deal = None
    source_deal_id = _coerce_positive_int(payload.get("source_deal_id") or payload.get("sourceDealId") or payload.get("deal_id"))
    if source_deal_id:
        deal = CrmDeal.objects.filter(organization=org, id=source_deal_id).first()
    paid_amount = _crm_to_decimal(payload.get("paid_amount") or payload.get("paidAmount")) if can_edit_payment_details else _crm_to_decimal(row.paid_amount if row else 0)
    calculated_total_amount = total_amount or (subtotal_amount + (subtotal_amount * (tax / Decimal("100"))))
    if paid_amount >= calculated_total_amount and calculated_total_amount > 0:
        payment_status = "paid"
    elif paid_amount > 0:
        payment_status = "partial"
    else:
        payment_status = "pending"
    products_payload = {
        "items": normalized_items,
        "issueDate": str(payload.get("issue_date") or payload.get("issueDate") or "").strip(),
        "dueDate": str(payload.get("due_date") or payload.get("dueDate") or "").strip(),
        "gstTemplateId": gst_template_id,
        "billingTemplateId": str(payload.get("billing_template_id") or payload.get("billingTemplateId") or "").strip(),
        "salesperson": str(payload.get("salesperson") or "").strip(),
        "customerGstin": str(payload.get("customer_gstin") or payload.get("customerGstin") or "").strip(),
        "billingAddress": str(payload.get("billing_address") or payload.get("billingAddress") or "").strip(),
        "notes": str(payload.get("notes") or "").strip(),
        "termsText": str(payload.get("terms_text") or payload.get("termsText") or "").strip(),
        "paymentStatusNotes": str(payload.get("payment_status_notes") or payload.get("paymentStatusNotes") or "").strip(),
        "paymentEntries": [
            {
                "id": str(entry.get("id") or "").strip(),
                "paymentDate": str(entry.get("paymentDate") or entry.get("payment_date") or "").strip(),
                "paymentMode": str(entry.get("paymentMode") or entry.get("payment_mode") or "").strip(),
                "amount": float(_crm_to_decimal(entry.get("amount") or entry.get("paidAmount") or entry.get("paid_amount"))),
                "transactionId": str(entry.get("transactionId") or entry.get("transaction_id") or "").strip(),
                "notes": str(entry.get("notes") or entry.get("paymentNotes") or "").strip(),
            }
            for entry in (payload.get("payment_entries") or payload.get("paymentEntries") or [])
            if isinstance(entry, dict)
        ],
        "paymentStatus": payment_status,
        "paidAmount": float(paid_amount),
        "paymentMode": str(payload.get("payment_mode") or payload.get("paymentMode") or "").strip() if can_edit_payment_details else str(row.payment_mode if row else ""),
        "paymentDate": str(payload.get("payment_date") or payload.get("paymentDate") or "").strip() if can_edit_payment_details else (row.payment_date.isoformat() if row and row.payment_date else ""),
        "transactionId": str(payload.get("transaction_id") or payload.get("transactionId") or "").strip() if can_edit_payment_details else str(row.transaction_id if row else ""),
        "balanceAmount": float(max(Decimal("0"), calculated_total_amount - paid_amount)),
        "sourceDealId": str(source_deal_id or (row.deal_id if row else "") or "").strip(),
        "convertedToInvoice": bool(payload.get("converted_to_invoice") or payload.get("convertedToInvoice")),
        "convertedInvoiceId": str(payload.get("converted_invoice_id") or payload.get("convertedInvoiceId") or "").strip(),
    }
    if resolved_method == "PATCH":
        row.customer_name = customer_name[:180]
        row.company = str(payload.get("company") or "").strip()[:180]
        row.phone = str(payload.get("phone") or "").strip()[:40]
        row.amount = subtotal_amount
        row.products = products_payload
        row.quantity = quantity
        row.price = price
        row.tax = tax
        row.total_amount = calculated_total_amount
        row.payment_status = payment_status
        row.paid_amount = float(paid_amount)
        if can_edit_payment_details:
            row.payment_mode = str(payload.get("payment_mode") or payload.get("paymentMode") or "").strip()[:50]
            row.payment_date = parse_date(str(payload.get("payment_date") or payload.get("paymentDate") or "").strip() or "")
            row.transaction_id = str(payload.get("transaction_id") or payload.get("transactionId") or "").strip()[:100]
        row.status = str(payload.get("status") or row.status or "Pending").strip()[:20] or "Pending"
        row.assigned_user = assigned_user
        if deal:
            row.deal = deal
        row.updated_by = request.user
        row.save()
        return JsonResponse({"sales_order": _serialize_crm_sales_order(row)})

    order_id = _crm_resolve_unique_order_id(org, payload.get("order_id") or payload.get("orderId"))
    try:
        row = CrmSalesOrder.objects.create(
            organization=org,
            crm_reference_id=crm_reference_id,
            deal=deal,
            order_id=order_id,
            customer_name=customer_name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            phone=str(payload.get("phone") or "").strip()[:40],
            amount=subtotal_amount,
            products=products_payload,
            quantity=quantity,
            price=price,
            tax=tax,
            total_amount=calculated_total_amount,
            payment_status=payment_status,
            paid_amount=float(paid_amount),
            payment_mode=str(payload.get("payment_mode") or payload.get("paymentMode") or "").strip()[:50] if can_edit_payment_details else "",
            payment_date=parse_date(str(payload.get("payment_date") or payload.get("paymentDate") or "").strip() or "") if can_edit_payment_details else None,
            transaction_id=str(payload.get("transaction_id") or payload.get("transactionId") or "").strip()[:100] if can_edit_payment_details else "",
            status=str(payload.get("status") or "Pending").strip()[:20] or "Pending",
            assigned_user=assigned_user,
            created_by=request.user,
            updated_by=request.user,
        )
    except IntegrityError:
        row = CrmSalesOrder.objects.create(
            organization=org,
            crm_reference_id=crm_reference_id,
            deal=deal,
            order_id=_crm_resolve_unique_order_id(org, ""),
            customer_name=customer_name[:180],
            company=str(payload.get("company") or "").strip()[:180],
            phone=str(payload.get("phone") or "").strip()[:40],
            amount=subtotal_amount,
            products=products_payload,
            quantity=quantity,
            price=price,
            tax=tax,
            total_amount=calculated_total_amount,
            payment_status=payment_status,
            paid_amount=float(paid_amount),
            payment_mode=str(payload.get("payment_mode") or payload.get("paymentMode") or "").strip()[:50] if can_edit_payment_details else "",
            payment_date=parse_date(str(payload.get("payment_date") or payload.get("paymentDate") or "").strip() or "") if can_edit_payment_details else None,
            transaction_id=str(payload.get("transaction_id") or payload.get("transactionId") or "").strip()[:100] if can_edit_payment_details else "",
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
    deal = CrmDeal.objects.filter(organization=org, id=deal_id, is_deleted=False).select_related("lead").first()
    if not deal:
        return JsonResponse({"detail": "deal_not_found"}, status=404)
    if not _crm_can_access_row(request.user, org, deal):
        return JsonResponse({"detail": "forbidden"}, status=403)
    if str(deal.stage or "").strip().lower() != "won" and str(deal.status or "").strip().lower() != "won":
        return JsonResponse({"detail": "deal_not_won"}, status=400)
    existing = CrmSalesOrder.objects.filter(organization=org, deal=deal, is_deleted=False).first()
    if existing:
        if not str(existing.crm_reference_id or "").strip():
            existing.crm_reference_id = str(deal.crm_reference_id or getattr(deal.lead, "crm_reference_id", "") or "").strip()[:32]
            existing.save(update_fields=["crm_reference_id", "updated_at"])
        return JsonResponse({"sales_order": _serialize_crm_sales_order(existing), "already_converted": True})
    with transaction.atomic():
        amount = _crm_to_decimal(deal.deal_value)
        customer_name = str(deal.lead.lead_name if deal.lead_id else deal.deal_name).strip()[:180]
        row = CrmSalesOrder.objects.create(
            organization=org,
            deal=deal,
            crm_reference_id=str(deal.crm_reference_id or getattr(deal.lead, "crm_reference_id", "") or "").strip()[:32],
            order_id=_crm_order_id(org),
            customer_name=customer_name or "Customer",
            company=str(deal.company or "").strip()[:180],
            phone=str(deal.phone or "").strip()[:40],
            amount=amount,
            quantity=1,
            price=amount,
            tax=Decimal("0"),
            total_amount=amount,
            payment_status="pending",
            paid_amount=0,
            payment_mode="",
            payment_date=None,
            transaction_id="",
            status="Pending",
            assigned_user=deal.assigned_user,
            created_by=request.user,
            updated_by=request.user,
        )
    return JsonResponse({"sales_order": _serialize_crm_sales_order(row)})
