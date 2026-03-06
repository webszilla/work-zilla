from django.shortcuts import redirect
from django.contrib import messages
from django.contrib.messages import get_messages
from django.utils import timezone
from datetime import timedelta
import json
import re
from django.contrib.auth import logout
from django.http import HttpResponseForbidden, JsonResponse
from core.models import Organization, Subscription, DeletedAccount, UserProfile, OrganizationSettings
from core.timezone_utils import normalize_timezone
from core.subscription_utils import get_effective_end_date, is_free_plan, is_subscription_active, maybe_expire_subscription

EXEMPT_URLS = [
    "/select-organization/",
    "/admin/",
    "/dashboard/plans/",
    "/dashboard/subscribe/",
    "/dashboard/bank-transfer/",
    "/dashboard/billing/",
    "/app/",
    "/app/plans",
    "/app/bank-transfer",
    "/my-account/bank-transfer",
    "/my-account/bank-transfer/",
    "/my-account/billing/",
    "/api/auth/me",
    "/api/dashboard/plans",
    "/api/dashboard/billing-profile",
    "/api/dashboard/bank-transfer",
    "/api/dashboard/billing",
    "/accounts/logout/",
    "/accounts/login/",
    "/signup/",
    "/pricing/",
]

LOGIN_PATHS = [
    "/accounts/login/",
    "/admin/login/",
    "/hr-login/",
]
VALIDATED_API_PREFIXES = (
    "/api/dashboard/",
    "/api/saas-admin/",
    "/api/business-autopilot/",
    "/api/whatsapp-automation/",
    "/api/storage/",
    "/api/imposition/",
    "/api/backups/",
    "/api/media-library/",
)

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
URL_RE = re.compile(r"^(https?://|www\.|[a-z0-9][a-z0-9.-]*\.[a-z]{2,})(/.*)?$", re.IGNORECASE)
PHONE_RE = re.compile(r"^\+?\d{1,20}$")
HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _semantic_limit(key_name):
    text = str(key_name or "").strip().lower()
    if not text:
        return 255
    if any(k in text for k in ("slug",)):
        return 80
    if any(k in text for k in ("search", "query")):
        return 80
    if any(k in text for k in ("title", "name", "subject", "label", "category")):
        return 120
    if "email" in text:
        return 120
    if any(k in text for k in ("website", "url", "domain", "link")):
        return 255
    if any(k in text for k in ("phone", "mobile", "whatsapp", "postal", "pincode", "zip")):
        return 20
    if any(k in text for k in ("price", "amount", "cost", "qty", "quantity")):
        return 32
    if any(k in text for k in ("state", "city", "country")):
        return 80
    if "address" in text:
        return 260
    if any(k in text for k in ("description", "message", "note", "content", "bio", "about", "highlight")):
        return 1000
    if any(k in text for k in ("prompt", "instruction", "template", "script")):
        return 4000
    if any(k in text for k in ("password", "secret", "token", "key")):
        return 255
    if any(k in text for k in ("image", "logo", "banner", "avatar", "base64", "file_data", "_data")):
        return 2_000_000
    return 255


def _validate_string_field(field_name, value):
    raw = str(value or "")
    max_len = _semantic_limit(field_name)
    if len(raw) > max_len:
        return f"Must be {max_len} characters or fewer."
    trimmed = raw.strip()
    if not trimmed:
        return None

    key = str(field_name or "").lower()
    if "email" in key and not EMAIL_RE.match(trimmed):
        return "Enter a valid email address."
    if any(k in key for k in ("website", "url", "domain", "link")):
        if trimmed not in {"#", "/"} and not URL_RE.match(trimmed):
            return "Enter a valid URL or domain."
    if any(k in key for k in ("phone", "mobile", "whatsapp", "postal", "pincode", "zip")):
        if not PHONE_RE.match(trimmed):
            return "Use digits only (optional leading +)."
    if "color" in key and not HEX_COLOR_RE.match(trimmed):
        return "Use a valid HEX color like #22c55e."
    return None


def _iter_payload_strings(payload, prefix=""):
    if isinstance(payload, dict):
        for key, value in payload.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            yield from _iter_payload_strings(value, next_prefix)
        return
    if isinstance(payload, list):
        for idx, value in enumerate(payload):
            next_prefix = f"{prefix}[{idx}]"
            yield from _iter_payload_strings(value, next_prefix)
        return
    if isinstance(payload, str):
        field_name = prefix.split(".")[-1].split("[")[0]
        yield prefix, field_name, payload


class LoginSessionGuardMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            for path in LOGIN_PATHS:
                if request.path.startswith(path):
                    logout(request)
                    break
        return self.get_response(request)


class OrganizationRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith("/admin/login"):
            list(get_messages(request))

        if not request.user.is_authenticated:
            return self.get_response(request)

        profile = UserProfile.objects.filter(user=request.user).first()
        if profile and profile.role == "ai_chatbot_agent":
            path = request.path
            if path == "/app" or path == "/app/":
                return redirect("/app/ai-chatbot/")
            if (
                path.startswith("/app/work-suite")
                or path.startswith("/app/worksuite")
                or path.startswith("/app/monitor")
            ):
                return redirect("/app/ai-chatbot/")
            if (
                path.startswith("/api/dashboard/")
                or path.startswith("/api/activity/")
                or path.startswith("/api/org/settings")
                or path.startswith("/api/screenshot/")
            ):
                return JsonResponse({"detail": "forbidden"}, status=403)

        for url in EXEMPT_URLS:
            if request.path.startswith(url):
                return self.get_response(request)

        if not request.session.get("active_org_id"):
            if Organization.objects.filter(owner=request.user).exists():
                org = Organization.objects.filter(owner=request.user).first()
                if org:
                    request.session["active_org_id"] = org.id
                    return self.get_response(request)
                return redirect("/select-organization/")

        org = None
        active_org_id = request.session.get("active_org_id")
        if active_org_id:
            org = Organization.objects.filter(id=active_org_id).first()
        if not org:
            org = Organization.objects.filter(owner=request.user).first()

        if org:
            latest_sub = (
                Subscription.objects.filter(organization=org)
                .order_by("-start_date")
                .first()
            )
            if latest_sub:
                effective_end = get_effective_end_date(latest_sub)
                cutoff = timezone.now() - timedelta(days=15)
                if effective_end and effective_end < cutoff:
                    owner = org.owner
                    DeletedAccount.objects.create(
                        organization_name=org.name,
                        owner_username=owner.username if owner else "-",
                        owner_email=owner.email if owner else "",
                        reason="This account not renewed after expired."
                    )
                    org.delete()
                    if owner and owner == request.user:
                        logout(request)
                    if owner:
                        owner.delete()
                    messages.warning(request, "Account removed due to plan expiry.")
                    return redirect("/accounts/login/")

            sub = (
                Subscription.objects.filter(organization=org, status="active")
                .order_by("-start_date")
                .first()
            )
            expired_free_plan = False
            if sub and not is_subscription_active(sub):
                expired_free_plan = is_free_plan(sub.plan)
                maybe_expire_subscription(sub)
                sub = None
            if sub:
                request.session.pop("plan_warning_shown", None)
            else:
                if request.path.startswith("/dashboard/plans/"):
                    request.session.pop("plan_warning_shown", None)
                else:
                    if not request.session.get("plan_warning_shown"):
                        if expired_free_plan:
                            messages.warning(request, "Free plan expired. Please choose a paid plan.")
                        else:
                            messages.warning(request, "Please select a plan to continue.")
                        request.session["plan_warning_shown"] = True
                    return redirect("/app/plans/")

        return self.get_response(request)


class HrReadOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            profile = UserProfile.objects.filter(user=request.user).first()
            if profile and profile.role == "hr_view":
                if request.method not in ("GET", "HEAD", "OPTIONS"):
                    if request.path.startswith("/api/"):
                        return JsonResponse({"error": "read_only"}, status=403)
                    return HttpResponseForbidden("Read-only access.")
        return self.get_response(request)


class OrganizationTimezoneMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        timezone.deactivate()

        if request.user.is_authenticated:
            profile = UserProfile.objects.filter(user=request.user).select_related("organization").first()
            org = None
            if request.user.is_superuser or (profile and profile.role in ("superadmin", "super_admin")):
                active_org_id = request.session.get("active_org_id")
                if active_org_id:
                    org = Organization.objects.filter(id=active_org_id).first()
            elif profile and profile.role == "dealer":
                org = None
            elif profile and profile.organization:
                org = profile.organization
            else:
                org = Organization.objects.filter(owner=request.user).first()

            if org:
                org_settings = OrganizationSettings.objects.filter(organization=org).only("org_timezone").first()
                if org_settings and org_settings.org_timezone:
                    timezone.activate(normalize_timezone(org_settings.org_timezone))

        return self.get_response(request)


class GlobalPayloadValidationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        method = (request.method or "").upper()
        content_type = (request.content_type or "").lower()
        path = request.path or ""
        if (
            method in {"POST", "PUT", "PATCH"}
            and any(path.startswith(prefix) for prefix in VALIDATED_API_PREFIXES)
            and "application/json" in content_type
        ):
            try:
                payload = json.loads(request.body.decode("utf-8") or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = None
            if isinstance(payload, (dict, list)):
                for field_path, field_name, value in _iter_payload_strings(payload):
                    error = _validate_string_field(field_name, value)
                    if error:
                        return JsonResponse(
                            {
                                "error": "validation_error",
                                "field": field_path,
                                "message": error,
                            },
                            status=400,
                        )
        return self.get_response(request)
