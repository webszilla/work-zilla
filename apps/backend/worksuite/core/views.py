from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from rest_framework.response import Response
from rest_framework.decorators import api_view, authentication_classes, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from django.core.files.base import ContentFile
from django.core.cache import cache
from django.core.paginator import Paginator
from django.contrib import messages
from django.utils import timezone
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db.models import Q
from django.utils.text import slugify
from django.utils.dateparse import parse_datetime
from fnmatch import fnmatchcase
from io import BytesIO
import re
import time
from urllib.parse import urlparse
from dashboard.views import get_active_org
from core.subscription_utils import (
    has_active_subscription_for_org,
    is_subscription_active,
    maybe_expire_subscription,
    normalize_subscription_end_date,
)
from core.observability import log_event
from core.notification_emails import notify_account_limit_reached
from .models import *
from .serializers import *
import datetime

try:
    from PIL import Image, ImageFilter
except ImportError:
    Image = None
    ImageFilter = None

DEFAULT_PRIVACY_KEYWORDS = [
    "netbank",
    "netbanking",
    "internet banking",
    "banking",
    "bank",
    "payment gateway",
    "upi",
    "card payment",
    "account login",
    "sign in",
    "mail inbox",
    "webmail",
    "roundcube",
    "loan account",
    "credit card payment",
    "beneficiary transfer",
    "income tax portal",
    "payslip",
    "salary slip",
    "confidential",
]

PASSWORD_FIELD_KEYWORDS = [
    "password",
    "login",
    "sign in",
    "signin",
]
OTP_FIELD_KEYWORDS = [
    "otp",
    "one time password",
    "verification code",
]
CARD_FIELD_KEYWORDS = [
    "card number",
    "cvv",
    "payment",
    "checkout",
    "upi",
    "gateway",
]
EMAIL_INBOX_KEYWORDS = [
    "inbox",
    "webmail",
    "roundcube",
    "gmail",
    "outlook",
    "mailbox",
]


# ========================== API PART ==========================

def _get_org_from_company_key(request, allow_inactive=False):
    header_device_id = request.headers.get("X-Device-Id")
    device_id = header_device_id or request.data.get("device_id") or request.query_params.get("device_id") or request.POST.get("device_id")
    employee_id = request.data.get("employee") or request.query_params.get("employee") or request.POST.get("employee")
    header_company_key = request.headers.get("X-Company-Key")
    company_key = header_company_key or request.data.get("company_key") or request.query_params.get("company_key") or request.POST.get("company_key")

    # If company key is explicitly provided, prefer it over stale employee/device bindings.
    if company_key:
        org = Organization.objects.filter(company_key=company_key).first()
        if not org:
            return None, Response({"error": "Invalid company key"}, status=401)
        if employee_id:
            employee = Employee.objects.filter(id=employee_id).select_related("org").first()
            if not employee or employee.org_id != org.id:
                return None, Response({"error": "invalid_employee"}, status=401)
            if device_id and employee.device_id and device_id != employee.device_id:
                return None, Response({"error": "invalid_device"}, status=401)
        elif device_id:
            employee = Employee.objects.filter(device_id=device_id).select_related("org").first()
            if employee and employee.org_id != org.id:
                return None, Response({"error": "invalid_device"}, status=401)
        if not allow_inactive and not has_active_subscription_for_org(org, "monitor"):
            return None, Response({"error": "subscription_required"}, status=403)
        return org, None

    if employee_id:
        employee = Employee.objects.filter(id=employee_id).select_related("org").first()
        if employee and employee.org:
            if device_id and employee.device_id and device_id != employee.device_id:
                return None, Response({"error": "invalid_device"}, status=401)
            if not allow_inactive and not has_active_subscription_for_org(employee.org, "monitor"):
                return None, Response({"error": "subscription_required"}, status=403)
            return employee.org, None
    if device_id:
        employee = Employee.objects.filter(device_id=device_id).select_related("org").first()
        if employee and employee.org:
            if not allow_inactive and not has_active_subscription_for_org(employee.org, "monitor"):
                return None, Response({"error": "subscription_required"}, status=403)
            return employee.org, None
    if not company_key:
        return None, Response({"error": "company_key is required"}, status=401)
    org = Organization.objects.filter(company_key=company_key).first()
    if not org:
        return None, Response({"error": "Invalid company key"}, status=401)
    if not allow_inactive and not has_active_subscription_for_org(org, "monitor"):
        return None, Response({"error": "subscription_required"}, status=403)
    return org, None


def _throttle_identity(request):
    header_device_id = request.headers.get("X-Device-Id")
    device_id = (
        header_device_id
        or request.data.get("device_id")
        or request.query_params.get("device_id")
        or request.POST.get("device_id")
    )
    if device_id:
        return f"device:{device_id}"
    header_company_key = request.headers.get("X-Company-Key")
    company_key = (
        header_company_key
        or request.data.get("company_key")
        or request.query_params.get("company_key")
        or request.POST.get("company_key")
    )
    if company_key:
        return f"company:{company_key}"
    return f"ip:{request.META.get('REMOTE_ADDR', 'unknown')}"


def _throttle_identity_kind(request):
    header_device_id = request.headers.get("X-Device-Id")
    device_id = (
        header_device_id
        or request.data.get("device_id")
        or request.query_params.get("device_id")
        or request.POST.get("device_id")
    )
    if device_id:
        return "device"
    header_company_key = request.headers.get("X-Company-Key")
    company_key = (
        header_company_key
        or request.data.get("company_key")
        or request.query_params.get("company_key")
        or request.POST.get("company_key")
    )
    if company_key:
        return "company"
    return "ip"


def _check_rate_limit(request, scope, limit, window_seconds):
    identity = _throttle_identity(request)
    key = f"throttle:{scope}:{identity}"
    now = time.time()
    data = cache.get(key)
    if not data:
        cache.set(key, (1, now), timeout=window_seconds)
        return None
    count, start = data
    if now - start >= window_seconds:
        cache.set(key, (1, now), timeout=window_seconds)
        return None
    if count >= limit:
        retry_after = max(1, int(window_seconds - (now - start)))
        return Response({"error": "rate_limited", "retry_after": retry_after}, status=429)
    cache.set(key, (count + 1, start), timeout=window_seconds)
    return None

# Rate limits are per device/company/IP identity.
ORG_SETTINGS_LIMIT = 30
ORG_SETTINGS_WINDOW = 300
ACTIVITY_UPLOAD_LIMIT = 300
ACTIVITY_UPLOAD_WINDOW = 60
SCREENSHOT_UPLOAD_LIMIT = 60
SCREENSHOT_UPLOAD_WINDOW = 60

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register_org(request):
    serializer = OrgSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def monitor_stop_event(request):
    start_ts = time.monotonic()
    try:
        org, error = _get_org_from_company_key(request, allow_inactive=True)
        if error:
            log_event(
                "agent_monitor_stop",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "reason": getattr(error, "data", {}).get("error", "auth_failed"),
                    "http_status": error.status_code,
                },
                request=request,
            )
            return error

        device_id = (
            request.headers.get("X-Device-Id")
            or request.data.get("device_id")
            or request.query_params.get("device_id")
            or request.POST.get("device_id")
        )
        employee_id = request.data.get("employee_id") or request.POST.get("employee_id")
        reason = (request.data.get("reason") or request.POST.get("reason") or "").strip()
        stopped_at_raw = request.data.get("stopped_at") or request.POST.get("stopped_at")

        employee = None
        if employee_id:
            employee = Employee.objects.filter(id=employee_id, org=org).first()
        if not employee and device_id:
            employee = Employee.objects.filter(device_id=device_id, org=org).first()
        if not employee:
            log_event(
                "agent_monitor_stop",
                status="error",
                org=org,
                device_id=device_id or "",
                meta={"reason": "invalid_employee"},
                request=request,
            )
            return Response({"error": "Invalid employee"}, status=400)

        stopped_at = None
        if stopped_at_raw:
            stopped_at = parse_datetime(stopped_at_raw)
            if stopped_at and timezone.is_naive(stopped_at):
                stopped_at = timezone.make_aware(
                    stopped_at,
                    timezone.get_current_timezone()
                )
        if not stopped_at:
            stopped_at = timezone.now()

        MonitorStopEvent.objects.create(
            employee=employee,
            reason=reason,
            stopped_at=stopped_at
        )

        log_event(
            "agent_monitor_stop",
            status="success",
            org=org,
            device_id=device_id or "",
            employee_id=employee.id,
            meta={
                "duration_ms": int((time.monotonic() - start_ts) * 1000),
            },
            request=request,
        )
        return Response({"message": "Work Suite stop recorded"})
    except Exception as e:
        log_event(
            "agent_monitor_stop",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={"reason": "exception", "detail": str(e)},
            request=request,
        )
        return Response({"error": str(e)}, status=400)


def get_screenshot_interval_seconds(org):
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    minutes = settings_obj.screenshot_interval_minutes or 5
    sub = Subscription.objects.filter(organization=org, status="active").order_by("-start_date").first()
    if sub:
        normalize_subscription_end_date(sub)
        if not is_subscription_active(sub):
            maybe_expire_subscription(sub)
            sub = None
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval and minutes < min_interval:
        minutes = min_interval
        settings_obj.screenshot_interval_minutes = minutes
        settings_obj.save()
    return minutes * 60


def _expand_url_targets(value):
    value = (value or "").strip()
    if not value:
        return []
    targets = [value]
    parsed = urlparse(value if "://" in value else f"https://{value}")
    if parsed.netloc:
        tail = parsed.netloc + parsed.path
        if parsed.query:
            tail = f"{tail}?{parsed.query}"
        targets.append(tail)
        targets.append(parsed.netloc)
    return targets


def _normalize_url_value(value):
    value = (value or "").strip().lower()
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else f"https://{value}")
    netloc = (parsed.netloc or "").lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path or ""
    tail = f"{netloc}{path}"
    if parsed.query:
        tail = f"{tail}?{parsed.query}"
    return tail


def _compact_alnum(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _looks_like_url_pattern(value):
    value = (value or "").strip().lower()
    if not value:
        return False
    return "://" in value or value.startswith("www.") or "." in value


def _url_keyword_from_pattern(pattern):
    common_tlds = {
        "com",
        "net",
        "org",
        "gov",
        "edu",
        "co",
        "in",
        "uk",
        "us",
        "au",
        "io",
        "app",
        "bank",
    }
    norm = _normalize_url_value(pattern)
    if not norm:
        return ""
    host = norm.split("/", 1)[0].lstrip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = [part for part in host.split(".") if part]
    if not parts:
        return ""
    trimmed = parts[:]
    while len(trimmed) > 1 and trimmed[-1] in common_tlds:
        trimmed.pop()
    keyword = "".join(trimmed) if trimmed else "".join(parts)
    return _compact_alnum(keyword)


def _url_keyword_matches(pattern, title, app_name):
    keyword = _url_keyword_from_pattern(pattern)
    if not keyword:
        return False
    title_key = _compact_alnum(title)
    app_key = _compact_alnum(app_name)
    return (title_key and keyword in title_key) or (app_key and keyword in app_key)


def _url_pattern_matches(pattern, url_targets):
    pattern = (pattern or "").strip().lower()
    if not pattern or not url_targets:
        return False
    norm_pattern = _normalize_url_value(pattern)
    if not norm_pattern:
        return False
    wildcard_chars = ("*", "?", "[")
    has_wildcard = any(ch in norm_pattern for ch in wildcard_chars)
    pattern_candidates = {norm_pattern}
    if not has_wildcard:
        parsed = urlparse(pattern if "://" in pattern else f"https://{pattern}")
        path = parsed.path or ""
        host = (parsed.netloc or "").lower()
        if host.startswith("www."):
            host = host[4:]
        if norm_pattern.endswith("/"):
            pattern_candidates.add(norm_pattern.rstrip("/"))
        else:
            pattern_candidates.add(f"{norm_pattern}/")
        if path in ("", "/"):
            pattern_candidates.add(f"{norm_pattern.rstrip('/') }/*")
        if host:
            host_norm = host + (path or "")
            pattern_candidates.add(host_norm)
            if path in ("", "/"):
                pattern_candidates.add(f"*.{host}/*")
                pattern_candidates.add(f"*.{host}")
            else:
                pattern_candidates.add(f"*.{host}{path}")
    target_candidates = set()
    for target in url_targets:
        norm_target = _normalize_url_value(target)
        if not norm_target:
            continue
        target_candidates.add(norm_target)
        if norm_target.endswith("/"):
            target_candidates.add(norm_target.rstrip("/"))
        else:
            target_candidates.add(f"{norm_target}/")
    for pat in pattern_candidates:
        for target in target_candidates:
            if target and fnmatchcase(target, pat):
                return True
    return False


def _is_browser_app(app_name):
    if not app_name:
        return False
    browsers = {
        "chrome.exe",
        "chrome",
        "msedge.exe",
        "msedge",
        "brave.exe",
        "brave",
        "firefox.exe",
        "firefox",
        "opera.exe",
        "opera",
        "iexplore.exe",
        "iexplore",
        "google chrome",
        "microsoft edge",
        "brave browser",
        "mozilla firefox",
        "safari",
    }
    return app_name.strip().lower() in browsers


def _is_monitor_placeholder(app_name, window_title):
    app = (app_name or "").strip().lower()
    title = (window_title or "").strip().lower()
    return app in {"", "work zilla agent"} and title in {"", "monitor active"}


def _normalize_keywords(value):
    keywords = []
    for raw_line in (value or "").splitlines():
        line = raw_line.strip().lower()
        if not line or line.startswith("#"):
            continue
        keywords.append(line)
    return keywords


def _keyword_match(text, keywords):
    if not text or not keywords:
        return False
    target = text.lower()
    return any(keyword and keyword in target for keyword in keywords)


def _should_blur_keywords(url, window_title, keywords):
    return _keyword_match(url, keywords) or _keyword_match(window_title, keywords)


def _should_blur_auto(settings_obj, url, window_title):
    if not settings_obj:
        return False
    title = window_title or ""
    page = url or ""
    if settings_obj.auto_blur_password_fields:
        if _should_blur_keywords(page, title, PASSWORD_FIELD_KEYWORDS):
            return True
    if settings_obj.auto_blur_otp_fields:
        if _should_blur_keywords(page, title, OTP_FIELD_KEYWORDS):
            return True
    if settings_obj.auto_blur_card_fields:
        if _should_blur_keywords(page, title, CARD_FIELD_KEYWORDS):
            return True
    if settings_obj.auto_blur_email_inbox:
        if _should_blur_keywords(page, title, EMAIL_INBOX_KEYWORDS):
            return True
    return False


def _should_blur_screenshot(patterns, url, app_name, window_title):
    if not patterns:
        return False
    url_targets = [item.lower() for item in _expand_url_targets(url)] if _is_browser_app(app_name) else []
    app_target = (app_name or "").strip().lower()
    title_target = (window_title or "").strip().lower()

    for raw_line in patterns.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        pattern = line.lower()
        target_type = None
        for prefix in ("url:", "app:", "title:", "window:"):
            if pattern.startswith(prefix):
                target_type = prefix[:-1]
                pattern = pattern[len(prefix):].strip()
                break
        if not pattern:
            continue
        if target_type == "url":
            targets = url_targets
            if not any(targets):
                targets = []
                if title_target:
                    targets.append(title_target)
                if app_target:
                    targets.append(app_target)
        elif target_type == "app":
            targets = [app_target]
        elif target_type in ("title", "window"):
            targets = [title_target]
        else:
            targets = url_targets[:]
            if app_target:
                targets.append(app_target)
            if title_target:
                targets.append(title_target)
        for target in targets:
            if target and fnmatchcase(target, pattern):
                return True
        if target_type != "app" and target_type not in ("title", "window"):
            if _url_pattern_matches(pattern, url_targets):
                return True
            if not url_targets and _looks_like_url_pattern(pattern):
                if _url_keyword_matches(pattern, title_target, app_target):
                    return True
    return False


def _recent_activity_match(employee, patterns, reference_time=None, window_seconds=180, max_rows=200):
    if not patterns or not employee:
        return False
    ref_time = reference_time or timezone.now()
    cutoff = ref_time - datetime.timedelta(seconds=window_seconds)
    upper = ref_time + datetime.timedelta(seconds=90)
    activities = (
        Activity.objects
        .filter(employee=employee, end_time__gte=cutoff, end_time__lte=upper)
        .order_by("-end_time", "-start_time")[:max_rows]
    )
    for activity in activities:
        if _should_blur_screenshot(
            patterns,
            activity.url or "",
            activity.app_name or "",
            activity.window_title or "",
        ):
            return True
    return False


def _blur_upload_image(image_file, radius=12):
    if Image is None or ImageFilter is None:
        return None
    try:
        image_file.seek(0)
        image = Image.open(image_file)
        image_format = image.format or "PNG"
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        blurred = image.filter(ImageFilter.GaussianBlur(radius=radius))
        buffer = BytesIO()
        save_kwargs = {}
        if image_format.upper() in ("JPEG", "JPG"):
            save_kwargs["quality"] = 60
            save_kwargs["optimize"] = True
        blurred.save(buffer, format=image_format, **save_kwargs)
        return ContentFile(buffer.getvalue(), name=image_file.name)
    except Exception:
        return None


def _build_screenshot_filename(employee, captured_at, original_name):
    timestamp = timezone.localtime(captured_at or timezone.now())
    date_part = timestamp.strftime("%d-%m-%Y")
    time_part = timestamp.strftime("%H-%M")
    company_key = slugify(employee.org.company_key or "company")
    employee_name = slugify(employee.name or "employee")
    pc_name = slugify(employee.pc_name or "pc")
    ext = ""
    if original_name and "." in original_name:
        ext = original_name.rsplit(".", 1)[-1].lower()
    if not ext:
        ext = "jpg"
    return f"{date_part}-{company_key}-{employee_name}-{pc_name}-{time_part}.{ext}"


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register_employee(request):
    try:
        company_key = request.data.get("company_key")
        employee_code = request.data.get("employee_code")
        pc_name = request.data.get("pc_name")
        device_id = request.data.get("device_id")
        name = request.data.get("name")

        if not company_key:
            return Response({"error": "company_key is required"}, status=400)

        org = Organization.objects.filter(company_key=company_key).first()

        if not org:
            return Response({"error": "Invalid company key"}, status=400)

        product_filter = Q(plan__product__slug="monitor") | Q(plan__product__slug="worksuite") | Q(plan__product__isnull=True)
        sub = (
            Subscription.objects
            .filter(
                organization=org,
                status__in=("active", "trialing"),
            )
            .filter(product_filter)
            .order_by("-start_date")
            .first()
        )

        if sub:
            normalize_subscription_end_date(sub)
            if not is_subscription_active(sub):
                maybe_expire_subscription(sub)
                sub = None

        if not sub:
            return Response({"error": "No active subscription"}, status=403)

        if device_id:
            existing_any = Employee.objects.filter(device_id=device_id).first()
            if existing_any:
                updated = False
                if existing_any.org_id != org.id:
                    existing_any.org = org
                    updated = True
                if name and existing_any.name != name:
                    existing_any.name = name
                    updated = True
                if pc_name and existing_any.pc_name != pc_name:
                    existing_any.pc_name = pc_name
                    updated = True
                if updated:
                    existing_any.save()
                return Response({
                    "message": "Employee Registered Successfully",
                    "employee_id": existing_any.id,
                    "data": EmployeeSerializer(existing_any).data,
                    "screenshot_interval_seconds": get_screenshot_interval_seconds(org)
                })

        if device_id:
            existing = Employee.objects.filter(
                org=org,
                device_id=device_id
            ).first()
            if existing:
                updated = False
                if name and existing.name != name:
                    existing.name = name
                    updated = True
                if pc_name and existing.pc_name != pc_name:
                    existing.pc_name = pc_name
                    updated = True
                if updated:
                    existing.save()
                return Response({
                    "message": "Employee Registered Successfully",
                    "employee_id": existing.id,
                    "data": EmployeeSerializer(existing).data,
                    "screenshot_interval_seconds": get_screenshot_interval_seconds(org)
                })

        if employee_code:
            existing = Employee.objects.filter(
                org=org,
                device_id=employee_code
            ).first()
            if not existing:
                existing = Employee.objects.filter(
                    org=org,
                    name__iexact=employee_code
                ).first()
            if existing:
                device_id = request.data.get("device_id")
                updated = False
                if device_id and existing.device_id != device_id:
                    existing.device_id = device_id
                    updated = True
                if name and existing.name != name:
                    existing.name = name
                    updated = True
                if pc_name and existing.pc_name != pc_name:
                    existing.pc_name = pc_name
                    updated = True
                if updated:
                    existing.save()
                return Response({
                    "message": "Employee Registered Successfully",
                    "employee_id": existing.id,
                    "data": EmployeeSerializer(existing).data,
                    "screenshot_interval_seconds": get_screenshot_interval_seconds(org)
                })

        existing = None
        if pc_name and name:
            existing = Employee.objects.filter(
                org=org,
                pc_name__iexact=pc_name,
                name__iexact=name
            ).first()
        elif pc_name:
            existing = Employee.objects.filter(
                org=org,
                pc_name__iexact=pc_name
            ).first()
        elif name:
            existing = Employee.objects.filter(
                org=org,
                name__iexact=name
            ).first()

        if existing:
            updated = False
            if device_id and existing.device_id != device_id:
                if Employee.objects.filter(device_id=device_id).exclude(id=existing.id).exists():
                    return Response({"error": "Device ID already exists"}, status=400)
                existing.device_id = device_id
                updated = True
            if name and existing.name != name:
                existing.name = name
                updated = True
            if pc_name and existing.pc_name != pc_name:
                existing.pc_name = pc_name
                updated = True
            if updated:
                existing.save()
            return Response({
                "message": "Employee Registered Successfully",
                "employee_id": existing.id,
                "data": EmployeeSerializer(existing).data,
                "screenshot_interval_seconds": get_screenshot_interval_seconds(org)
            })

        current_count = Employee.objects.filter(org=org).count()
        if sub and sub.plan:
            if sub.plan.employee_limit == 0:
                allowed = 0
            else:
                allowed = sub.plan.employee_limit + (sub.addon_count or 0)
        else:
            allowed = 0
        if allowed and current_count >= allowed:
            owner = org.owner
            if owner:
                notify_account_limit_reached(
                    owner,
                    limit=allowed,
                    current_count=current_count,
                    label="employees",
                )
            return Response({"error": "Employee limit reached"}, status=403)

        data = request.data.copy()
        data["org"] = org.id
        data.pop("company_key", None)
        data.pop("employee_code", None)

        serializer = EmployeeSerializer(data=data)

        if serializer.is_valid():
            employee = serializer.save()
            return Response({
                "message": "Employee Registered Successfully",
                "employee_id": serializer.data.get("id"),
                "data": serializer.data,
                "screenshot_interval_seconds": get_screenshot_interval_seconds(org)
            })

        return Response(serializer.errors, status=400)

    except Exception as e:
        return Response({"error": str(e)}, status=400)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def upload_activity(request):
    start_ts = time.monotonic()
    try:
        rate_limited = _check_rate_limit(
            request,
            "activity_upload",
            ACTIVITY_UPLOAD_LIMIT,
            ACTIVITY_UPLOAD_WINDOW,
        )
        if rate_limited:
            log_event(
                "agent_rate_limited",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "scope": "activity_upload",
                    "identity": _throttle_identity_kind(request),
                    "limit": ACTIVITY_UPLOAD_LIMIT,
                    "window_seconds": ACTIVITY_UPLOAD_WINDOW,
                },
                request=request,
            )
            return rate_limited
        org, error = _get_org_from_company_key(request)
        if error:
            log_event(
                "agent_activity_upload",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "reason": getattr(error, "data", {}).get("error", "auth_failed"),
                    "http_status": error.status_code,
                },
                request=request,
            )
            return error
        header_device_id = request.headers.get("X-Device-Id")
        request_device_id = header_device_id or request.data.get("device_id") or request.query_params.get("device_id") or request.POST.get("device_id")
        employee_id = request.data.get("employee")
        pc_time = request.data.get("pc_time")

        if not employee_id:
            log_event(
                "agent_activity_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                meta={"reason": "employee_required"},
                request=request,
            )
            return Response({"error": "employee is required"}, status=400)

        employee = Employee.objects.filter(id=employee_id, org=org).first()
        if not employee:
            log_event(
                "agent_activity_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                employee_id=employee_id,
                meta={"reason": "invalid_employee"},
                request=request,
            )
            return Response({"error": "Invalid employee"}, status=400)
        if request_device_id and employee.device_id != request_device_id:
            log_event(
                "agent_activity_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                employee_id=employee_id,
                meta={"reason": "invalid_device"},
                request=request,
            )
            return Response({"error": "Invalid device"}, status=400)

        # Force bind employee org and normalize timestamps to server time
        data = request.data.copy()
        data["employee"] = employee.id
        now = timezone.now()
        activity_time = now
        if pc_time:
            parsed = parse_datetime(pc_time)
            if parsed:
                if timezone.is_naive(parsed):
                    parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                activity_time = parsed
        data["start_time"] = activity_time
        data["end_time"] = activity_time

        serializer = ActivitySerializer(data=data)

        if serializer.is_valid():
            serializer.save()
            org = employee.org
            cutoff = timezone.now() - datetime.timedelta(days=30)
            Activity.objects.filter(employee__org=org, end_time__lt=cutoff).delete()
            log_event(
                "agent_activity_upload",
                status="success",
                org=org,
                device_id=request_device_id,
                employee_id=employee.id,
                meta={
                    "duration_ms": int((time.monotonic() - start_ts) * 1000),
                },
                request=request,
            )
            return Response({"message": "Activity Stored"})

        log_event(
            "agent_activity_upload",
            status="error",
            org=org,
            device_id=request_device_id,
            employee_id=employee.id if employee else None,
            meta={
                "reason": "validation_failed",
                "error_fields": list(serializer.errors.keys()),
            },
            request=request,
        )
        return Response(serializer.errors, status=400)

    except Exception as e:
        log_event(
            "agent_activity_upload",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={"reason": "exception", "detail": str(e)},
            request=request,
        )
        return Response({"error": str(e)}, status=400)



@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def upload_screenshot(request):
    start_ts = time.monotonic()
    try:
        rate_limited = _check_rate_limit(
            request,
            "screenshot_upload",
            SCREENSHOT_UPLOAD_LIMIT,
            SCREENSHOT_UPLOAD_WINDOW,
        )
        if rate_limited:
            log_event(
                "agent_rate_limited",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "scope": "screenshot_upload",
                    "identity": _throttle_identity_kind(request),
                    "limit": SCREENSHOT_UPLOAD_LIMIT,
                    "window_seconds": SCREENSHOT_UPLOAD_WINDOW,
                },
                request=request,
            )
            return rate_limited
        org, error = _get_org_from_company_key(request)
        if error:
            log_event(
                "agent_screenshot_upload",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "reason": getattr(error, "data", {}).get("error", "auth_failed"),
                    "http_status": error.status_code,
                },
                request=request,
            )
            return error
        header_device_id = request.headers.get("X-Device-Id")
        request_device_id = header_device_id or request.data.get("device_id") or request.query_params.get("device_id") or request.POST.get("device_id")
        employee_id = request.data.get("employee") or request.POST.get("employee")
        image = (
            request.FILES.get("image")
            or request.FILES.get("file")
            or request.FILES.get("screenshot")
        )
        pc_time = request.data.get("pc_time")
        app_name = (request.data.get("app_name") or request.data.get("app") or "").strip()
        window_title = (request.data.get("window_title") or request.data.get("window") or request.data.get("title") or "").strip()
        url = (request.data.get("url") or request.data.get("website") or "").strip()

        if not employee_id and request_device_id:
            existing_emp = Employee.objects.filter(device_id=request_device_id, org=org).first()
            if existing_emp:
                employee_id = existing_emp.id

        if not employee_id or not image:
            log_event(
                "agent_screenshot_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                meta={"reason": "employee_or_image_required"},
                request=request,
            )
            return Response({"error": "employee and image required"}, status=400)

        employee = Employee.objects.filter(id=employee_id, org=org).first()
        if not employee:
            log_event(
                "agent_screenshot_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                employee_id=employee_id,
                meta={"reason": "invalid_employee"},
                request=request,
            )
            return Response({"error": "Invalid employee"}, status=400)
        if request_device_id and employee.device_id != request_device_id:
            log_event(
                "agent_screenshot_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                employee_id=employee_id,
                meta={"reason": "invalid_device"},
                request=request,
            )
            return Response({"error": "Invalid device"}, status=400)

        pc_captured_at = None
        if pc_time:
            pc_captured_at = parse_datetime(pc_time)
            if pc_captured_at and timezone.is_naive(pc_captured_at):
                pc_captured_at = timezone.make_aware(
                    pc_captured_at,
                    timezone.get_current_timezone()
                )

        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=employee.org)
        keyword_rules = _normalize_keywords(settings_obj.privacy_keyword_rules)
        keyword_rules = DEFAULT_PRIVACY_KEYWORDS + keyword_rules

        should_blur = _should_blur_screenshot(
            settings_obj.screenshot_ignore_patterns,
            url,
            app_name,
            window_title,
        )
        if not should_blur and keyword_rules:
            should_blur = _should_blur_keywords(url, window_title, keyword_rules)
        if not should_blur:
            should_blur = _should_blur_auto(settings_obj, url, window_title)
        if should_blur:
            blurred_image = _blur_upload_image(image)
            if blurred_image:
                image = blurred_image
            else:
                log_event(
                    "agent_screenshot_upload",
                    status="ignored",
                    org=org,
                    device_id=request_device_id,
                    employee_id=employee.id,
                    meta={"reason": "privacy_ignored"},
                    request=request,
                )
                return Response({"message": "Screenshot ignored for privacy"})

        image.name = _build_screenshot_filename(employee, pc_captured_at or timezone.now(), image.name)
        captured_at_for_activity = pc_captured_at or timezone.now()
        normalized_app_name = app_name or "Work Zilla Agent"
        normalized_window_title = window_title or "Monitor Active"
        try:
            Screenshot.objects.create(
                employee=employee,
                employee_name=employee.name,
                image=image,
                captured_at=timezone.now(),
                pc_captured_at=pc_captured_at
            )
        except Exception as storage_exc:
            log_event(
                "agent_screenshot_upload",
                status="error",
                org=org,
                device_id=request_device_id,
                employee_id=employee.id,
                meta={"reason": "storage_error", "detail": str(storage_exc)},
                request=request,
            )
            try:
                fallback_storage = FileSystemStorage(
                    location=getattr(settings, "MEDIA_ROOT", ""),
                    base_url=getattr(settings, "MEDIA_URL", "/media/")
                )
                if hasattr(image, "seek"):
                    image.seek(0)
                fallback_name = _build_screenshot_filename(employee, pc_captured_at or timezone.now(), image.name)
                shot = Screenshot(
                    employee=employee,
                    employee_name=employee.name,
                    captured_at=timezone.now(),
                    pc_captured_at=pc_captured_at
                )
                shot.image.save(fallback_name, image, save=True, storage=fallback_storage)
            except Exception as fallback_exc:
                log_event(
                    "agent_screenshot_upload",
                    status="error",
                    org=org,
                    device_id=request_device_id,
                    employee_id=employee.id,
                    meta={"reason": "fallback_storage_failed", "detail": str(fallback_exc)},
                    request=request,
                )
                return Response({"error": "screenshot_storage_failed"}, status=500)

        # Persist activity signal from screenshot metadata so dashboard pages can
        # classify app usage / gaming-ott even when helpers don't post /activity/upload.
        if not _is_monitor_placeholder(normalized_app_name, normalized_window_title):
            Activity.objects.create(
                employee=employee,
                app_name=normalized_app_name,
                window_title=normalized_window_title,
                url=url,
                start_time=captured_at_for_activity,
                end_time=captured_at_for_activity,
            )

        sub = Subscription.objects.filter(
            organization=employee.org,
            status="active"
        ).order_by("-start_date").first()
        if sub:
            normalize_subscription_end_date(sub)
            if not is_subscription_active(sub):
                maybe_expire_subscription(sub)
                sub = None
        retention_days = sub.retention_days if sub else 30
        if not retention_days and sub:
            retention_days = sub.retention_months * 30
        try:
            retention_days = int(retention_days)
        except (TypeError, ValueError):
            retention_days = 30
        if retention_days > 0:
            cutoff = timezone.now() - datetime.timedelta(days=retention_days)
            old_shots = Screenshot.objects.filter(
                employee__org=employee.org,
                captured_at__lt=cutoff
            )
            for s in old_shots.iterator():
                try:
                    if s.image:
                        s.image.delete(save=False)
                except Exception:
                    pass
            old_shots.delete()

        log_event(
            "agent_screenshot_upload",
            status="success",
            org=org,
            device_id=request_device_id,
            employee_id=employee.id,
            meta={
                "bytes_uploaded": getattr(image, "size", 0),
                "duration_ms": int((time.monotonic() - start_ts) * 1000),
            },
            request=request,
        )
        return Response({"message": "Screenshot Saved"})
    except Exception as e:
        log_event(
            "agent_screenshot_upload",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={"reason": "exception", "detail": str(e)},
            request=request,
        )
        return Response({"error": str(e)}, status=400)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def monitor_heartbeat(request):
    start_ts = time.monotonic()
    try:
        org, error = _get_org_from_company_key(request)
        if error:
            log_event(
                "agent_heartbeat",
                status="error",
                device_id=request.headers.get("X-Device-Id", ""),
                meta={
                    "reason": getattr(error, "data", {}).get("error", "auth_failed"),
                    "http_status": error.status_code,
                },
                request=request,
            )
            return error
        header_device_id = request.headers.get("X-Device-Id")
        request_device_id = (
            header_device_id
            or request.data.get("device_id")
            or request.query_params.get("device_id")
            or request.POST.get("device_id")
        )
        employee_id = request.data.get("employee") or request.data.get("employee_id")
        employee = None
        if employee_id:
            employee = Employee.objects.filter(id=employee_id, org=org).first()
        if not employee and request_device_id:
            employee = Employee.objects.filter(device_id=request_device_id, org=org).first()
        if not employee:
            log_event(
                "agent_heartbeat",
                status="error",
                org=org,
                device_id=request_device_id,
                meta={"reason": "invalid_employee"},
                request=request,
            )
            return Response({"error": "Invalid employee"}, status=400)

        now = timezone.now()
        app_name = (request.data.get("app_name") or "").strip()
        window_title = (request.data.get("window_title") or "").strip()
        url = (request.data.get("url") or "").strip()
        if app_name or window_title or url:
            if not _is_monitor_placeholder(app_name, window_title):
                Activity.objects.create(
                    employee=employee,
                    app_name=app_name or "Work Zilla Agent",
                    window_title=window_title or "Monitor Active",
                    url=url,
                    start_time=now,
                    end_time=now,
                )
        log_event(
            "agent_heartbeat",
            status="success",
            org=org,
            device_id=request_device_id,
            employee_id=employee.id,
            meta={"duration_ms": int((time.monotonic() - start_ts) * 1000)},
            request=request,
        )
        return Response({"ok": True})
    except Exception as e:
        log_event(
            "agent_heartbeat",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={"reason": "exception", "detail": str(e)},
            request=request,
        )
        return Response({"error": str(e)}, status=400)



@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def employee_report(request, device_id):
    employee = Employee.objects.get(device_id=device_id)
    activities = Activity.objects.filter(employee=employee)
    ser = ActivitySerializer(activities, many=True)
    return Response(ser.data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def org_settings(request):
    start_ts = time.monotonic()
    rate_limited = _check_rate_limit(
        request,
        "org_settings",
        ORG_SETTINGS_LIMIT,
        ORG_SETTINGS_WINDOW,
    )
    if rate_limited:
        log_event(
            "agent_rate_limited",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={
                "scope": "org_settings",
                "identity": _throttle_identity_kind(request),
                "limit": ORG_SETTINGS_LIMIT,
                "window_seconds": ORG_SETTINGS_WINDOW,
            },
            request=request,
        )
        return rate_limited
    org, error = _get_org_from_company_key(request)
    if error:
        log_event(
            "agent_org_settings",
            status="error",
            device_id=request.headers.get("X-Device-Id", ""),
            meta={
                "reason": getattr(error, "data", {}).get("error", "auth_failed"),
                "http_status": error.status_code,
            },
            request=request,
        )
        return error

    interval_seconds = get_screenshot_interval_seconds(org)
    log_event(
        "agent_org_settings",
        status="success",
        org=org,
        device_id=request.headers.get("X-Device-Id", ""),
        meta={
            "interval_seconds": interval_seconds,
            "duration_ms": int((time.monotonic() - start_ts) * 1000),
        },
        request=request,
    )
    theme = ThemeSettings.get_active()
    return Response({
        "screenshot_interval_seconds": interval_seconds,
        "theme_primary": theme.primary_color or "",
        "theme_secondary": theme.secondary_color or "",
    })



# ========================== DASHBOARD PART ==========================

def screenshots(request):
    shots = Screenshot.objects.all().order_by("-id")

    paginator = Paginator(shots, 24)      # 24 per page
    page = request.GET.get("page")
    shots = paginator.get_page(page)

    return render(request, "dashboard/screenshots.html", {
        "shots": shots
    })


@login_required
def delete_all_screenshots(request):
    org = get_active_org(request)
    if not org:
        messages.error(request, "Select organization first!")
        return redirect("/select-organization/")

    shots = Screenshot.objects.filter(employee__org=org)

    deleted_count = 0

    for s in shots:
        try:
            if s.image:
                s.image.delete(save=False)
                deleted_count += 1
        except Exception as e:
            print("File delete failed:", e)

    # delete db records
    shots.delete()

    log_admin_activity(request.user, "Delete All Screenshots", f"Deleted {deleted_count} screenshots for org {org.name}")
    messages.success(request, f"Deleted {deleted_count} screenshots successfully!")
    return redirect("/dashboard/screenshots/")

    
@login_required
def screenshot_view(request):
    org = get_active_org(request)
    if not org:
        messages.error(request, "Please select organization first!")
        return redirect("/select-organization/")

    shots = Screenshot.objects.filter(
        employee__org=org
    ).order_by('-captured_at')

    from django.core.paginator import Paginator
    paginator = Paginator(shots, 20)
    page = request.GET.get("page")
    shots = paginator.get_page(page)

    return render(request, "dashboard/screenshots.html", {
        "shots": shots,
        "org": org
    })

