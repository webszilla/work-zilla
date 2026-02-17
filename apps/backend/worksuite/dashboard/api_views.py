from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta
import datetime
import json
import math
import re
from types import SimpleNamespace

from django.contrib.auth import update_session_auth_hash, get_user_model
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator
from django.db import models, transaction
from django.db.models import Max, Value, Q
from django.db.models.functions import Coalesce, TruncDate, NullIf
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_http_methods
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from core.models import (
    AdminActivity,
    CompanyPrivacySettings,
    Employee,
    OrganizationSettings,
    PendingTransfer,
    Plan,
    DealerAccount,
    DealerReferralEarning,
    ReferralEarning,
    ReferralSettings,
    Screenshot,
    MonitorStopEvent,
    Subscription,
    SubscriptionHistory,
    Activity,
    BillingProfile,
    InvoiceSellerProfile,
)
from saas_admin.models import Product
from dashboard import views as dashboard_views
from core.referral_utils import ensure_referral_code, ensure_dealer_referral_code
from core.email_utils import send_templated_email
from core.subscription_utils import is_subscription_active
from core.timezone_utils import normalize_timezone, is_valid_timezone, resolve_default_timezone
from core.notification_emails import notify_password_changed, notify_account_limit_reached, send_email_verification
from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription


User = get_user_model()


DEFAULT_ALLOWED_INTERVALS = [1, 2, 3, 5, 10, 15, 20, 30]
GSTIN_REGEX = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"


def _normalize_text(value):
    return " ".join(str(value or "").strip().split())


def _validate_gstin(value):
    if not value:
        return False
    return bool(re.match(GSTIN_REGEX, value))


def _billing_profile_payload(profile):
    if not profile:
        return {
            "contact_name": "",
            "company_name": "",
            "email": "",
            "phone": "",
            "address_line1": "",
            "address_line2": "",
            "city": "",
            "state": "",
            "postal_code": "",
            "country": "India",
            "gstin": "",
        }
    return {
        "contact_name": profile.contact_name,
        "company_name": profile.company_name,
        "email": profile.email,
        "phone": profile.phone or "",
        "address_line1": profile.address_line1,
        "address_line2": profile.address_line2 or "",
        "city": profile.city,
        "state": profile.state,
        "postal_code": profile.postal_code,
        "country": profile.country,
        "gstin": profile.gstin or "",
    }


def _billing_profile_missing_fields(profile):
    required = [
        ("contact_name", profile.contact_name if profile else ""),
        ("company_name", profile.company_name if profile else ""),
        ("email", profile.email if profile else ""),
        ("phone", profile.phone if profile else ""),
        ("address_line1", profile.address_line1 if profile else ""),
        ("city", profile.city if profile else ""),
        ("state", profile.state if profile else ""),
        ("postal_code", profile.postal_code if profile else ""),
        ("country", profile.country if profile else ""),
    ]
    missing = [key for key, value in required if not _normalize_text(value)]
    return missing


def _json_error(message, status=400, extra=None):
    payload = {"error": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _get_org_or_error(request):
    org = dashboard_views.get_active_org(request)
    if not org:
        return None, _json_error(
            "organization_required",
            status=403,
            extra={"redirect": "/select-organization/"},
        )
    return org, None


def _format_datetime(value):
    if not value:
        return ""
    return timezone.localtime(value).strftime("%Y-%m-%d %H:%M:%S")


def _read_browser_timezone(request):
    query_tz = (request.GET.get("browser_timezone") or "").strip()
    if is_valid_timezone(query_tz):
        return query_tz
    header_tz = (request.headers.get("X-Browser-Timezone") or "").strip()
    if is_valid_timezone(header_tz):
        return header_tz
    return ""


def _resolve_org_timezone(org, request=None):
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    current = normalize_timezone(settings_obj.org_timezone, fallback="UTC")
    if settings_obj.org_timezone != current:
        settings_obj.org_timezone = current
        settings_obj.save(update_fields=["org_timezone"])

    if current != "UTC":
        return settings_obj, current

    billing_country = (
        BillingProfile.objects
        .filter(organization=org)
        .values_list("country", flat=True)
        .first()
    )
    browser_timezone = _read_browser_timezone(request) if request else ""
    resolved = resolve_default_timezone(country=billing_country, browser_timezone=browser_timezone, fallback=current)
    if resolved != current:
        settings_obj.org_timezone = resolved
        settings_obj.save(update_fields=["org_timezone"])
        current = resolved
    return settings_obj, current


def _cleanup_old_monitor_data(org, days=30):
    cutoff = timezone.now() - timedelta(days=max(int(days or 30), 1))
    Activity.objects.filter(
        employee__org=org
    ).filter(
        models.Q(end_time__lt=cutoff) | models.Q(start_time__lt=cutoff)
    ).delete()
    MonitorStopEvent.objects.filter(employee__org=org, stopped_at__lt=cutoff).delete()


def _resolve_monitor_preset(date_from_raw, date_to_raw, preset):
    allowed_presets = {"today", "yesterday", "one_week", "one_month", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    today = timezone.localdate()
    if preset == "today":
        iso_day = today.isoformat()
        return iso_day, iso_day, preset
    if preset == "yesterday":
        iso_day = (today - timedelta(days=1)).isoformat()
        return iso_day, iso_day, preset
    if preset == "one_week":
        return (today - timedelta(days=6)).isoformat(), today.isoformat(), preset
    if preset == "one_month":
        return (today - timedelta(days=29)).isoformat(), today.isoformat(), preset
    if preset == "all":
        return None, None, preset
    return date_from_raw, date_to_raw, preset


def _storage_is_free_plan(plan):
    if not plan:
        return False
    prices = [
        getattr(plan, "monthly_price", 0) or 0,
        getattr(plan, "yearly_price", 0) or 0,
        getattr(plan, "monthly_price_inr", 0) or 0,
        getattr(plan, "yearly_price_inr", 0) or 0,
        getattr(plan, "monthly_price_usd", 0) or 0,
        getattr(plan, "yearly_price_usd", 0) or 0,
        getattr(plan, "usd_monthly_price", 0) or 0,
        getattr(plan, "usd_yearly_price", 0) or 0,
    ]
    return all(price <= 0 for price in prices)


def _org_used_free_trial(org):
    if not org:
        return False
    core_subs = (
        Subscription.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    for sub in core_subs:
        if sub.plan and dashboard_views.is_free_plan(sub.plan):
            return True
    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    for row in history_rows:
        if row.plan and dashboard_views.is_free_plan(row.plan):
            return True
    storage_subs = (
        StorageOrgSubscription.objects
        .filter(organization=org)
        .select_related("plan")
    )
    for sub in storage_subs:
        if sub.plan is None or _storage_is_free_plan(sub.plan):
            return True
    return False


def _format_display_datetime(value):
    if not value:
        return ""
    return timezone.localtime(value).strftime("%d %b %Y, %I:%M %p")


def _format_date(value):
    if not value:
        return ""
    return timezone.localtime(value).strftime("%Y-%m-%d")


def _title_case(value):
    if not value:
        return "-"
    return str(value).replace("_", " ").title()


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _gst_rate(currency):
    if currency != "INR":
        return Decimal("0.00")
    return Decimal(str(getattr(settings, "INVOICE_TAX_RATE", 18))) / Decimal("100")


def _apply_gst_amount(amount, currency):
    base = _money(amount)
    tax_rate = _gst_rate(currency)
    if not base or tax_rate <= 0:
        return base
    return _money(base * (Decimal("1.00") + tax_rate))


def _addon_price(plan, billing_cycle, currency):
    if not plan:
        return Decimal("0.00")
    if currency == "USD":
        raw = plan.addon_usd_yearly_price if billing_cycle == "yearly" else plan.addon_usd_monthly_price
    else:
        raw = plan.addon_yearly_price if billing_cycle == "yearly" else plan.addon_monthly_price
    return _money(raw or 0)


def _plan_amount_with_addons(plan, billing_cycle, addon_count, currency):
    base = dashboard_views.get_plan_amount(plan, billing_cycle, currency=currency) or 0
    addons = _addon_price(plan, billing_cycle, currency) * Decimal(addon_count or 0)
    return _money(Decimal(str(base)) + addons)


def _reconcile_addon_count(sub, org):
    if not sub or not org:
        return sub
    approved_transfers = PendingTransfer.objects.filter(
        status="approved",
        organization=org
    ).order_by("-updated_at")
    base_transfer = approved_transfers.filter(request_type__in=("new", "renew")).first()
    base_addons = 0
    base_time = None
    if base_transfer and base_transfer.plan and base_transfer.plan.allow_addons:
        base_addons = base_transfer.addon_count or 0
        base_time = base_transfer.updated_at or base_transfer.created_at
    addon_transfers = approved_transfers.filter(request_type="addon")
    if base_time:
        addon_transfers = addon_transfers.filter(updated_at__gt=base_time)
    addon_total = base_addons + sum(t.addon_count or 0 for t in addon_transfers)
    if addon_total != (sub.addon_count or 0):
        sub.addon_count = addon_total
        sub.save(update_fields=["addon_count"])
    return sub


def _format_currency(currency, amount):
    value = _money(amount)
    if not currency:
        return str(value)
    return f"{currency} {value}"


def _invoice_seller():
    seller = InvoiceSellerProfile.objects.order_by("-updated_at").first()
    if seller:
        return {
            "name": seller.name,
            "address_line1": seller.address_line1,
            "address_line2": seller.address_line2,
            "city": seller.city,
            "state": seller.state,
            "postal_code": seller.postal_code,
            "country": seller.country,
            "gstin": seller.gstin,
            "sac": seller.sac or "997331",
            "support_email": seller.support_email,
            "state_code": seller.state_code,
            "bank_account_details": seller.bank_account_details,
        }
    return getattr(settings, "INVOICE_SELLER", {
        "name": "Work Zilla Work Suite",
        "address_line1": "",
        "address_line2": "",
        "city": "",
        "state": "",
        "postal_code": "",
        "country": "India",
        "gstin": "",
        "sac": "997331",
        "support_email": "",
        "state_code": getattr(settings, "INVOICE_SELLER_STATE_CODE", ""),
        "bank_account_details": "",
    })


def _build_invoice_number(transfer):
    prefix = getattr(settings, "INVOICE_NUMBER_PREFIX", "WZ")
    date_str = timezone.localtime(transfer.updated_at or transfer.created_at).strftime("%Y-%m-%d")
    return f"{prefix}-{date_str}-{transfer.id:04d}"


def _is_intra_state(buyer_state, buyer_gstin=None, buyer_country=None):
    seller = _invoice_seller()
    seller_state = _normalize_text(seller.get("state"))
    seller_country = _normalize_text(seller.get("country"))
    seller_state_code = seller.get("state_code") or getattr(settings, "INVOICE_SELLER_STATE_CODE", "")
    buyer_state_clean = _normalize_text(buyer_state)
    buyer_country_clean = _normalize_text(buyer_country)
    if buyer_country_clean and seller_country and buyer_country_clean.lower() != seller_country.lower():
        return False
    if buyer_gstin and len(buyer_gstin) >= 2 and buyer_gstin[:2].isdigit() and seller_state_code:
        return buyer_gstin[:2] == str(seller_state_code)
    if seller_state and buyer_state_clean:
        return seller_state.lower() == buyer_state_clean.lower()
    return True

def _admin_activity_payload(row):
    details = row.details or "-"
    employees = []
    if row.action == "Delete Selected Screenshots":
        try:
            parsed = json.loads(details)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, dict):
            employees = parsed.get("employees") or []
            count = parsed.get("count")
            if employees:
                if len(employees) == 1:
                    details = f"{count} screenshots deleted for {employees[0]}"
                else:
                    details = f"{count} screenshots deleted for multiple employees"
            elif count is not None:
                details = f"{count} screenshots deleted"
    return {
        "time": _format_datetime(row.created_at),
        "action": row.action,
        "details": details,
        "employees": employees,
    }


def _plan_rank(plan):
    if not plan:
        return 0
    yearly = plan.yearly_price or 0
    monthly = plan.monthly_price or 0
    return max(yearly, monthly)


def _infer_end_date(start_date, billing_cycle):
    if not start_date:
        return None
    months = 12 if billing_cycle == "yearly" else 1
    return start_date + timedelta(days=30 * months)


def _format_invoice_period(start_dt, end_dt):
    if not start_dt and not end_dt:
        return ""
    start_label = timezone.localtime(start_dt).strftime("%d %b %Y") if start_dt else "-"
    end_label = timezone.localtime(end_dt).strftime("%d %b %Y") if end_dt else "-"
    return f"{start_label} - {end_label}"


def _invoice_periods_for_transfer(transfer):
    sub = None
    if transfer.organization_id:
        base_qs = Subscription.objects.filter(organization_id=transfer.organization_id)
        if transfer.plan_id:
            sub = base_qs.filter(plan_id=transfer.plan_id).order_by("-start_date").first()
        if not sub and transfer.plan and transfer.plan.product_id:
            sub = base_qs.filter(plan__product_id=transfer.plan.product_id).order_by("-start_date").first()
        if not sub and transfer.plan and not transfer.plan.product_id:
            sub = base_qs.filter(plan__product__isnull=True).order_by("-start_date").first()
        if not sub:
            sub = base_qs.order_by("-start_date").first()

    plan_start = (sub.start_date if sub and sub.start_date else None) or transfer.updated_at or transfer.created_at
    plan_end = (sub.end_date if sub and sub.end_date else None)
    if not plan_end and plan_start:
        plan_end = _infer_end_date(plan_start, sub.billing_cycle if sub else transfer.billing_cycle)

    addon_start = transfer.updated_at or transfer.created_at or plan_start
    addon_end = (sub.end_date if sub and sub.end_date else None)
    if not addon_end and addon_start:
        addon_end = _infer_end_date(addon_start, transfer.billing_cycle)

    return sub, plan_start, plan_end, addon_start, addon_end


def _invoice_proration_days(billing_cycle, addon_start, addon_end):
    if not addon_start or not addon_end:
        return None, None
    duration_days = 360 if billing_cycle == "yearly" else 30
    remaining_seconds = (addon_end - addon_start).total_seconds()
    if remaining_seconds <= 0:
        return 0, duration_days
    remaining_days = max(0, math.ceil(remaining_seconds / 86400))
    if remaining_days > duration_days:
        remaining_days = duration_days
    return remaining_days, duration_days


def _recalculate_addon_total(transfer, addon_start, addon_end, currency):
    if not transfer or transfer.request_type != "addon":
        return None
    if not addon_start or not addon_end or addon_end <= addon_start:
        return None
    remaining_days, duration_days = _invoice_proration_days(transfer.billing_cycle, addon_start, addon_end)
    if not duration_days:
        return None
    addon_qty = int(transfer.addon_count or 0)
    addon_unit_price = _addon_price(transfer.plan, transfer.billing_cycle, currency)
    base_amount = (addon_unit_price * Decimal(addon_qty)) * Decimal(remaining_days / duration_days)
    total_amount = _apply_gst_amount(base_amount, currency)
    return _money(total_amount)


def _wrap_text_lines(text, max_width, doc):
    words = str(text or "").split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if doc.stringWidth(candidate, doc._fontname, doc._fontsize) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _get_rollback_entry(org, active_sub, product_slug=None):
    if not active_sub or not active_sub.plan:
        return None
    current_rank = _plan_rank(active_sub.plan)
    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
        .order_by("-created_at")
    )
    if product_slug:
        history_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            history_filter = history_filter | Q(plan__product__isnull=True)
        history_rows = history_rows.filter(history_filter)
    plan_map = {}
    for row in history_rows:
        if not row.plan or row.plan_id == active_sub.plan_id:
            continue
        if _plan_rank(row.plan) <= current_rank:
            continue
        expected_end = _infer_end_date(row.start_date, row.billing_cycle)
        effective_end = row.end_date or expected_end
        if (
            row.plan
            and not dashboard_views.is_free_plan(row.plan)
            and expected_end
            and (not row.end_date or row.end_date < expected_end)
        ):
            effective_end = expected_end
        if not effective_end and active_sub.end_date:
            effective_end = active_sub.end_date
        if not effective_end:
            effective_end = timezone.now() + timedelta(days=30)
        entry = plan_map.get(row.plan_id)
        should_replace = False
        if not entry:
            should_replace = True
        elif effective_end and (not entry["end_date"] or effective_end > entry["end_date"]):
            should_replace = True
        if should_replace:
            plan_map[row.plan_id] = {
                "plan": row.plan,
                "billing_cycle": row.billing_cycle,
                "start_date": row.start_date,
                "end_date": effective_end,
                "rank": _plan_rank(row.plan),
            }
    if not plan_map:
        return None
    best = None
    for entry in plan_map.values():
        if not best:
            best = entry
            continue
        if entry["rank"] > best["rank"]:
            best = entry
        elif entry["rank"] == best["rank"] and entry["end_date"] > best["end_date"]:
            best = entry
    if not best:
        return None
    return {
        "plan_id": best["plan"].id,
        "plan": best["plan"],
        "billing_cycle": best["billing_cycle"],
        "start_date": best["start_date"],
        "end_date": best["end_date"],
    }

def _status_from_last_seen(last_seen, now):
    if not last_seen:
        return "Offline"
    delta = now - last_seen
    if delta <= timedelta(minutes=2):
        return "Online"
    if delta <= timedelta(minutes=10):
        return "Ideal"
    return "Offline"


def _parse_date_flexible(value):
    if not value:
        return None, ""
    parsed = parse_date(value)
    if parsed:
        return parsed, parsed.isoformat()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y"):
        try:
            parsed = datetime.datetime.strptime(value, fmt).date()
            return parsed, parsed.isoformat()
        except ValueError:
            continue
    return None, ""


def _get_active_subscription(org):
    if not org:
        return None
    plan_filter = Q(plan__product__slug="monitor") | Q(plan__product__isnull=True)
    sub = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"))
        .filter(plan_filter)
        .order_by("-start_date")
        .first()
    )
    if sub:
        if not is_subscription_active(sub):
            dashboard_views.maybe_expire_subscription(sub)
            sub = None
        else:
            dashboard_views.normalize_subscription_end_date(sub)
    if sub:
        return sub
    latest_approved = (
        PendingTransfer.objects
        .filter(
            organization=org,
            status="approved",
            request_type__in=("new", "renew"),
        )
        .filter(plan_filter)
        .order_by("-updated_at")
        .first()
    )
    if not latest_approved or not latest_approved.plan:
        return None
    start_date = latest_approved.updated_at or timezone.now()
    duration_months = 12 if latest_approved.billing_cycle == "yearly" else 1
    end_date = start_date + timedelta(days=30 * duration_months)
    retention_days = latest_approved.retention_days or (latest_approved.plan.retention_days if latest_approved.plan else 30)
    monitor_sub = (
        Subscription.objects
        .filter(organization=org)
        .filter(plan_filter)
        .order_by("-start_date")
        .first()
    )
    if monitor_sub:
        monitor_sub.user = latest_approved.user
        monitor_sub.plan = latest_approved.plan
        monitor_sub.status = "active"
        monitor_sub.start_date = start_date
        monitor_sub.end_date = end_date
        monitor_sub.billing_cycle = latest_approved.billing_cycle
        monitor_sub.retention_days = retention_days
        if latest_approved.plan and latest_approved.plan.allow_addons and latest_approved.addon_count is not None:
            monitor_sub.addon_count = latest_approved.addon_count
        monitor_sub.save()
        return monitor_sub
    return Subscription.objects.create(
        user=latest_approved.user,
        organization=org,
        plan=latest_approved.plan,
        status="active",
        start_date=start_date,
        end_date=end_date,
        billing_cycle=latest_approved.billing_cycle,
        retention_days=retention_days,
        addon_count=latest_approved.addon_count or 0,
    )


def _hr_access_payload(org, subscription):
    if not org or not subscription or not subscription.plan:
        return {"enabled": False}
    if not subscription.plan.allow_hr_view:
        return {"enabled": False}
    if not is_subscription_active(subscription):
        return {"enabled": False}
    company_key = org.company_key or ""
    return {
        "enabled": True,
        "login_url": "/hr-login/",
        "username": company_key,
        "default_password": f"{company_key}hrlog",
    }


@login_required
@require_http_methods(["GET"])
def dashboard_summary(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employees_qs = Employee.objects.filter(org=org)
    activities_qs = Activity.objects.filter(employee__org=org)
    screenshots_qs = Screenshot.objects.filter(employee__org=org)

    total_employees = employees_qs.count()
    total_activities = activities_qs.count()
    total_screenshots = screenshots_qs.count()

    now = timezone.now()
    online_count = 0
    for employee in employees_qs:
        if employee.last_seen and now - employee.last_seen < timedelta(minutes=2):
            online_count += 1

    top_apps = (
        activities_qs
        .values("app_name")
        .order_by()
        .annotate(count=models.Count("app_name"))
        .order_by("-count")[:5]
    )

    active_sub = _get_active_subscription(org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)

    # Alert on gaming/OTT usage during work hours.
    alert_rows = []
    now_local = timezone.localtime(timezone.now())
    work_start = now_local.replace(hour=9, minute=0, second=0, microsecond=0)
    work_end = now_local.replace(hour=18, minute=0, second=0, microsecond=0)
    keyword_q = dashboard_views.build_gaming_ott_query()
    alert_activities = (
        Activity.objects
        .filter(employee__org=org)
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .filter(activity_time__range=(work_start, work_end))
        .filter(keyword_q)
        .select_related("employee")
        .order_by("-activity_time")[:10]
    )
    for act in alert_activities:
        activity_time = getattr(act, "activity_time", None) or act.end_time or act.start_time
        label = (act.url or act.window_title or act.app_name or "").strip() or act.app_name
        alert_rows.append({
            "employee": act.employee.name,
            "app": label,
            "time": timezone.localtime(activity_time).strftime("%H:%M:%S") if activity_time else "-",
        })

    recent_admin_actions = AdminActivity.objects.filter(
        user=request.user
    ).order_by("-created_at")[:100]

    sub_payload = None
    if active_sub and active_sub.plan:
        sub_payload = {
            "plan": active_sub.plan.name,
            "employee_limit": active_sub.plan.employee_limit,
            "addon_count": active_sub.addon_count or 0,
            "billing_cycle": active_sub.billing_cycle,
            "end_date": _format_datetime(active_sub.end_date),
            "retention_days": active_sub.retention_days,
            "allow_addons": active_sub.plan.allow_addons,
            "status": active_sub.status,
        }

    products_payload = []
    for product in Product.objects.all().order_by("sort_order", "name"):
        features = []
        if product.features:
            features = [
                chunk.strip()
                for chunk in re.split(r"[\n,;/]+", product.features)
                if chunk.strip()
            ]
        products_payload.append({
            "slug": product.slug,
            "name": product.name,
            "description": product.description or "",
            "icon": product.icon or "bi-box",
            "status": product.status,
            "features": features,
        })

    return JsonResponse({
        "org": {
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
            "created_at": _format_datetime(org.created_at),
        },
        "stats": {
            "employees": total_employees,
            "online": online_count,
            "activities": total_activities,
            "screenshots": total_screenshots,
        },
        "top_apps": list(top_apps),
        "subscription": sub_payload,
        "settings": {
            "screenshot_interval_minutes": settings_obj.screenshot_interval_minutes,
        },
        "recent_admin_actions": [
            _admin_activity_payload(row)
            for row in recent_admin_actions
        ],
        "usage_alerts": alert_rows,
        "work_hours_label": "09:00 - 18:00",
        "products": products_payload,
    })


@login_required
@require_http_methods(["GET"])
def employees_list(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    query = request.GET.get("q", "").strip()
    employees = Employee.objects.filter(org=org)
    if query:
        employees = employees.filter(
            models.Q(name__icontains=query) |
            models.Q(email__icontains=query) |
            models.Q(device_id__icontains=query) |
            models.Q(pc_name__icontains=query)
        )
    employees = employees.order_by("id")

    sub = _get_active_subscription(org)
    sub = _reconcile_addon_count(sub, org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    allowed_intervals = list(DEFAULT_ALLOWED_INTERVALS)
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]

    employee_limit = sub.plan.employee_limit if sub and sub.plan else 0
    addon_count = sub.addon_count if sub else 0
    if employee_limit != 0:
        employee_limit = employee_limit + addon_count
    employee_count = Employee.objects.filter(org=org).count()
    if employee_limit == 0:
        can_add = dashboard_views.is_subscription_active(sub)
    else:
        can_add = dashboard_views.is_subscription_active(sub) and employee_count < employee_limit

    now = timezone.now()
    employee_rows = []
    for employee in employees:
        last_seen = employee.last_seen
        status = _status_from_last_seen(last_seen, now)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "email": employee.email or "",
            "pc_name": employee.pc_name or "-",
            "device_id": employee.device_id,
            "last_seen": _format_datetime(last_seen),
            "status": status,
            "is_online": status == "Online",
        })

    sub_payload = None
    if sub and sub.plan:
        sub_payload = {
            "plan": sub.plan.name,
            "allow_addons": sub.plan.allow_addons,
            "addon_count": sub.addon_count or 0,
            "billing_cycle": sub.billing_cycle,
            "employee_limit": sub.plan.employee_limit,
        }

    return JsonResponse({
        "org": {
            "id": org.id,
            "company_key": org.company_key,
        },
        "employees": employee_rows,
        "meta": {
            "employee_limit": employee_limit,
            "employee_count": employee_count,
            "addon_count": addon_count,
            "can_add": can_add,
            "allowed_intervals": allowed_intervals,
            "screenshot_interval_minutes": settings_obj.screenshot_interval_minutes,
        },
        "subscription": sub_payload,
        "hr_access": _hr_access_payload(org, sub),
    })


@login_required
@require_http_methods(["POST"])
def employees_create(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = _get_active_subscription(org)
    if not dashboard_views.is_subscription_active(sub):
        return _json_error("subscription_required", status=403, extra={"redirect": "/dashboard/plans/"})

    employee_limit = sub.plan.employee_limit if sub and sub.plan else 0
    addon_count = sub.addon_count if sub else 0
    if employee_limit == 0:
        employee_limit = 0
    else:
        employee_limit = employee_limit + addon_count
    if employee_limit and Employee.objects.filter(org=org).count() >= employee_limit:
        owner = org.owner or request.user
        notify_account_limit_reached(
            owner,
            limit=employee_limit,
            current_count=Employee.objects.filter(org=org).count(),
            label="employees",
        )
        return _json_error("employee_limit_reached", status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    device_id = (payload.get("device_id") or "").strip()

    if not name or not device_id:
        return _json_error("name_and_device_required")

    if Employee.objects.filter(device_id=device_id).exists():
        return _json_error("device_id_exists", status=400)

    employee = Employee.objects.create(
        org=org,
        name=name,
        email=email,
        device_id=device_id,
    )

    return JsonResponse({
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "email": employee.email or "",
            "pc_name": employee.pc_name or "-",
            "device_id": employee.device_id,
        }
    })


@login_required
@require_http_methods(["GET"])
def employees_detail(request, emp_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employee = Employee.objects.filter(id=emp_id, org=org).first()
    if not employee:
        return _json_error("employee_not_found", status=404)

    logs = Activity.objects.filter(employee=employee).order_by("-start_time")[:50]
    shots = Screenshot.objects.filter(employee=employee).order_by("-captured_at")[:20]

    now = timezone.now()
    last_seen = employee.last_seen
    status = _status_from_last_seen(last_seen, now)

    return JsonResponse({
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "email": employee.email or "",
            "pc_name": employee.pc_name or "-",
            "device_id": employee.device_id,
            "last_seen": _format_datetime(last_seen),
            "status": status,
        },
        "recent_activities": [
            {
                "app": log.app_name,
                "window": log.window_title or "",
                "start": _format_datetime(log.start_time),
                "end": _format_datetime(log.end_time),
            }
            for log in logs
        ],
        "recent_screenshots": [
            {
                "id": shot.id,
                "captured_at": _format_display_datetime(shot.captured_at),
                "image_url": reverse("api_screenshot_image", args=[shot.id]),
            }
            for shot in shots
        ],
    })


@login_required
@require_http_methods(["GET"])
def screenshots_image(request, shot_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    shot = (
        Screenshot.objects
        .select_related("employee__org")
        .filter(id=shot_id, employee__org=org)
        .first()
    )
    if not shot:
        return _json_error("screenshot_not_found", status=404)
    if dashboard_views.is_super_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    return dashboard_views._serve_screenshot_file(shot)


@login_required
@require_http_methods(["PUT"])
def employees_update(request, emp_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employee = Employee.objects.filter(id=emp_id, org=org).first()
    if not employee:
        return _json_error("employee_not_found", status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip()
    device_id = (payload.get("device_id") or "").strip()

    if not name or not device_id:
        return _json_error("name_and_device_required")

    if Employee.objects.filter(device_id=device_id).exclude(id=employee.id).exists():
        return _json_error("device_id_exists", status=400)

    employee.name = name
    employee.email = email
    employee.device_id = device_id
    employee.save()

    return JsonResponse({
        "employee": {
            "id": employee.id,
            "name": employee.name,
            "email": employee.email or "",
            "pc_name": employee.pc_name or "-",
            "device_id": employee.device_id,
        }
    })


@login_required
@require_http_methods(["DELETE"])
def employees_delete(request, emp_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employee = Employee.objects.filter(id=emp_id, org=org).first()
    if not employee:
        return _json_error("employee_not_found", status=404)

    employee_name = employee.name or f"Employee {employee.id}"
    keyword_q = dashboard_views.build_gaming_ott_query()

    screenshot_qs = Screenshot.objects.filter(employee=employee)
    screenshot_count = screenshot_qs.count()
    activity_qs = Activity.objects.filter(employee=employee)
    activity_count = activity_qs.count()
    gaming_ott_activity_count = activity_qs.filter(keyword_q).count()
    app_usage_activity_count = activity_count - gaming_ott_activity_count
    stop_event_qs = MonitorStopEvent.objects.filter(employee=employee)
    stop_event_count = stop_event_qs.count()

    with transaction.atomic():
        # Explicitly remove screenshot files from local/object storage before row deletion.
        for shot in screenshot_qs.only("id", "image").iterator():
            if shot.image:
                shot.image.delete(save=False)
        screenshot_qs.delete()
        activity_qs.delete()
        stop_event_qs.delete()
        employee.delete()

    dashboard_views.log_admin_activity(
        request.user,
        "Delete Employee",
        (
            f"{employee_name} deleted. Removed {screenshot_count} screenshots, "
            f"{activity_count} total activity logs "
            f"({app_usage_activity_count} app usage + {gaming_ott_activity_count} gaming/OTT), "
            f"and {stop_event_count} monitor stop records."
        ),
    )
    return JsonResponse(
        {
            "deleted": True,
            "employee_name": employee_name,
            "removed": {
                "screenshots": screenshot_count,
                "activities": activity_count,
                "app_usage": app_usage_activity_count,
                "gaming_ott_usage": gaming_ott_activity_count,
                "monitor_stop_events": stop_event_count,
            },
        }
    )


@login_required
@require_http_methods(["POST"])
def employees_update_interval(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = _get_active_subscription(org)
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    allowed_intervals = list(DEFAULT_ALLOWED_INTERVALS)
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    interval = payload.get("interval")
    try:
        interval_val = int(interval)
    except (TypeError, ValueError):
        interval_val = None

    if interval_val not in allowed_intervals:
        return _json_error("invalid_interval", status=400)

    settings_obj.screenshot_interval_minutes = interval_val
    settings_obj.save()

    return JsonResponse({"screenshot_interval_minutes": interval_val})


@login_required
@require_http_methods(["POST"])
def employees_update_addons(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = _get_active_subscription(org)
    if not sub or not sub.plan:
        return _json_error("subscription_required", status=403)

    plan = sub.plan
    if not plan.allow_addons:
        return _json_error("addons_disabled", status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    add_more = payload.get("addon_count")
    try:
        add_more = int(add_more)
    except (TypeError, ValueError):
        add_more = 0

    if add_more < 0:
        add_more = 0

    if add_more == 0:
        return JsonResponse({"updated": True, "addon_count": sub.addon_count or 0})

    current_count = sub.addon_count or 0
    new_count = current_count + add_more
    delta = add_more

    addon_price = plan.addon_monthly_price or 0
    if sub.billing_cycle == "yearly":
        addon_price = plan.addon_yearly_price or 0

    billing_cycle = sub.billing_cycle or "monthly"
    expected_end = sub.end_date or _infer_end_date(sub.start_date, billing_cycle)
    duration_seconds = (
        (expected_end - sub.start_date).total_seconds()
        if expected_end and sub.start_date
        else (30 * (12 if billing_cycle == "yearly" else 1) * 86400)
    )
    if duration_seconds <= 0:
        duration_seconds = 30 * 86400
    remaining_seconds = (
        (expected_end - timezone.now()).total_seconds()
        if expected_end
        else duration_seconds
    )
    if remaining_seconds < 0:
        remaining_seconds = 0
    if remaining_seconds > duration_seconds:
        remaining_seconds = duration_seconds

    proration_amount = (addon_price * delta) * (remaining_seconds / duration_seconds) if duration_seconds else 0
    proration_amount = float(_apply_gst_amount(proration_amount, "INR"))

    existing_transfer = PendingTransfer.objects.filter(
        organization=org,
        status="pending",
        request_type="addon",
    ).order_by("-created_at").first()
    if existing_transfer:
        if not existing_transfer.reference_no and not existing_transfer.receipt:
            existing_transfer.addon_count = delta
            existing_transfer.amount = round(proration_amount, 2)
            existing_transfer.status = "pending"
            existing_transfer.save()
            send_templated_email(
                (org.owner.email if org.owner else request.user.email),
                "Add-on Purchase Update",
                "emails/addon_purchase.txt",
                {
                    "name": (org.owner.first_name if org.owner and org.owner.first_name else request.user.username),
                    "addon_count": delta,
                    "currency": "INR",
                    "amount": round(proration_amount, 2),
                    "payment_status": "Pending",
                    "status_note": "Please complete the bank transfer to activate add-ons."
                }
            )
            return JsonResponse({
                "redirect": f"/my-account/bank-transfer/{existing_transfer.id}/",
                "message": "Pending add-on request updated. Please complete the payment.",
            })

    PendingTransfer.objects.filter(organization=org, status="draft").delete()
    transfer = PendingTransfer.objects.create(
        organization=org,
        user=request.user,
        plan=plan,
        request_type="addon",
        billing_cycle=sub.billing_cycle,
        retention_days=sub.retention_days,
        addon_count=delta,
        currency="INR",
        amount=round(proration_amount, 2),
        status="draft",
    )

    send_templated_email(
        (org.owner.email if org.owner else request.user.email),
        "Add-on Purchase Update",
        "emails/addon_purchase.txt",
        {
            "name": (org.owner.first_name if org.owner and org.owner.first_name else request.user.username),
            "addon_count": delta,
            "currency": "INR",
            "amount": round(proration_amount, 2),
            "payment_status": "Pending",
            "status_note": "Please complete the bank transfer to activate add-ons."
        }
    )
    return JsonResponse({
        "redirect": f"/my-account/bank-transfer/{transfer.id}/",
        "message": (
            "Addon request created. Proceed to bank transfer."
            if not existing_transfer
            else "New add-on request created. Previous payment is still pending."
        ),
    })


@login_required
@require_http_methods(["GET"])
def screenshots_list(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    nickname = _normalize_text(request.GET.get("nickname"))
    nickname_matches_alias = False
    if nickname:
        nickname_matches_alias = Screenshot.objects.filter(
            employee__org=org,
            employee_name=nickname,
        ).exists()
    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org,
        ).first()

    available_shots = Screenshot.objects.filter(employee__org=org)
    if selected_employee:
        available_shots = available_shots.filter(employee=selected_employee)
    if nickname:
        if nickname_matches_alias:
            available_shots = available_shots.filter(employee_name=nickname)
        else:
            available_shots = available_shots.filter(
                models.Q(employee_name=nickname) | models.Q(employee__name=nickname)
            )
    available_dates = list(
        available_shots
        .annotate(display_time=Coalesce("pc_captured_at", "captured_at"))
        .annotate(day=TruncDate("display_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    shots = Screenshot.objects.filter(employee__org=org)
    if selected_employee:
        shots = shots.filter(employee=selected_employee)
    if nickname:
        if nickname_matches_alias:
            shots = shots.filter(employee_name=nickname)
        else:
            shots = shots.filter(
                models.Q(employee_name=nickname) | models.Q(employee__name=nickname)
            )

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    allowed_presets = {"today", "yesterday", "all"}
    if preset not in allowed_presets:
        preset = None

    if not preset and not date_from_raw and not date_to_raw:
        preset = "today"

    if preset == "today":
        today = timezone.localdate()
        iso_day = today.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "yesterday":
        day = timezone.localdate() - timedelta(days=1)
        iso_day = day.isoformat()
        date_from_raw = iso_day
        date_to_raw = iso_day
    elif preset == "all":
        date_from_raw = None
        date_to_raw = None

    active_preset = preset

    shots = shots.annotate(display_time=Coalesce("pc_captured_at", "captured_at"))

    date_from, date_from_value = _parse_date_flexible(date_from_raw)
    date_to, date_to_value = _parse_date_flexible(date_to_raw)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        shots = shots.filter(display_time__range=date_window)

    shots = shots.order_by("-display_time")

    nicknames = list(
        available_shots
        .annotate(nickname=Coalesce(NullIf("employee_name", Value("")), "employee__name"))
        .values_list("nickname", flat=True)
        .distinct()
        .order_by("nickname")
    )
    nicknames = [name for name in nicknames if name]

    from django.core.paginator import Paginator
    paginator = Paginator(shots, 20)
    page_num = request.GET.get("page")
    page_obj = paginator.get_page(page_num)

    now = timezone.now()
    last_uploads = (
        Screenshot.objects
        .filter(employee__org=org)
        .values("employee_id")
        .annotate(last_uploaded=Max("captured_at"))
    )
    last_activities = (
        Activity.objects
        .filter(employee__org=org)
        .values("employee_id")
        .annotate(last_seen=Max("end_time"))
    )
    last_captures = (
        Screenshot.objects
        .filter(employee__org=org)
        .annotate(capture_time=Coalesce("pc_captured_at", "captured_at"))
        .values("employee_id")
        .annotate(last_captured=Max("capture_time"))
    )
    last_upload_map = {
        row["employee_id"]: row["last_uploaded"]
        for row in last_uploads
        if row.get("employee_id")
    }
    last_activity_map = {
        row["employee_id"]: row["last_seen"]
        for row in last_activities
        if row.get("employee_id")
    }
    last_capture_map = {
        row["employee_id"]: row["last_captured"]
        for row in last_captures
        if row.get("employee_id")
    }
    employee_rows = []
    for employee in employees:
        last_seen = max(
            [
                value
                for value in (
                    last_capture_map.get(employee.id),
                    last_upload_map.get(employee.id),
                    last_activity_map.get(employee.id),
                )
                if value
            ],
            default=None,
        )
        status = _status_from_last_seen(last_seen, now)
        last_uploaded_time = last_upload_map.get(employee.id)
        last_captured_time = last_capture_map.get(employee.id)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "status": status,
            "last_screenshot_uploaded_at": (
                timezone.localtime(last_uploaded_time).isoformat()
                if last_uploaded_time else ""
            ),
            "last_screenshot_captured_at": (
                timezone.localtime(last_captured_time).isoformat()
                if last_captured_time else ""
            ),
        })

    shots_payload = []
    for shot in page_obj:
        display_time = shot.pc_captured_at or shot.captured_at
        upload_time = shot.captured_at
        employee_name = shot.employee_name or shot.employee.name
        shots_payload.append({
            "id": shot.id,
            "employee": employee_name,
            "employee_id": shot.employee_id,
            "captured_at": _format_display_datetime(display_time),
            "captured_at_display": _format_display_datetime(display_time),
            "uploaded_at_display": _format_display_datetime(upload_time),
            "captured_at_iso": (
                timezone.localtime(display_time).isoformat()
                if display_time else ""
            ),
            "uploaded_at_iso": (
                timezone.localtime(upload_time).isoformat()
                if upload_time else ""
            ),
            "image_url": reverse("api_screenshot_image", args=[shot.id]),
        })

    return JsonResponse({
        "server_now": timezone.localtime(timezone.now()).isoformat(),
        "employees": employee_rows,
        "selected_employee_id": selected_employee.id if selected_employee else None,
        "nicknames": nicknames,
        "shots": shots_payload,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
        "pagination": {
            "page": page_obj.number,
            "total_pages": paginator.num_pages,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
            "page_size": paginator.per_page,
            "total_items": paginator.count,
        },
    })


@login_required
@require_http_methods(["DELETE"])
def screenshots_delete(request, shot_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    shot = Screenshot.objects.filter(id=shot_id, employee__org=org).first()
    if not shot:
        return _json_error("screenshot_not_found", status=404)

    dashboard_views.log_admin_activity(
        request.user,
        "Delete Screenshot",
        f"Screenshot ID {shot.id} deleted for {shot.employee.name}",
    )

    if shot.image:
        shot.image.delete(save=False)
    shot.delete()
    return JsonResponse({"deleted": True})


@login_required
@require_http_methods(["POST"])
def screenshots_delete_all(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    shots = Screenshot.objects.filter(employee__org=org)
    deleted_count = 0
    for shot in shots:
        try:
            if shot.image:
                shot.image.delete(save=False)
                deleted_count += 1
        except Exception:
            pass
    shots.delete()

    dashboard_views.log_admin_activity(
        request.user,
        "Delete All Screenshots",
        f"Deleted {deleted_count} screenshots for org {org.name}",
    )

    return JsonResponse({"deleted": True, "count": deleted_count})


@login_required
@require_http_methods(["POST"])
def screenshots_delete_employee(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    employee_id = payload.get("employee_id")

    employee = Employee.objects.filter(id=employee_id, org=org).first()
    if not employee:
        return _json_error("employee_not_found", status=404)

    shots = Screenshot.objects.filter(employee=employee)
    deleted_count = 0
    for shot in shots:
        try:
            if shot.image:
                shot.image.delete(save=False)
                deleted_count += 1
        except Exception:
            pass
    shots.delete()

    dashboard_views.log_admin_activity(
        request.user,
        "Delete Employee Screenshots",
        f"{deleted_count} screenshots deleted for {employee.name}",
    )

    return JsonResponse({"deleted": True, "count": deleted_count})


@login_required
@require_http_methods(["POST"])
def screenshots_delete_selected(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    ids = payload.get("ids") or []
    if not isinstance(ids, list) or not ids:
        return _json_error("No screenshots selected.", status=400)

    shots = (
        Screenshot.objects
        .filter(id__in=ids, employee__org=org)
        .select_related("employee")
    )
    if not shots.exists():
        return JsonResponse({"deleted": False, "count": 0})

    deleted_count = 0
    employee_names = set()
    for shot in shots:
        try:
            if shot.image:
                shot.image.delete(save=False)
            deleted_count += 1
            if shot.employee_id:
                employee_names.add(shot.employee.name)
        except Exception:
            pass
    shots.delete()

    if deleted_count:
        if len(employee_names) == 1:
            employee_name = next(iter(employee_names))
            details = json.dumps({
                "count": deleted_count,
                "employees": [employee_name],
            })
        else:
            details = json.dumps({
                "count": deleted_count,
                "employees": sorted(employee_names),
            })
        dashboard_views.log_admin_activity(
            request.user,
            "Delete Selected Screenshots",
            details,
        )

    return JsonResponse({"deleted": True, "count": deleted_count})


@login_required
@require_http_methods(["GET"])
def activity_live(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employee_id = request.GET.get("employee_id")
    cutoff = timezone.now() - timedelta(hours=24)
    Activity.objects.filter(
        employee__org=org
    ).filter(
        models.Q(end_time__lt=cutoff) |
        models.Q(end_time__isnull=True, start_time__lt=cutoff)
    ).delete()
    logs = (
        Activity.objects
        .filter(employee__org=org, start_time__gte=cutoff)
        .select_related("employee")
    )
    if employee_id:
        logs = logs.filter(employee_id=employee_id)
    search_query = (request.GET.get("q") or "").strip()
    if search_query:
        logs = logs.filter(
            models.Q(employee__name__icontains=search_query) |
            models.Q(app_name__icontains=search_query) |
            models.Q(window_title__icontains=search_query) |
            models.Q(url__icontains=search_query)
        )
    page_number = request.GET.get("page") or 1
    page_size = request.GET.get("page_size") or 20
    try:
        page_number = int(page_number)
    except (TypeError, ValueError):
        page_number = 1
    try:
        page_size = int(page_size)
    except (TypeError, ValueError):
        page_size = 20
    if page_number < 1:
        page_number = 1
    if page_size < 1:
        page_size = 20
    if page_size > 200:
        page_size = 200

    sort_key = (request.GET.get("sort") or "").strip()
    sort_dir = (request.GET.get("dir") or "desc").lower()
    sort_fields = {
        "employee": "employee__name",
        "app": "app_name",
        "window": "window_title",
        "url": "url",
        "start": "start_time",
    }
    sort_field = sort_fields.get(sort_key, "start_time")
    ordering = sort_field if sort_dir == "asc" else f"-{sort_field}"
    logs = logs.order_by(ordering)
    paginator = Paginator(logs, page_size)
    page_obj = paginator.get_page(page_number)

    return JsonResponse({
        "logs": [
            {
                "employee": log.employee.name,
                "app": log.app_name,
                "window": log.window_title,
                "url": log.url,
                "start": _format_datetime(log.start_time),
            }
            for log in page_obj
        ],
        "pagination": {
            "page": page_obj.number,
            "total_pages": paginator.num_pages,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
            "page_size": page_size,
            "total_items": paginator.count,
        },
    })


@login_required
@require_http_methods(["GET"])
def work_activity_log(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    _cleanup_old_monitor_data(org, days=30)
    now = timezone.now()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    gap_minutes = settings_obj.screenshot_interval_minutes or 5
    if gap_minutes < 1:
        gap_minutes = 1
    gap_threshold = timedelta(minutes=gap_minutes)

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    date_from_raw, date_to_raw, active_preset = _resolve_monitor_preset(
        date_from_raw,
        date_to_raw,
        preset,
    )

    date_from, date_from_value = _parse_date_flexible(date_from_raw)
    date_to, date_to_value = _parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )
    activities = activities.select_related("employee").order_by("employee_id", "start_time")
    stop_events = MonitorStopEvent.objects.filter(employee__org=org)
    if selected_employee:
        stop_events = stop_events.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        stop_events = stop_events.filter(stopped_at__range=(start_dt, end_dt))
    stop_events = stop_events.select_related("employee").order_by("employee_id", "stopped_at")

    def format_duration(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    def format_time(value):
        if not value:
            return "-"
        return timezone.localtime(value).strftime("%H:%M:%S")

    def classify_event(reason):
        text = (reason or "").strip().lower()
        if not text:
            return ""
        if any(token in text for token in ["net", "internet", "network", "offline", "disconnect"]):
            return "Net Disconnect"
        if any(token in text for token in ["shutdown", "shut down", "power off"]):
            return "PC Shutdown"
        if any(token in text for token in ["sleep", "suspend", "standby"]):
            return "PC Sleep"
        if any(token in text for token in ["signout", "sign out", "logout", "log out"]):
            return "Sign Out"
        if any(token in text for token in ["restart", "reboot"]):
            return "PC Restart"
        return "Manual Stop"

    def build_sessions(times):
        if not times:
            return []
        ordered = sorted(times)
        sessions = []
        start = ordered[0]
        prev = ordered[0]
        for current in ordered[1:]:
            if current - prev > gap_threshold:
                sessions.append((start, prev))
                start = current
            prev = current
        sessions.append((start, prev))
        return sessions

    STOP_REASON_WINDOW = timedelta(minutes=10)

    def find_stop_event(events, start_time, end_time):
        if not events or not end_time:
            return {"reason": "", "event": ""}

        # Prefer events that happened within the active session or shortly after it ended.
        lower_bound = (start_time or end_time) - timedelta(minutes=2)
        upper_bound = end_time + STOP_REASON_WINDOW
        candidates = [
            event for event in events
            if lower_bound <= event["time"] <= upper_bound
        ]
        if not candidates:
            # Fallback to nearest event within a wider window to avoid losing user-provided reason text.
            wide_window = timedelta(minutes=30)
            candidates = [
                event for event in events
                if abs(event["time"] - end_time) <= wide_window
            ]
        if not candidates:
            return {"reason": "", "event": ""}

        best = min(candidates, key=lambda event: abs(event["time"] - end_time))
        reason = (best.get("reason") or "").strip()
        return {
            "reason": reason,
            "event": classify_event(reason),
        }

    employee_map = {e.id: e.name for e in employees}
    daily_times = defaultdict(list)
    for act in activities:
        activity_time = act.end_time or act.start_time
        if not activity_time:
            continue
        local_time = timezone.localtime(activity_time)
        key = (act.employee_id, local_time.date())
        daily_times[key].append(local_time)

    stop_events_by_day = defaultdict(list)
    for event in stop_events:
        event_time = timezone.localtime(event.stopped_at)
        key = (event.employee_id, event_time.date())
        stop_events_by_day[key].append({
            "time": event_time,
            "reason": (event.reason or "").strip()
        })

    rows = []
    for (employee_id, day), times in daily_times.items():
        sessions = build_sessions(times)
        if not sessions:
            continue
        first_on = sessions[0][0]
        last_off = sessions[-1][1]
        total_seconds = 0
        history_entries = []
        stop_events_for_day = stop_events_by_day.get((employee_id, day), [])
        for start, end in sessions:
            duration_seconds = max(0, (end - start).total_seconds())
            total_seconds += duration_seconds
            stop_info = find_stop_event(stop_events_for_day, start, end)
            history_entries.append({
                "on": format_time(start),
                "off": format_time(end),
                "duration": format_duration(duration_seconds),
                "stop_reason": stop_info["reason"],
                "event": stop_info["event"],
            })
        count = len(sessions)
        label = f"{count} time" if count == 1 else f"{count} times"
        last_stop_reason = history_entries[-1].get("stop_reason") if history_entries else ""
        last_event = history_entries[-1].get("event") if history_entries else ""
        rows.append({
            "employee": employee_map.get(employee_id, "Unknown"),
            "date": day.isoformat(),
            "on_time": format_time(first_on),
            "off_time": format_time(last_off),
            "history_label": label,
            "history": history_entries,
            "duration": format_duration(total_seconds),
            "stop_reason": last_stop_reason,
            "event": last_event,
            "_date": day,
        })

    rows.sort(key=lambda item: (item["_date"], item["employee"]), reverse=True)
    for row in rows:
        row.pop("_date", None)

    employee_rows = []
    for employee in employees:
        status = _status_from_last_seen(employee.last_seen, now)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "status": status,
        })

    return JsonResponse({
        "employees": employee_rows,
        "selected_employee_id": selected_employee.id if selected_employee else None,
        "rows": rows,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
@require_http_methods(["GET"])
def app_usage(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = dashboard_views.get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_app_usage):
        return _json_error("App Usage is not enabled for your current plan.", status=403)

    _cleanup_old_monitor_data(org, days=30)
    now = timezone.now()

    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    date_from_raw, date_to_raw, active_preset = _resolve_monitor_preset(
        date_from_raw,
        date_to_raw,
        preset,
    )

    date_from, date_from_value = _parse_date_flexible(date_from_raw)
    date_to, date_to_value = _parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    app_stats = {}
    total_seconds = 0
    app_urls = {}
    app_url_time = {}
    default_interval = 10
    browser_apps = {
        "chrome.exe", "chrome",
        "msedge.exe", "msedge", "microsoft edge",
        "brave.exe", "brave", "brave browser",
        "firefox.exe", "firefox", "mozilla firefox",
        "safari",
    }

    def simplify_title(title):
        if not title:
            return ""
        return title.split(" - ")[0].strip()

    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        delta = (end - start).total_seconds()
        if delta <= 0:
            delta = default_interval
        key = act.app_name or "Unknown"
        if key.lower() in ("system idle process", "system idle process.exe"):
            continue
        total_seconds += delta
        app_stats[key] = app_stats.get(key, 0) + delta
        if act.url:
            last_time = app_url_time.get(key)
            if not last_time or end > last_time:
                app_urls[key] = act.url
                app_url_time[key] = end
        elif key.lower() in browser_apps and act.window_title:
            last_time = app_url_time.get(key)
            if not last_time or end > last_time:
                app_urls[key] = simplify_title(act.window_title)
                app_url_time[key] = end

    def format_seconds(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    app_rows = []
    for name, secs in sorted(app_stats.items(), key=lambda x: x[1], reverse=True):
        percent = round((secs / total_seconds) * 100, 1) if total_seconds else 0
        app_rows.append({
            "name": name,
            "seconds": secs,
            "duration": format_seconds(secs),
            "percent": percent,
            "url": app_urls.get(name, "-"),
        })

    employee_rows = []
    for employee in employees:
        status = _status_from_last_seen(employee.last_seen, now)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "status": status,
        })

    return JsonResponse({
        "employees": employee_rows,
        "selected_employee_id": selected_employee.id if selected_employee else None,
        "app_rows": app_rows,
        "total_time": format_seconds(total_seconds),
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
@require_http_methods(["GET"])
def app_urls_usage(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = dashboard_views.get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_app_usage):
        return _json_error("App Usage is not enabled for your current plan.", status=403)

    _cleanup_old_monitor_data(org, days=30)
    now = timezone.now()
    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    app_name = (request.GET.get("app") or "").strip()
    query = (request.GET.get("q") or "").strip()

    available_activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    if app_name:
        available_activities = available_activities.filter(app_name=app_name)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    date_from_raw, date_to_raw, active_preset = _resolve_monitor_preset(
        date_from_raw,
        date_to_raw,
        preset,
    )

    date_from, date_from_value = _parse_date_flexible(date_from_raw)
    date_to, date_to_value = _parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if app_name:
        activities = activities.filter(app_name=app_name)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    def simplify_title(title):
        if not title:
            return ""
        return title.split(" - ")[0].strip()

    url_stats = {}
    total_seconds = 0
    default_interval = 10
    browser_apps = {
        "chrome.exe", "chrome",
        "msedge.exe", "msedge", "microsoft edge",
        "brave.exe", "brave", "brave browser",
        "firefox.exe", "firefox", "mozilla firefox",
        "safari",
    }
    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        delta = (end - start).total_seconds()
        if delta <= 0:
            delta = default_interval
        key = (act.url or "").strip()
        if not key and act.app_name and act.app_name.lower() in browser_apps:
            key = simplify_title(act.window_title)
        key = (key or "").strip()
        if not key:
            continue
        if query and query.lower() not in key.lower():
            continue
        total_seconds += delta
        url_stats[key] = url_stats.get(key, 0) + delta

    def format_seconds(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    url_rows = []
    for url_value, secs in sorted(url_stats.items(), key=lambda x: x[1], reverse=True):
        percent = round((secs / total_seconds) * 100, 1) if total_seconds else 0
        url_rows.append({
            "url": url_value,
            "seconds": secs,
            "duration": format_seconds(secs),
            "percent": percent,
        })

    employee_rows = []
    for employee in employees:
        status = _status_from_last_seen(employee.last_seen, now)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "status": status,
        })

    return JsonResponse({
        "employees": employee_rows,
        "selected_employee_id": selected_employee.id if selected_employee else None,
        "app_name": app_name,
        "url_rows": url_rows,
        "total_time": format_seconds(total_seconds),
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
@require_http_methods(["GET"])
def gaming_ott_usage(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = dashboard_views.get_active_subscription(org)
    if not (sub and sub.plan and sub.plan.allow_gaming_ott_usage):
        return _json_error("Gaming / OTT Usage is not enabled for your current plan.", status=403)

    _cleanup_old_monitor_data(org, days=30)
    now = timezone.now()
    employees = Employee.objects.filter(org=org).order_by("name")
    selected_employee = None
    selected_employee_id = request.GET.get("employee_id")
    if selected_employee_id:
        selected_employee = Employee.objects.filter(
            id=selected_employee_id,
            org=org
        ).first()

    keyword_q = dashboard_views.build_gaming_ott_query()

    available_activities = Activity.objects.filter(employee__org=org).filter(keyword_q)
    if selected_employee:
        available_activities = available_activities.filter(employee=selected_employee)
    available_dates = list(
        available_activities
        .annotate(activity_time=Coalesce("end_time", "start_time"))
        .annotate(day=TruncDate("activity_time", tzinfo=timezone.get_current_timezone()))
        .values_list("day", flat=True)
        .distinct()
        .order_by("day")
    )
    available_dates = [d.isoformat() for d in available_dates if d]

    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    preset = request.GET.get("preset")
    date_from_raw, date_to_raw, active_preset = _resolve_monitor_preset(
        date_from_raw,
        date_to_raw,
        preset,
    )

    date_from, date_from_value = _parse_date_flexible(date_from_raw)
    date_to, date_to_value = _parse_date_flexible(date_to_raw)

    activities = Activity.objects.filter(employee__org=org).filter(keyword_q)
    if selected_employee:
        activities = activities.filter(employee=selected_employee)
    if date_from or date_to:
        if not date_from:
            date_from = date_to
        if not date_to:
            date_to = date_from
        if date_from and not date_from_value:
            date_from_value = date_from.isoformat()
        if date_to and not date_to_value:
            date_to_value = date_to.isoformat()
        start_dt = timezone.make_aware(
            datetime.datetime.combine(date_from, datetime.time.min),
            timezone.get_current_timezone(),
        )
        end_dt = timezone.make_aware(
            datetime.datetime.combine(date_to, datetime.time.max),
            timezone.get_current_timezone(),
        )
        date_window = (start_dt, end_dt)
        activities = activities.filter(
            models.Q(end_time__range=date_window) |
            models.Q(start_time__range=date_window)
        )

    activities = activities.select_related("employee").order_by("-end_time", "-start_time")

    def format_duration(seconds):
        seconds = int(seconds or 0)
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours:
            return f"{hours}h {minutes}m"
        if minutes:
            return f"{minutes}m {secs}s"
        return f"{secs}s"

    def format_time(value):
        if not value:
            return "-"
        return timezone.localtime(value).strftime("%H:%M:%S")

    def format_date(value):
        if not value:
            return "-"
        return timezone.localtime(value).date().isoformat()

    rows = []
    for act in activities:
        start = act.start_time or act.end_time
        end = act.end_time or act.start_time
        if not start or not end:
            continue
        duration_seconds = max(0, (end - start).total_seconds())
        detail = (act.url or act.window_title or "-").strip() or "-"
        rows.append({
            "employee": act.employee.name,
            "date": format_date(end or start),
            "app": act.app_name or "Unknown",
            "detail": detail,
            "start": format_time(start),
            "end": format_time(end),
            "duration": format_duration(duration_seconds),
        })

    employee_rows = []
    for employee in employees:
        status = _status_from_last_seen(employee.last_seen, now)
        employee_rows.append({
            "id": employee.id,
            "name": employee.name,
            "status": status,
        })

    return JsonResponse({
        "employees": employee_rows,
        "selected_employee_id": selected_employee.id if selected_employee else None,
        "rows": rows,
        "date_from": date_from_value,
        "date_to": date_to_value,
        "active_preset": active_preset or "",
        "available_dates": available_dates,
    })


@login_required
@require_http_methods(["GET"])
def company_summary(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    employee_count = Employee.objects.filter(org=org).count()
    activity_count = Activity.objects.filter(employee__org=org).count()
    screenshot_count = Screenshot.objects.filter(employee__org=org).count()
    sub = Subscription.objects.filter(organization=org).first()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    privacy_settings, _ = CompanyPrivacySettings.objects.get_or_create(organization=org)
    show_privacy_settings = not dashboard_views.is_super_admin_user(request.user)

    allowed_intervals = list(DEFAULT_ALLOWED_INTERVALS)
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]

    support_active = dashboard_views.has_active_support_access(privacy_settings)
    support_until = privacy_settings.support_access_enabled_until
    support_remaining = ""
    support_duration_selected = privacy_settings.support_access_duration_hours or 2
    if support_active and support_until:
        remaining_seconds = (support_until - timezone.now()).total_seconds()
        support_remaining = dashboard_views.format_duration_compact(remaining_seconds)
    if (
        not privacy_settings.support_access_duration_hours
        and support_until
        and privacy_settings.updated_at
    ):
        duration_seconds = (support_until - privacy_settings.updated_at).total_seconds()
        duration_hours = int(round(duration_seconds / 3600))
        if duration_hours in (1, 2, 4, 8, 12, 24, 48):
            support_duration_selected = duration_hours

    sub_payload = None
    if sub and sub.plan:
        sub_payload = {
            "plan": sub.plan.name,
            "status": sub.status,
            "employee_limit": sub.plan.employee_limit,
            "retention_days": sub.retention_days,
            "plan_retention_days": sub.plan.retention_days,
            "screenshot_min_minutes": sub.plan.screenshot_min_minutes,
            "billing_cycle": sub.billing_cycle,
            "start_date": _format_datetime(sub.start_date),
            "end_date": _format_datetime(sub.end_date),
            "addon_count": sub.addon_count,
            "addon_proration_amount": sub.addon_proration_amount,
            "allow_addons": sub.plan.allow_addons,
        }

    return JsonResponse({
        "org": {
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
            "created_at": _format_datetime(org.created_at),
        },
        "counts": {
            "employees": employee_count,
            "activities": activity_count,
            "screenshots": screenshot_count,
        },
        "subscription": sub_payload,
        "settings": {
            "screenshot_interval_minutes": settings_obj.screenshot_interval_minutes,
            "screenshot_ignore_patterns": settings_obj.screenshot_ignore_patterns or "",
            "privacy_keyword_rules": settings_obj.privacy_keyword_rules or "",
            "auto_blur_password_fields": settings_obj.auto_blur_password_fields,
            "auto_blur_otp_fields": settings_obj.auto_blur_otp_fields,
            "auto_blur_card_fields": settings_obj.auto_blur_card_fields,
            "auto_blur_email_inbox": settings_obj.auto_blur_email_inbox,
        },
        "allowed_intervals": allowed_intervals,
        "privacy": {
            "show": show_privacy_settings,
            "monitoring_mode": privacy_settings.monitoring_mode,
            "support_access_enabled": bool(privacy_settings.support_access_enabled_until),
            "support_access_until": _format_datetime(support_until) if support_until else "",
            "support_remaining": support_remaining,
            "support_active": support_active,
            "support_duration_options": [1, 2, 4, 8, 12, 24, 48],
            "support_duration_selected": support_duration_selected,
        },
    })


@login_required
@require_http_methods(["POST"])
def company_update_name(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    name = (payload.get("name") or "").strip()
    if not name:
        return _json_error("Company name is required.")

    old_name = org.name
    org.name = name
    org.save()

    dashboard_views.log_admin_activity(
        request.user,
        "Update Company Name",
        f"Company name changed from '{old_name}' to '{org.name}'",
    )

    return JsonResponse({"updated": True, "name": org.name})


@login_required
@require_http_methods(["POST"])
def company_update_interval(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    sub = Subscription.objects.filter(organization=org).first()
    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    allowed_intervals = list(DEFAULT_ALLOWED_INTERVALS)
    min_interval = sub.plan.screenshot_min_minutes if sub and sub.plan else None
    if min_interval:
        allowed_intervals = [i for i in allowed_intervals if i >= min_interval]

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    interval = payload.get("interval")
    try:
        interval_val = int(interval)
    except (TypeError, ValueError):
        interval_val = None

    if interval_val not in allowed_intervals:
        return _json_error("Invalid interval selected.", status=400)

    previous_interval = settings_obj.screenshot_interval_minutes
    settings_obj.screenshot_interval_minutes = interval_val
    settings_obj.save()

    dashboard_views.log_admin_activity(
        request.user,
        "Update Screenshot Interval",
        f"Interval changed from {previous_interval} to {interval_val} minute(s)",
    )

    return JsonResponse({"screenshot_interval_minutes": interval_val})


@login_required
@require_http_methods(["POST"])
def company_update_screenshot_privacy(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    patterns = payload.get("ignore_patterns", "")
    keyword_rules = payload.get("privacy_keyword_rules", None)
    auto_blur_password_fields = payload.get("auto_blur_password_fields", None)
    auto_blur_otp_fields = payload.get("auto_blur_otp_fields", None)
    auto_blur_card_fields = payload.get("auto_blur_card_fields", None)
    auto_blur_email_inbox = payload.get("auto_blur_email_inbox", None)
    if patterns is None:
        patterns = ""
    patterns = str(patterns).replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(patterns) > 5000:
        return _json_error("Ignore list is too long.", status=400)

    old_patterns = settings_obj.screenshot_ignore_patterns or ""
    old_keyword_rules = settings_obj.privacy_keyword_rules or ""
    old_flags = {
        "auto_blur_password_fields": settings_obj.auto_blur_password_fields,
        "auto_blur_otp_fields": settings_obj.auto_blur_otp_fields,
        "auto_blur_card_fields": settings_obj.auto_blur_card_fields,
        "auto_blur_email_inbox": settings_obj.auto_blur_email_inbox,
    }

    settings_obj.screenshot_ignore_patterns = patterns
    if keyword_rules is not None:
        keyword_rules = str(keyword_rules).replace("\r\n", "\n").replace("\r", "\n").strip()
        if len(keyword_rules) > 5000:
            return _json_error("Keyword list is too long.", status=400)
        settings_obj.privacy_keyword_rules = keyword_rules
    if auto_blur_password_fields is not None:
        settings_obj.auto_blur_password_fields = bool(auto_blur_password_fields)
    if auto_blur_otp_fields is not None:
        settings_obj.auto_blur_otp_fields = bool(auto_blur_otp_fields)
    if auto_blur_card_fields is not None:
        settings_obj.auto_blur_card_fields = bool(auto_blur_card_fields)
    if auto_blur_email_inbox is not None:
        settings_obj.auto_blur_email_inbox = bool(auto_blur_email_inbox)
    settings_obj.save()

    changes = []
    if old_patterns != (settings_obj.screenshot_ignore_patterns or ""):
        changes.append("ignore patterns")
    if old_keyword_rules != (settings_obj.privacy_keyword_rules or ""):
        changes.append("privacy keywords")
    if old_flags["auto_blur_password_fields"] != settings_obj.auto_blur_password_fields:
        changes.append("password blur")
    if old_flags["auto_blur_otp_fields"] != settings_obj.auto_blur_otp_fields:
        changes.append("OTP blur")
    if old_flags["auto_blur_card_fields"] != settings_obj.auto_blur_card_fields:
        changes.append("card blur")
    if old_flags["auto_blur_email_inbox"] != settings_obj.auto_blur_email_inbox:
        changes.append("email inbox blur")
    if changes:
        dashboard_views.log_admin_activity(
            request.user,
            "Update Screenshot Privacy",
            f"Updated: {', '.join(changes)}",
        )

    return JsonResponse({
        "updated": True,
        "screenshot_ignore_patterns": settings_obj.screenshot_ignore_patterns or "",
        "privacy_keyword_rules": settings_obj.privacy_keyword_rules or "",
        "auto_blur_password_fields": settings_obj.auto_blur_password_fields,
        "auto_blur_otp_fields": settings_obj.auto_blur_otp_fields,
        "auto_blur_card_fields": settings_obj.auto_blur_card_fields,
        "auto_blur_email_inbox": settings_obj.auto_blur_email_inbox,
    })


@login_required
@require_http_methods(["POST"])
def company_update_privacy(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    if dashboard_views.is_super_admin_user(request.user):
        return _json_error("Access denied.", status=403)

    privacy_settings, _ = CompanyPrivacySettings.objects.get_or_create(organization=org)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    monitoring_mode = (payload.get("monitoring_mode") or "").strip()
    valid_modes = {choice[0] for choice in CompanyPrivacySettings.MONITORING_MODES}
    if monitoring_mode not in valid_modes:
        return _json_error("Invalid monitoring mode selected.", status=400)

    previous_mode = privacy_settings.monitoring_mode
    privacy_settings.monitoring_mode = monitoring_mode
    if monitoring_mode != "privacy_lock":
        privacy_settings.support_access_enabled_until = None
        privacy_settings.support_access_duration_hours = None
    privacy_settings.save()

    dashboard_views.log_admin_activity(
        request.user,
        "Update Privacy Mode",
        f"Monitoring mode changed from '{previous_mode}' to '{privacy_settings.monitoring_mode}'",
    )

    return JsonResponse({
        "updated": True,
        "monitoring_mode": privacy_settings.monitoring_mode,
    })


@login_required
@require_http_methods(["POST"])
def company_update_support(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    if dashboard_views.is_super_admin_user(request.user):
        return _json_error("Access denied.", status=403)

    privacy_settings, _ = CompanyPrivacySettings.objects.get_or_create(organization=org)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    support_enabled = bool(payload.get("support_access_enabled"))
    try:
        support_hours = int(payload.get("support_access_hours") or 2)
    except (TypeError, ValueError):
        support_hours = 2
    if support_hours not in (1, 2, 4, 8, 12, 24, 48):
        support_hours = 2

    if privacy_settings.monitoring_mode != "privacy_lock":
        privacy_settings.support_access_enabled_until = None
        privacy_settings.support_access_duration_hours = None
        privacy_settings.save()
        return _json_error("Support access is available only in Privacy Lock mode.", status=400)

    previous_enabled_until = privacy_settings.support_access_enabled_until
    previous_hours = privacy_settings.support_access_duration_hours
    privacy_settings.support_access_duration_hours = support_hours
    if support_enabled:
        privacy_settings.support_access_enabled_until = timezone.now() + timedelta(hours=support_hours)
    else:
        privacy_settings.support_access_enabled_until = None
    privacy_settings.save()

    dashboard_views.log_admin_activity(
        request.user,
        "Update Support Access",
        (
            "Support access updated: "
            f"enabled={support_enabled}, hours={support_hours}, "
            f"previous_hours={previous_hours}, "
            f"previous_until={_format_datetime(previous_enabled_until) if previous_enabled_until else '-'}"
        ),
    )

    support_active = dashboard_views.has_active_support_access(privacy_settings)
    support_until = privacy_settings.support_access_enabled_until
    support_remaining = ""
    if support_active and support_until:
        remaining_seconds = (support_until - timezone.now()).total_seconds()
        support_remaining = dashboard_views.format_duration_compact(remaining_seconds)

    return JsonResponse({
        "updated": True,
        "support_access_enabled": support_enabled,
        "support_access_until": _format_datetime(support_until) if support_until else "",
        "support_remaining": support_remaining,
    })


@login_required
@require_http_methods(["GET"])
def billing_summary(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    product_slug = (request.GET.get("product") or "").strip() or None

    if product_slug in ("storage", "online-storage"):
        from apps.backend.storage.services import get_active_storage_subscription
        from apps.backend.storage.models import OrgAddOn as StorageOrgAddOn
        from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription

        active_storage_sub = get_active_storage_subscription(org)
        # If storage uses core Subscription (has billing_cycle), fall through to the main flow.
        if active_storage_sub and hasattr(active_storage_sub, "billing_cycle"):
            pass
        else:
            latest_storage_sub = (
                StorageOrgSubscription.objects
                .filter(organization=org)
                .select_related("plan", "product")
                .order_by("-updated_at")
                .first()
            )
            show_currency = "INR"
            sub_payload = None
            if active_storage_sub and active_storage_sub.plan:
                plan = active_storage_sub.plan
                monthly_price = (
                    getattr(plan, "monthly_price_inr", None)
                    or getattr(plan, "monthly_price", None)
                    or 0
                )
                yearly_price = (
                    getattr(plan, "yearly_price_inr", None)
                    or getattr(plan, "yearly_price", None)
                    or 0
                )
                addon_count = (
                    StorageOrgAddOn.objects
                    .filter(organization=org, addon__product=active_storage_sub.product)
                    .aggregate(total=models.Sum("quantity"))
                    .get("total")
                    or 0
                )
                sub_payload = {
                    "plan": plan.name,
                    "status": active_storage_sub.status,
                    "employee_limit": None,
                    "start_date": _format_datetime(active_storage_sub.created_at),
                    "end_date": active_storage_sub.renewal_date.isoformat() if active_storage_sub.renewal_date else "",
                    "billing_cycle": "monthly",
                    "retention_days": None,
                    "addon_count": addon_count,
                    "addon_proration_amount": 0,
                    "prices": {
                        "monthly": float(monthly_price or 0),
                        "yearly": float(yearly_price or 0),
                        "addon_monthly": 0,
                        "addon_yearly": 0,
                    },
                    "currency": show_currency,
                    "allow_addons": False,
                    "limits": {
                        "storage_gb": getattr(plan, "storage_limit_gb", 0),
                        "max_users": getattr(plan, "max_users", 0),
                        "bandwidth_limit_gb_monthly": getattr(plan, "bandwidth_limit_gb_monthly", 0),
                        "is_bandwidth_limited": getattr(plan, "is_bandwidth_limited", True),
                        "device_limit_per_user": getattr(plan, "device_limit_per_user", 1),
                    },
                    "features": {},
                }

            history_payload = []
            if latest_storage_sub and latest_storage_sub.plan:
                end_date = latest_storage_sub.renewal_date
                is_expired = bool(end_date and end_date < timezone.localdate()) or latest_storage_sub.status == "expired"
                status_label = "Expired" if is_expired else ""
                history_payload.append({
                    "plan_id": latest_storage_sub.plan_id,
                    "plan": latest_storage_sub.plan.name,
                    "status": latest_storage_sub.status,
                    "status_label": status_label,
                    "action_label": "Started",
                    "start_date": _format_datetime(latest_storage_sub.created_at),
                    "end_date": end_date.isoformat() if end_date else "",
                    "billing_cycle": "monthly",
                    "end_ts": None,
                    "days_remaining": None,
                    "renew_window_days": None,
                    "renew_available": False,
                    "renew_pending": False,
                    "created_at": latest_storage_sub.created_at,
                })

            return JsonResponse({
                "subscription": sub_payload,
                "history_entries": history_payload,
                "pending_transfers": [],
                "approved_transfers": [],
                "show_currency": show_currency,
            })

    if product_slug:
        product_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter = product_filter | Q(plan__product__isnull=True)
        sub = (
            Subscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .filter(product_filter)
            .select_related("plan")
            .order_by("-start_date")
            .first()
        )
        if sub and not dashboard_views.is_subscription_active(sub):
            sub = None
    else:
        sub = dashboard_views.get_active_subscription(org)
        if not sub:
            sub = dashboard_views.ensure_active_subscription(org)

    PendingTransfer.objects.filter(organization=org, status="draft").delete()
    history_entries = SubscriptionHistory.objects.filter(
        organization=org
    ).exclude(status="rejected").order_by("-start_date")
    if product_slug:
        history_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            history_filter = history_filter | Q(plan__product__isnull=True)
        history_entries = history_entries.filter(history_filter)
    if sub and not history_entries.exists():
        dashboard_views.record_subscription_history(
            org=org,
            user=sub.user,
            plan=sub.plan,
            status=sub.status,
            start_date=sub.start_date,
            end_date=sub.end_date,
            billing_cycle=sub.billing_cycle,
        )
        history_entries = SubscriptionHistory.objects.filter(
            organization=org
        ).exclude(status="rejected").order_by("-start_date")
        if product_slug:
            history_filter = Q(plan__product__slug=product_slug)
            if product_slug == "monitor":
                history_filter = history_filter | Q(plan__product__isnull=True)
            history_entries = history_entries.filter(history_filter)

    free_plan = Plan.objects.filter(name__iexact="free").first()
    if product_slug:
        free_filter = Q(product__slug=product_slug)
        if product_slug == "monitor":
            free_filter = free_filter | Q(product__isnull=True)
        free_plan = Plan.objects.filter(name__iexact="free").filter(free_filter).first()
    if free_plan and not history_entries.filter(plan=free_plan).exists():
        oldest = SubscriptionHistory.objects.filter(organization=org)
        if product_slug:
            oldest_filter = Q(plan__product__slug=product_slug)
            if product_slug == "monitor":
                oldest_filter = oldest_filter | Q(plan__product__isnull=True)
            oldest = oldest.filter(oldest_filter)
        oldest = oldest.order_by("start_date").first()
        free_start = org.created_at or timezone.now()
        free_end = dashboard_views.get_free_trial_end_date(free_start)
        if oldest and oldest.start_date and oldest.start_date < free_end:
            free_end = oldest.start_date
        free_status = "expired" if free_end and free_end < timezone.now() else "active"
        dashboard_views.record_subscription_history(
            org=org,
            user=sub.user if sub else request.user,
            plan=free_plan,
            status=free_status,
            start_date=free_start,
            end_date=free_end,
            billing_cycle="monthly",
        )
        history_entries = SubscriptionHistory.objects.filter(
            organization=org
        ).exclude(status="rejected").order_by("-start_date")
        if product_slug:
            history_filter = Q(plan__product__slug=product_slug)
            if product_slug == "monitor":
                history_filter = history_filter | Q(plan__product__isnull=True)
            history_entries = history_entries.filter(history_filter)

    pending_transfers = PendingTransfer.objects.filter(
        status="pending",
        organization=org
    ).order_by("-created_at")
    approved_transfers = PendingTransfer.objects.filter(
        status="approved",
        organization=org
    ).order_by("-updated_at")
    rejected_transfers = PendingTransfer.objects.filter(
        status="rejected",
        organization=org
    ).order_by("-updated_at")
    if product_slug:
        transfer_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            transfer_filter = transfer_filter | Q(plan__product__isnull=True)
        pending_transfers = pending_transfers.filter(transfer_filter)
        approved_transfers = approved_transfers.filter(transfer_filter)
        rejected_transfers = rejected_transfers.filter(transfer_filter)

    if sub:
        base_transfer = approved_transfers.filter(request_type__in=("new", "renew")).first()
        base_addons = 0
        base_time = None
        if base_transfer and base_transfer.plan and base_transfer.plan.allow_addons:
            base_addons = base_transfer.addon_count or 0
            base_time = base_transfer.updated_at or base_transfer.created_at
        addon_transfers = approved_transfers.filter(request_type="addon")
        if base_time:
            addon_transfers = addon_transfers.filter(updated_at__gt=base_time)
        addon_total = base_addons + sum(t.addon_count or 0 for t in addon_transfers)
        last_addon_approved = approved_transfers.filter(request_type="addon").first()
        update_fields = []
        if addon_total != (sub.addon_count or 0):
            sub.addon_count = addon_total
            update_fields.append("addon_count")
        if last_addon_approved:
            approved_at = last_addon_approved.updated_at or last_addon_approved.created_at
            if approved_at and (not sub.addon_last_proration_at or approved_at > sub.addon_last_proration_at):
                sub.addon_last_proration_at = approved_at
                sub.addon_proration_amount = last_addon_approved.amount or sub.addon_proration_amount
                update_fields.extend(["addon_last_proration_at", "addon_proration_amount"])
        if update_fields:
            sub.save(update_fields=list(dict.fromkeys(update_fields)))

    show_currency = "INR"
    currency_source = approved_transfers.filter(
        request_type__in=("new", "renew")
    ).order_by("-updated_at").first()
    if not currency_source:
        currency_source = pending_transfers.filter(
            request_type__in=("new", "renew")
        ).order_by("-created_at").first()
    if currency_source and currency_source.currency:
        show_currency = currency_source.currency

    sub_payload = None
    if sub and sub.plan:
        plan = sub.plan
        limits = plan.limits if isinstance(plan.limits, dict) else {}
        features = plan.features if isinstance(plan.features, dict) else {}
        if show_currency == "USD":
            prices = {
                "monthly": plan.usd_monthly_price,
                "yearly": plan.usd_yearly_price,
                "addon_monthly": plan.addon_usd_monthly_price,
                "addon_yearly": plan.addon_usd_yearly_price,
            }
        else:
            prices = {
                "monthly": plan.monthly_price,
                "yearly": plan.yearly_price,
                "addon_monthly": plan.addon_monthly_price,
                "addon_yearly": plan.addon_yearly_price,
            }
        sub_payload = {
            "plan": plan.name,
            "status": sub.status,
            "employee_limit": plan.employee_limit,
            "start_date": _format_datetime(sub.start_date),
            "end_date": _format_datetime(sub.end_date),
            "billing_cycle": sub.billing_cycle,
            "retention_days": sub.retention_days,
            "addon_count": sub.addon_count,
            "addon_proration_amount": sub.addon_proration_amount,
            "prices": prices,
            "currency": show_currency,
            "allow_addons": plan.allow_addons,
            "limits": limits,
            "features": features,
        }

    now = timezone.now()
    pending_renew_plans = set(
        pending_transfers.filter(request_type__in=("new", "renew")).values_list(
            "plan_id",
            flat=True,
        )
    )
    history_rows = list(history_entries)
    history_payload = []
    latest_history = {}
    for index, entry in enumerate(history_rows):
        end_date = entry.end_date
        if (
            sub
            and entry.status == "active"
            and entry.plan_id
            and entry.plan_id == sub.plan_id
            and sub.end_date
        ):
            end_date = sub.end_date
        key = (entry.plan_id, entry.billing_cycle or "monthly")
        existing = latest_history.get(key)
        candidate_end_ts = int(end_date.timestamp()) if end_date else None
        if existing:
            existing_end_ts = existing.get("end_ts")
            existing_created = existing.get("created_at")
            candidate_created = entry.created_at
            if candidate_end_ts and existing_end_ts and candidate_end_ts <= existing_end_ts:
                continue
            if not candidate_end_ts and existing_end_ts:
                continue
            if not candidate_end_ts and not existing_end_ts and existing_created and candidate_created:
                if candidate_created <= existing_created:
                    continue
        is_expired = bool(end_date and end_date < now) or entry.status == "expired"
        expires_soon = False
        days_remaining = None
        monthly_window = getattr(settings, "RENEW_WINDOW_DAYS_MONTHLY", 7)
        yearly_window = getattr(settings, "RENEW_WINDOW_DAYS_YEARLY", 15)
        renew_window_days = yearly_window if entry.billing_cycle == "yearly" else monthly_window
        if end_date:
            remaining = (end_date - now).total_seconds()
            days_remaining = max(int(math.ceil(remaining / 86400)), 0)
            if not is_expired and days_remaining <= renew_window_days:
                expires_soon = True
        pending_renew = entry.plan_id in pending_renew_plans
        renew_available = bool(entry.plan_id) and (is_expired or expires_soon)
        if is_expired:
            status_label = f"Expired on {_format_datetime(end_date)}" if end_date else "Expired"
        elif pending_renew:
            status_label = "Waiting for approval"
        elif expires_soon:
            status_label = f"Expiring on {_format_datetime(end_date)}" if end_date else "Expiring soon"
        else:
            status_label = ""
        action_label = ""
        previous_entry = history_rows[index + 1] if index + 1 < len(history_rows) else None
        if entry.plan:
            if not previous_entry or not previous_entry.plan:
                action_label = "Started"
            elif entry.plan_id == previous_entry.plan_id:
                action_label = "Renewed"
            else:
                current_rank = _plan_rank(entry.plan)
                previous_rank = _plan_rank(previous_entry.plan)
                if current_rank > previous_rank:
                    action_label = f"Upgraded to {entry.plan.name}"
                elif current_rank < previous_rank:
                    action_label = f"Downgraded to {entry.plan.name}"
                else:
                    action_label = f"Changed to {entry.plan.name}"
        row = {
            "plan_id": entry.plan_id,
            "plan": entry.plan.name if entry.plan else "-",
            "status": entry.status,
            "status_label": status_label,
            "action_label": action_label,
            "start_date": _format_datetime(entry.start_date),
            "end_date": _format_datetime(end_date),
            "billing_cycle": entry.billing_cycle,
            "end_ts": candidate_end_ts,
            "days_remaining": days_remaining,
            "renew_window_days": renew_window_days,
            "renew_available": renew_available and not pending_renew,
            "renew_pending": pending_renew,
            "created_at": entry.created_at,
        }
        latest_history[key] = row
    history_payload = list(latest_history.values())
    history_payload.sort(
        key=lambda item: (item.get("end_ts") or 0, item.get("created_at") or now),
        reverse=True
    )

    approved_payload = [
        {
            "id": t.id,
            "request_type": t.request_type,
            "payment_type": "bank_transfer",
            "plan": t.plan.name if t.plan else "-",
            "amount": t.amount,
            "currency": t.currency,
            "status": "approved",
            "status_label": "",
            "updated_at": _format_datetime(t.updated_at),
            "invoice_available": True,
            "reference_no": t.reference_no or "",
            "receipt_url": t.receipt.url if t.receipt else "",
            "billing_cycle": t.billing_cycle,
            "addon_count": t.addon_count or 0,
            "tax_rate": float(_gst_rate(t.currency or "INR") * Decimal("100")),
        }
        for t in approved_transfers
    ]
    approved_payload.extend([
        {
            "id": t.id,
            "request_type": t.request_type,
            "payment_type": "bank_transfer",
            "plan": t.plan.name if t.plan else "-",
            "amount": t.amount,
            "currency": t.currency,
            "status": "rejected",
            "status_label": "Your Transaction Rejected",
            "updated_at": _format_datetime(t.updated_at),
            "invoice_available": False,
            "reference_no": t.reference_no or "",
            "receipt_url": t.receipt.url if t.receipt else "",
            "billing_cycle": t.billing_cycle,
            "addon_count": t.addon_count or 0,
            "tax_rate": float(_gst_rate(t.currency or "INR") * Decimal("100")),
        }
        for t in rejected_transfers
    ])
    approved_payload.sort(key=lambda row: row.get("updated_at") or "", reverse=True)

    pending_payload = [
        {
            "id": t.id,
            "request_type": t.request_type,
            "payment_type": "bank_transfer",
            "plan": t.plan.name if t.plan else "-",
            "amount": t.amount,
            "currency": t.currency,
            "status": t.status,
            "status_label": "Awaiting payment" if t.status == "draft" else "Waiting for approval",
            "created_at": _format_datetime(t.created_at),
            "invoice_available": False,
        }
        for t in pending_transfers
    ]
    pending_payload.extend([
        {
            "id": t.id,
            "request_type": t.request_type,
            "payment_type": "bank_transfer",
            "plan": t.plan.name if t.plan else "-",
            "amount": t.amount,
            "currency": t.currency,
            "status": "rejected",
            "status_label": "Rejected",
            "created_at": _format_datetime(t.updated_at),
            "invoice_available": False,
        }
        for t in rejected_transfers
    ])
    pending_payload.sort(key=lambda row: row.get("created_at") or "", reverse=True)

    return JsonResponse({
        "subscription": sub_payload,
        "history_entries": history_payload,
        "approved_transfers": approved_payload,
        "pending_transfers": pending_payload,
        "show_currency": show_currency,
    })


@login_required
@require_http_methods(["GET", "POST"])
def billing_profile(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    profile = BillingProfile.objects.filter(organization=org).first()
    if request.method == "GET":
        missing_fields = _billing_profile_missing_fields(profile)
        return JsonResponse({
            "profile": _billing_profile_payload(profile),
            "complete": not missing_fields,
            "missing_fields": missing_fields,
        })

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    phone_value = _normalize_text(payload.get("phone"))
    phone_country = _normalize_text(payload.get("phone_country"))
    if phone_value and phone_country and phone_country.startswith("+") and not phone_value.startswith("+"):
        phone_value = f"{phone_country} {phone_value}"

    incoming = {
        "contact_name": _normalize_text(payload.get("contact_name")),
        "company_name": _normalize_text(payload.get("company_name")),
        "email": _normalize_text(payload.get("email")),
        "phone": phone_value,
        "address_line1": _normalize_text(payload.get("address_line1")),
        "address_line2": _normalize_text(payload.get("address_line2")),
        "city": _normalize_text(payload.get("city")),
        "state": _normalize_text(payload.get("state")),
        "postal_code": _normalize_text(payload.get("postal_code")),
        "country": _normalize_text(payload.get("country")) or "India",
        "gstin": _normalize_text(payload.get("gstin")).upper(),
    }

    missing_fields = [
        key
        for key in [
            "contact_name",
            "company_name",
            "email",
            "phone",
            "address_line1",
            "city",
            "state",
            "postal_code",
            "country",
        ]
        if not incoming.get(key)
    ]
    if missing_fields:
        return _json_error(
            "billing_profile_incomplete",
            status=400,
            extra={"missing_fields": missing_fields},
        )
    if incoming["gstin"] and not _validate_gstin(incoming["gstin"]):
        return _json_error("invalid_gstin", status=400)

    if profile:
        for field, value in incoming.items():
            setattr(profile, field, value)
        profile.save()
    else:
        profile = BillingProfile.objects.create(organization=org, **incoming)

    settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
    current_timezone = normalize_timezone(settings_obj.org_timezone, fallback="UTC")
    country_timezone = resolve_default_timezone(country=incoming.get("country"), browser_timezone="", fallback=current_timezone)
    if current_timezone == "UTC" and country_timezone != current_timezone:
        settings_obj.org_timezone = country_timezone
        settings_obj.save(update_fields=["org_timezone"])

    return JsonResponse({
        "profile": _billing_profile_payload(profile),
        "complete": True,
        "missing_fields": [],
    })


@login_required
@require_http_methods(["GET"])
def billing_invoice_pdf(request, transfer_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    transfer = get_object_or_404(
        PendingTransfer,
        id=transfer_id,
        organization=org,
    )
    if transfer.status != "approved":
        return _json_error("invoice_not_available", status=400)

    billing_profile = BillingProfile.objects.filter(organization=org).first()
    billing_profile_missing = False
    if not billing_profile:
        billing_profile_missing = True
        billing_profile = SimpleNamespace(
            contact_name=org.name,
            company_name=org.name,
            address_line1="-",
            address_line2="",
            city="-",
            state="",
            postal_code="-",
            country="India",
            email=request.user.email or "-",
            gstin="",
        )

    seller = _invoice_seller()
    invoice_number = _build_invoice_number(transfer)
    invoice_date = timezone.localtime(
        transfer.updated_at or transfer.created_at or timezone.now()
    ).strftime("%b %d, %Y")
    currency = transfer.currency or "INR"
    tax_rate = _gst_rate(currency)
    sub, plan_start, plan_end, addon_start, addon_end = _invoice_periods_for_transfer(transfer)
    recalculated_total = _recalculate_addon_total(transfer, addon_start, addon_end, currency)
    total_amount = _money(transfer.amount)
    if recalculated_total is not None and recalculated_total != total_amount:
        total_amount = recalculated_total
        transfer.amount = float(total_amount)
        transfer.save(update_fields=["amount"])
    base_amount = total_amount
    if tax_rate > 0:
        base_amount = _money(total_amount / (Decimal("1.00") + tax_rate))
    intra_state = _is_intra_state(
        billing_profile.state,
        billing_profile.gstin,
        billing_profile.country,
    )
    cgst = _money(base_amount * tax_rate / 2) if intra_state else Decimal("0.00")
    sgst = _money(base_amount * tax_rate / 2) if intra_state else Decimal("0.00")
    igst = _money(base_amount * tax_rate) if not intra_state else Decimal("0.00")
    total = _money(base_amount + cgst + sgst + igst)

    response = HttpResponse(content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="invoice-{invoice_number}.pdf"'
    )
    doc = canvas.Canvas(response, pagesize=A4)
    width, height = A4
    left = 18 * mm
    right = 115 * mm
    y = height - 20 * mm

    doc.setFont("Helvetica-Bold", 14)
    doc.drawString(left, y, seller.get("name", "Work Zilla Work Suite"))
    doc.setFont("Helvetica-Bold", 16)
    doc.drawString(right, y, "INVOICE")

    seller_lines = [
        seller.get("address_line1", ""),
        seller.get("address_line2", ""),
        f"{seller.get('city', '')} {seller.get('state', '')} {seller.get('postal_code', '')}".strip(),
        seller.get("country", ""),
    ]
    doc.setFont("Helvetica", 9)
    y -= 8 * mm
    for line in seller_lines:
        if not line:
            continue
        doc.drawString(left, y, line)
        y -= 4 * mm

    doc.drawString(left, y, f"SAC: {seller.get('sac', '997331')}")
    y -= 4 * mm
    if seller.get("gstin"):
        doc.drawString(left, y, f"GSTIN: {seller.get('gstin')}")

    invoice_meta_y = height - 30 * mm
    doc.setFont("Helvetica", 9)
    doc.drawString(right, invoice_meta_y, f"Invoice # {invoice_number}")
    doc.drawString(right, invoice_meta_y - 4 * mm, f"Invoice Date {invoice_date}")
    doc.drawString(
        right,
        invoice_meta_y - 8 * mm,
        f"Invoice Amount {_format_currency(currency, total)}",
    )
    doc.drawString(
        right,
        invoice_meta_y - 12 * mm,
        f"Customer ID {org.company_key or org.id}",
    )

    doc.setFillColorRGB(0.10, 0.55, 0.25)
    doc.setFont("Helvetica-Bold", 10)
    doc.drawString(right, invoice_meta_y - 18 * mm, "PAID")
    doc.setFillColorRGB(0, 0, 0)

    billed_y = invoice_meta_y - 30 * mm
    doc.setFont("Helvetica-Bold", 9)
    doc.drawString(left, billed_y, "BILLED TO")
    doc.setFont("Helvetica", 9)
    billed_lines = [
        billing_profile.contact_name,
        billing_profile.company_name,
        billing_profile.address_line1,
        billing_profile.address_line2,
        f"{billing_profile.city}, {billing_profile.state} {billing_profile.postal_code}".strip(),
        billing_profile.country,
        billing_profile.email,
        f"GSTIN: {billing_profile.gstin}" if billing_profile.gstin else "GSTIN: -",
    ]
    for line in billed_lines:
        if not line:
            continue
        billed_y -= 4 * mm
        doc.drawString(left, billed_y, line)
    if billing_profile_missing:
        billed_y -= 6 * mm
        doc.setFillColorRGB(0.75, 0.1, 0.1)
        doc.drawString(left, billed_y, "Billing profile missing. Details shown are placeholders.")
        doc.setFillColorRGB(0, 0, 0)

    sub_y = invoice_meta_y - 30 * mm
    doc.setFont("Helvetica-Bold", 9)
    doc.drawString(right, sub_y, "SUBSCRIPTION")
    doc.setFont("Helvetica", 9)
    sub_y -= 4 * mm
    doc.drawString(right, sub_y, f"ID {transfer.id}")
    sub_y -= 4 * mm
    doc.drawString(
        right,
        sub_y,
        f"Billing Cycle {_title_case(transfer.billing_cycle)}",
    )

    table_top = billed_y - 12 * mm
    doc.setFont("Helvetica-Bold", 9)
    doc.drawString(left, table_top, "DESCRIPTION")
    doc.drawString(left + 90 * mm, table_top, "SAC")
    doc.drawString(left + 110 * mm, table_top, "UNITS")
    doc.drawString(left + 130 * mm, table_top, "UNIT PRICE")
    doc.drawRightString(width - 20 * mm, table_top, "AMOUNT")
    doc.line(left, table_top - 2 * mm, width - 18 * mm, table_top - 2 * mm)

    row_y = table_top - 8 * mm
    doc.setFont("Helvetica", 9)
    plan_label = transfer.plan.name if transfer.plan else "Plan"
    sac_code = seller.get("sac", "997331")
    plan_unit_price = dashboard_views.get_plan_amount(
        transfer.plan,
        transfer.billing_cycle,
        currency=currency,
    ) if transfer.plan else base_amount
    plan_unit_price = _money(plan_unit_price)
    addon_qty = int(transfer.addon_count or 0)
    addon_unit_price = _addon_price(transfer.plan, transfer.billing_cycle, currency)
    addon_total = _money(addon_unit_price * Decimal(addon_qty))
    plan_total = _money(plan_unit_price)
    if addon_qty and base_amount:
        plan_total = _money(base_amount - addon_total)

    is_addon_only = transfer.request_type == "addon"
    plan_period = _format_invoice_period(plan_start, plan_end)
    plan_desc = f"{plan_label} ({plan_period})" if plan_period else plan_label

    if not is_addon_only:
        doc.drawString(left, row_y, plan_desc)
        doc.drawString(left + 90 * mm, row_y, str(sac_code))
        doc.drawString(left + 112 * mm, row_y, "1")
        doc.drawString(left + 130 * mm, row_y, _format_currency(currency, plan_unit_price))
        doc.drawRightString(width - 20 * mm, row_y, _format_currency(currency, plan_total))
        doc.line(left, row_y - 4 * mm, width - 18 * mm, row_y - 4 * mm)
        row_y -= 8 * mm

    if addon_qty or is_addon_only:
        addon_period = _format_invoice_period(addon_start, addon_end)
        remaining_days, duration_days = _invoice_proration_days(transfer.billing_cycle, addon_start, addon_end)
        days_label = ""
        if remaining_days is not None and duration_days is not None:
            days_label = f", {remaining_days}/{duration_days} days"
        addon_desc = f"Add-on Users ({addon_period}{days_label})" if addon_period else "Add-on Users"

        addon_line_total = addon_total
        addon_line_unit = addon_unit_price
        if is_addon_only and base_amount:
            addon_line_total = base_amount
            addon_line_unit = _money((base_amount / Decimal(addon_qty)) if addon_qty else base_amount)

        desc_width = 88 * mm
        doc.setFont("Helvetica-Bold", 9)
        doc.drawString(left, row_y, "Work Suite")
        doc.setFont("Helvetica", 9)
        addon_lines = _wrap_text_lines(addon_desc, desc_width - 20 * mm, doc)
        doc.drawString(left + 20 * mm, row_y, addon_lines[0])
        for extra_line in addon_lines[1:]:
            row_y -= 4 * mm
            doc.drawString(left + 20 * mm, row_y, extra_line)
        doc.drawString(left + 90 * mm, row_y, str(sac_code))
        doc.drawString(left + 112 * mm, row_y, str(addon_qty or 0))
        doc.drawString(left + 130 * mm, row_y, _format_currency(currency, addon_line_unit))
        doc.drawRightString(width - 20 * mm, row_y, _format_currency(currency, addon_line_total))
        doc.line(left, row_y - 4 * mm, width - 18 * mm, row_y - 4 * mm)

    summary_y = row_y - 12 * mm
    doc.setFont("Helvetica", 9)
    doc.drawRightString(width - 20 * mm, summary_y, f"Sub Total {_format_currency(currency, base_amount)}")
    summary_y -= 5 * mm
    if intra_state:
        doc.drawRightString(width - 20 * mm, summary_y, f"CGST @ 9% {_format_currency(currency, cgst)}")
        summary_y -= 5 * mm
        doc.drawRightString(width - 20 * mm, summary_y, f"SGST @ 9% {_format_currency(currency, sgst)}")
    else:
        doc.drawRightString(width - 20 * mm, summary_y, f"IGST @ 18% {_format_currency(currency, igst)}")
    summary_y -= 6 * mm
    doc.setFont("Helvetica-Bold", 10)
    doc.drawRightString(width - 20 * mm, summary_y, f"Total {_format_currency(currency, total)}")

    payment_y = summary_y - 14 * mm
    paid_on = timezone.localtime(
        transfer.updated_at or transfer.created_at or timezone.now()
    ).strftime("%d %b %Y, %I:%M %p")
    doc.setFont("Helvetica-Bold", 9)
    doc.drawString(left, payment_y, "PAYMENTS")
    doc.setFont("Helvetica", 9)
    payment_y -= 4 * mm
    doc.drawString(
        left,
        payment_y,
        f"{_format_currency(currency, total)} was paid on {paid_on} via Bank Transfer.",
    )

    doc.showPage()
    doc.save()
    return response


@login_required
@require_http_methods(["GET"])
def plans_list(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    product_slug = (request.GET.get("product") or "").strip() or None

    if product_slug in ("storage", "online-storage"):
        from apps.backend.storage.models import Plan as StoragePlan, Product as StorageProduct

        storage_product = StorageProduct.objects.filter(name__iexact="Online Storage").first()
        plans = StoragePlan.objects.all()
        if storage_product:
            plans = plans.filter(product=storage_product)
        plans = plans.order_by("name")

        active_sub = (
            StorageOrgSubscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .select_related("plan")
            .order_by("-updated_at")
            .first()
        )
        active_payload = None
        if active_sub and active_sub.plan:
            active_payload = {
                "plan_id": active_sub.plan_id,
                "plan": active_sub.plan.name,
                "status": active_sub.status,
                "billing_cycle": "monthly",
                "start_ts": int(active_sub.created_at.timestamp()) if active_sub.created_at else None,
                "end_ts": None,
                "start_date": _format_datetime(active_sub.created_at),
                "end_date": "",
                "current_monthly": float(active_sub.plan.monthly_price or 0),
                "current_yearly": float(active_sub.plan.yearly_price or 0),
                "addon_count": 0,
            }

        free_eligible = not _org_used_free_trial(org)
        if active_sub and active_sub.plan and str(active_sub.plan.name or "").strip().lower() != "free":
            free_eligible = False

        return JsonResponse({
            "plans": [
                {
                    "id": plan.id,
                    "name": plan.name,
                    "monthly_price_inr": float(plan.monthly_price_inr or 0),
                    "yearly_price_inr": float(plan.yearly_price_inr or 0),
                    "monthly_price_usd": float(plan.monthly_price_usd or 0),
                    "yearly_price_usd": float(plan.yearly_price_usd or 0),
                    "monthly_price": float(plan.monthly_price_inr or 0),
                    "yearly_price": float(plan.yearly_price_inr or 0),
                    "usd_monthly_price": float(plan.monthly_price_usd or 0),
                    "usd_yearly_price": float(plan.yearly_price_usd or 0),
                    "max_users": plan.max_users,
                    "storage_limit_gb": plan.storage_limit_gb,
                    "bandwidth_limit_gb_monthly": plan.bandwidth_limit_gb_monthly,
                    "is_bandwidth_limited": plan.is_bandwidth_limited,
                    "device_limit_per_user": plan.device_limit_per_user,
                    "limits": {
                        "storage_gb": plan.storage_limit_gb,
                        "max_users": plan.max_users,
                        "bandwidth_limit_gb_monthly": plan.bandwidth_limit_gb_monthly,
                        "is_bandwidth_limited": plan.is_bandwidth_limited,
                        "device_limit_per_user": plan.device_limit_per_user,
                    },
                    "currency": "INR",
                }
                for plan in plans
            ],
            "active_sub": active_payload,
            "rollback": None,
            "tax_rate": float(getattr(settings, "INVOICE_TAX_RATE", 18)),
            "tax_currency": "INR",
            "free_eligible": free_eligible,
        })

    plans = Plan.objects.all().order_by("price")
    if product_slug:
        if product_slug == "monitor":
            plans = plans.filter(Q(product__slug=product_slug) | Q(product__isnull=True))
        else:
            plans = plans.filter(product__slug=product_slug)

    if product_slug:
        product_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter = product_filter | Q(plan__product__isnull=True)
        active_sub = (
            Subscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .filter(product_filter)
            .select_related("plan")
            .order_by("-start_date")
            .first()
        )
        if active_sub and not dashboard_views.is_subscription_active(active_sub):
            active_sub = None
    else:
        active_sub = dashboard_views.get_active_subscription(org)
        if not active_sub:
            active_sub = dashboard_views.ensure_active_subscription(org)
    if active_sub and not dashboard_views.is_subscription_active(active_sub):
        active_sub = None
    if active_sub and active_sub.status != "active":
        active_sub = None

    active_payload = None
    if active_sub and active_sub.plan:
        active_payload = {
            "plan_id": active_sub.plan_id,
            "plan": active_sub.plan.name,
            "status": active_sub.status,
            "billing_cycle": active_sub.billing_cycle,
            "start_ts": int(active_sub.start_date.timestamp()) if active_sub.start_date else None,
            "end_ts": int(active_sub.end_date.timestamp()) if active_sub.end_date else None,
            "start_date": _format_datetime(active_sub.start_date),
            "end_date": _format_datetime(active_sub.end_date),
            "current_monthly": active_sub.plan.monthly_price or 0,
            "current_yearly": active_sub.plan.yearly_price or 0,
            "addon_count": active_sub.addon_count or 0,
        }

    rollback_entry = _get_rollback_entry(org, active_sub, product_slug=product_slug)
    rollback_candidate = None
    if rollback_entry:
        rollback_candidate = {
            "plan_id": rollback_entry["plan_id"],
            "plan": rollback_entry["plan"].name if rollback_entry["plan"] else "-",
            "billing_cycle": rollback_entry["billing_cycle"],
            "start_date": _format_datetime(rollback_entry["start_date"]),
            "end_date": _format_datetime(rollback_entry["end_date"]),
        }

    free_eligible = not _org_used_free_trial(org)
    if active_sub and active_sub.plan and not dashboard_views.is_free_plan(active_sub.plan):
        free_eligible = False
    elif free_eligible:
        history_rows = (
            SubscriptionHistory.objects
            .filter(organization=org, plan__isnull=False)
            .select_related("plan", "plan__product")
            .order_by("-start_date")
        )
        if product_slug:
            history_filter = Q(plan__product__slug=product_slug)
            if product_slug == "monitor":
                history_filter = history_filter | Q(plan__product__isnull=True)
            history_rows = history_rows.filter(history_filter)
        for row in history_rows:
            if row.plan and not dashboard_views.is_free_plan(row.plan):
                free_eligible = False
                break
        if free_eligible:
            transfers = (
                PendingTransfer.objects
                .filter(organization=org, status="approved", request_type__in=("new", "renew"))
                .select_related("plan", "plan__product")
            )
            if product_slug:
                transfer_filter = Q(plan__product__slug=product_slug)
                if product_slug == "monitor":
                    transfer_filter = transfer_filter | Q(plan__product__isnull=True)
                transfers = transfers.filter(transfer_filter)
            for transfer in transfers:
                if transfer.plan and not dashboard_views.is_free_plan(transfer.plan):
                    free_eligible = False
                    break

    return JsonResponse({
        "plans": [
            {
                "id": plan.id,
                "name": plan.name,
                "monthly_price": plan.monthly_price,
                "yearly_price": plan.yearly_price,
                "usd_monthly_price": plan.usd_monthly_price,
                "usd_yearly_price": plan.usd_yearly_price,
                "addon_monthly_price": plan.addon_monthly_price,
                "addon_yearly_price": plan.addon_yearly_price,
                "addon_usd_monthly_price": plan.addon_usd_monthly_price,
                "addon_usd_yearly_price": plan.addon_usd_yearly_price,
                "employee_limit": plan.employee_limit,
                "retention_days": plan.retention_days,
                "allow_addons": plan.allow_addons,
                "allow_app_usage": plan.allow_app_usage,
                "allow_gaming_ott_usage": plan.allow_gaming_ott_usage,
                "allow_hr_view": plan.allow_hr_view,
                "limits": plan.limits or {},
                "features": plan.features or {},
                "included_agents": plan.included_agents,
            }
            for plan in plans
        ],
        "active_sub": active_payload,
        "rollback": rollback_candidate,
        "tax_rate": float(getattr(settings, "INVOICE_TAX_RATE", 18)),
        "tax_currency": "INR",
        "free_eligible": free_eligible,
    })


@login_required
@require_http_methods(["POST"])
def plans_subscribe(request, plan_id):
    org, error = _get_org_or_error(request)
    if error:
        return error

    plan = Plan.objects.filter(id=plan_id).first()
    if not plan:
        return _json_error("plan_not_found", status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    billing_cycle = (payload.get("billing_cycle") or "").strip() or "monthly"
    if billing_cycle not in ("monthly", "yearly"):
        billing_cycle = "monthly"
    try:
        addon_count = int(payload.get("addon_count") or 0)
    except (TypeError, ValueError):
        addon_count = 0
    if addon_count < 0:
        addon_count = 0
    if not plan.allow_addons:
        addon_count = 0

    retention_days = plan.retention_days or 30
    free_plan = dashboard_views.is_free_plan(plan)
    if free_plan:
        billing_cycle = "monthly"
        active_sub = dashboard_views.get_active_subscription(org)
        active_free = (
            active_sub
            and dashboard_views.is_subscription_active(active_sub)
            and dashboard_views.is_free_plan(active_sub.plan)
        )
        if _org_used_free_trial(org) and not active_free:
            return _json_error("Free trial already used. Please choose a paid plan.", status=400)
        product_slug = plan.product.slug if plan.product else ""
        if product_slug in ("storage", "online-storage"):
            if StorageOrgSubscription.objects.filter(organization=org).exists():
                return _json_error("free_trial_used", status=400)
            history_exists = SubscriptionHistory.objects.filter(
                organization=org,
                plan__product__slug=product_slug,
            ).exists()
            if history_exists:
                return _json_error("free_trial_used", status=400)

    if not free_plan:
        billing_profile = BillingProfile.objects.filter(organization=org).first()
        missing_fields = _billing_profile_missing_fields(billing_profile)
        if missing_fields:
            return _json_error(
                "billing_profile_required",
                status=400,
                extra={"missing_fields": missing_fields},
            )

    duration_months = 12 if billing_cycle == "yearly" else 1
    now = timezone.now()
    start_date = now
    end_date = start_date + timedelta(days=30 * duration_months)

    if free_plan:
        product_slug = plan.product.slug if plan.product else "monitor"
        paid_history = (
            SubscriptionHistory.objects
            .filter(organization=org, plan__isnull=False)
            .select_related("plan", "plan__product")
            .order_by("-start_date")
        )
        if product_slug == "monitor":
            paid_history = paid_history.filter(Q(plan__product__slug=product_slug) | Q(plan__product__isnull=True))
        else:
            paid_history = paid_history.filter(plan__product__slug=product_slug)
        for row in paid_history:
            if row.plan and not dashboard_views.is_free_plan(row.plan):
                return _json_error("Free trial already used. Please choose a paid plan.", status=400)
        paid_transfer = (
            PendingTransfer.objects
            .filter(organization=org, status="approved", request_type__in=("new", "renew"))
            .select_related("plan", "plan__product")
        )
        if product_slug == "monitor":
            paid_transfer = paid_transfer.filter(Q(plan__product__slug=product_slug) | Q(plan__product__isnull=True))
        else:
            paid_transfer = paid_transfer.filter(plan__product__slug=product_slug)
        for transfer in paid_transfer:
            if transfer.plan and not dashboard_views.is_free_plan(transfer.plan):
                return _json_error("Free trial already used. Please choose a paid plan.", status=400)

        free_history = (
            SubscriptionHistory.objects.filter(organization=org, plan=plan)
            .order_by("start_date")
            .first()
        )
        trial_start = free_history.start_date if free_history else start_date
        trial_end = dashboard_views.get_free_trial_end_date(trial_start, now=now)
        if trial_end < now:
            return _json_error("Free plan expired. Please choose a paid plan.", status=400)
        start_date = trial_start
        end_date = trial_end

    currency = "INR"
    active_sub = dashboard_views.get_active_subscription(org)
    same_plan_active = (
        active_sub
        and dashboard_views.is_subscription_active(active_sub)
        and active_sub.plan_id == plan.id
        and not dashboard_views.is_free_plan(active_sub.plan)
    )
    request_type = "renew" if same_plan_active else "new"
    previous_plan = active_sub.plan if active_sub and dashboard_views.is_subscription_active(active_sub) else None
    change_type = "new"
    if previous_plan:
        if previous_plan.id == plan.id:
            change_type = "renewal"
        else:
            current_amount = _plan_amount_with_addons(
                previous_plan,
                billing_cycle,
                active_sub.addon_count or 0,
                currency,
            )
            target_amount = _plan_amount_with_addons(
                plan,
                billing_cycle,
                addon_count,
                currency,
            )
            if target_amount > current_amount:
                change_type = "upgrade"
            elif target_amount < current_amount:
                change_type = "downgrade"
            else:
                change_type = "change"

    sub = Subscription.objects.filter(organization=org).first()
    if free_plan:
        if sub:
            sub.plan = plan
            sub.user = request.user
            sub.status = "active"
            sub.start_date = start_date
            sub.end_date = end_date
            sub.billing_cycle = billing_cycle
            sub.retention_days = retention_days
            sub.razorpay_order_id = None
            sub.razorpay_payment_id = None
            sub.razorpay_signature = None
            sub.save()
        else:
            sub = Subscription.objects.create(
                user=request.user,
                organization=org,
                plan=plan,
                status="active",
                start_date=start_date,
                end_date=end_date,
                billing_cycle=billing_cycle,
                retention_days=retention_days,
            )
        if active_sub and dashboard_views.is_subscription_active(active_sub):
            if active_sub.plan and not dashboard_views.is_free_plan(active_sub.plan):
                history_end = active_sub.end_date or _infer_end_date(
                    active_sub.start_date,
                    active_sub.billing_cycle,
                )
                dashboard_views.record_subscription_history(
                    org=org,
                    user=request.user,
                    plan=active_sub.plan,
                    status="active",
                    start_date=active_sub.start_date,
                    end_date=history_end,
                    billing_cycle=active_sub.billing_cycle,
                )
        dashboard_views.record_subscription_history(
            org=org,
            user=request.user,
            plan=plan,
            status="active",
            start_date=start_date,
            end_date=end_date,
            billing_cycle=billing_cycle,
        )
        send_templated_email(
            request.user.email,
            "Plan Subscription Update",
            "emails/plan_subscription.txt",
            {
                "name": request.user.first_name or request.user.username,
                "plan_name": plan.name,
                "billing_cycle": billing_cycle,
                "currency": currency,
                "amount": 0,
                "payment_status": "Active",
                "status_note": "Your plan is now active."
            }
        )
        if change_type in ("upgrade", "downgrade", "change"):
            send_templated_email(
                request.user.email,
                "Plan Change Notification",
                "emails/plan_change.txt",
                {
                    "name": request.user.first_name or request.user.username,
                    "previous_plan": previous_plan.name if previous_plan else "-",
                    "new_plan": plan.name,
                    "change_type": change_type.title(),
                    "billing_cycle": billing_cycle,
                    "payment_status": "Active"
                }
            )

        message = f"Plan {plan.name} activated successfully."
        if (
            active_sub
            and dashboard_views.is_subscription_active(active_sub)
            and not dashboard_views.is_free_plan(active_sub.plan)
            and active_sub.plan_id != plan.id
        ):
            message = "Downgrade selected. No refund will be issued."

        return JsonResponse({"redirect": "/app/company/", "message": message})

    amount = _plan_amount_with_addons(plan, billing_cycle, addon_count, currency)
    auto_apply_change = False
    auto_apply_message = ""
    active_cycle_end = None

    if (
        active_sub
        and dashboard_views.is_subscription_active(active_sub)
        and not dashboard_views.is_free_plan(active_sub.plan)
        and active_sub.plan_id != plan.id
        and active_sub.billing_cycle == billing_cycle
        and active_sub.end_date
        and active_sub.end_date > start_date
    ):
        current_amount = _plan_amount_with_addons(
            active_sub.plan,
            billing_cycle,
            active_sub.addon_count or 0,
            currency,
        )
        duration_days = (active_sub.end_date - active_sub.start_date).days
        if duration_days <= 0:
            duration_days = 30 * duration_months
        remaining_days = (active_sub.end_date - start_date).total_seconds() / 86400
        if remaining_days < 0:
            remaining_days = 0
        active_cycle_end = active_sub.end_date
        if remaining_days > 0 and duration_days > 0:
            price_delta = amount - current_amount
            if price_delta > 0:
                amount = round(price_delta * (remaining_days / duration_days), 2)
            elif price_delta < 0:
                amount = 0
                auto_apply_change = True
                auto_apply_message = "Downgrade selected. No refund will be issued."
            else:
                amount = 0
                auto_apply_change = True
                auto_apply_message = "Plan change selected. No additional charge."
    if amount:
        amount = float(_apply_gst_amount(amount, currency))

    PendingTransfer.objects.filter(organization=org, status="draft").delete()
    if auto_apply_change:
        sub = sub or active_sub
        if sub and sub.status == "active":
            history_end = sub.end_date or _infer_end_date(
                sub.start_date,
                sub.billing_cycle,
            ) or start_date
            if sub.plan_id == plan.id and sub.end_date:
                history_end = sub.end_date
            dashboard_views.record_subscription_history(
                org=org,
                user=sub.user,
                plan=sub.plan,
                status="active",
                start_date=sub.start_date,
                end_date=history_end,
                billing_cycle=sub.billing_cycle,
            )
        if not sub:
            sub = Subscription(organization=org, user=request.user)
        if not active_cycle_end:
            active_cycle_end = end_date
        sub.user = request.user
        sub.plan = plan
        sub.status = "active"
        sub.start_date = start_date
        sub.end_date = active_cycle_end
        sub.billing_cycle = billing_cycle
        sub.retention_days = retention_days
        if plan and plan.allow_addons:
            sub.addon_count = addon_count
        sub.save()
        dashboard_views.record_subscription_history(
            org=org,
            user=request.user,
            plan=plan,
            status="active",
            start_date=start_date,
            end_date=active_cycle_end,
            billing_cycle=billing_cycle,
        )
        if plan:
            settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
            min_interval = plan.screenshot_min_minutes or 5
            if settings_obj.screenshot_interval_minutes < min_interval:
                settings_obj.screenshot_interval_minutes = min_interval
                settings_obj.save()
        send_templated_email(
            request.user.email,
            "Plan Subscription Update",
            "emails/plan_subscription.txt",
            {
                "name": request.user.first_name or request.user.username,
                "plan_name": plan.name,
                "billing_cycle": billing_cycle,
                "currency": currency,
                "amount": amount,
                "payment_status": "Active",
                "status_note": "Your plan has been updated."
            }
        )
        if change_type in ("upgrade", "downgrade", "change"):
            send_templated_email(
                request.user.email,
                "Plan Change Notification",
                "emails/plan_change.txt",
                {
                    "name": request.user.first_name or request.user.username,
                    "previous_plan": previous_plan.name if previous_plan else "-",
                    "new_plan": plan.name,
                    "change_type": change_type.title(),
                    "billing_cycle": billing_cycle,
                    "payment_status": "Active"
                }
            )
        if auto_apply_message:
            return JsonResponse({"redirect": "/app/billing/", "message": auto_apply_message})
        return JsonResponse({
            "redirect": "/app/billing/",
            "message": f"Plan {plan.name} updated successfully.",
        })

    existing_transfer = PendingTransfer.objects.filter(
        organization=org,
        status="pending",
        request_type__in=("new", "renew"),
    ).order_by("-created_at").first()
    if existing_transfer:
        return JsonResponse({
            "redirect": f"/my-account/bank-transfer/{existing_transfer.id}/",
            "message": "Payment already pending. Please complete the existing request.",
        })

    request.session["pending_transfer_data"] = {
        "plan_id": plan.id,
        "request_type": request_type,
        "billing_cycle": billing_cycle,
        "retention_days": retention_days,
        "currency": currency,
        "amount": amount,
        "addon_count": addon_count,
        "created_at": timezone.now().isoformat(),
    }
    send_templated_email(
        request.user.email,
        "Plan Subscription Update",
        "emails/plan_subscription.txt",
        {
            "name": request.user.first_name or request.user.username,
            "plan_name": plan.name,
            "billing_cycle": billing_cycle,
            "currency": currency,
            "amount": amount,
            "payment_status": "Pending",
            "status_note": "Please complete the bank transfer to activate your plan."
        }
    )
    if change_type in ("upgrade", "downgrade", "change"):
        send_templated_email(
            request.user.email,
            "Plan Change Notification",
            "emails/plan_change.txt",
            {
                "name": request.user.first_name or request.user.username,
                "previous_plan": previous_plan.name if previous_plan else "-",
                "new_plan": plan.name,
                "change_type": change_type.title(),
                "billing_cycle": billing_cycle,
                "payment_status": "Pending"
            }
        )
    return JsonResponse({"redirect": "/my-account/bank-transfer/"})


@login_required
@require_http_methods(["GET"])
def bank_transfer_summary(request, transfer_id=None):
    org, error = _get_org_or_error(request)
    if error:
        return error

    transfer = None
    if transfer_id is not None:
        transfer = get_object_or_404(PendingTransfer, id=transfer_id, organization=org)
    else:
        data = request.session.get("pending_transfer_data") or {}
        plan_id = data.get("plan_id") if isinstance(data, dict) else None
        if not plan_id:
            return JsonResponse({"redirect": "/app/plans/"})
        plan = Plan.objects.filter(id=plan_id).first()
        if not plan:
            return JsonResponse({"redirect": "/app/plans/"})
        transfer = SimpleNamespace(
            plan=plan,
            request_type=data.get("request_type"),
            billing_cycle=data.get("billing_cycle") or "monthly",
            retention_days=data.get("retention_days"),
            currency=data.get("currency", "INR"),
            amount=data.get("amount", 0),
            addon_count=data.get("addon_count"),
        )

    amount_value = getattr(transfer, "amount", 0) or 0
    currency_value = getattr(transfer, "currency", "INR") or "INR"
    transfer_type = getattr(transfer, "request_type", None)
    if amount_value == 0 and transfer.plan and transfer_type in (None, "new", "renew"):
        computed = _plan_amount_with_addons(
            transfer.plan,
            getattr(transfer, "billing_cycle", "monthly"),
            getattr(transfer, "addon_count", 0),
            currency_value,
        )
        if computed:
            amount_value = _apply_gst_amount(computed, currency_value)

    tax_rate = _gst_rate(currency_value)
    total_amount = _money(amount_value)
    base_amount = total_amount
    tax_amount = Decimal("0.00")
    if tax_rate > 0:
        base_amount = _money(total_amount / (Decimal("1.00") + tax_rate))
        tax_amount = _money(total_amount - base_amount)

    addon_count = getattr(transfer, "addon_count", None)

    payload = {
        "org_name": org.name,
        "plan_name": transfer.plan.name if transfer.plan else "-",
        "billing_cycle": getattr(transfer, "billing_cycle", "monthly"),
        "amount": float(total_amount),
        "currency": currency_value,
        "base_amount": float(base_amount),
        "tax_amount": float(tax_amount),
        "total_amount": float(total_amount),
        "tax_rate": float(tax_rate * Decimal("100")),
        "addon_count": addon_count,
        "transfer_id": getattr(transfer, "id", None),
    }
    seller = _invoice_seller()
    if seller and seller.get("bank_account_details"):
        payload["bank_account_details"] = seller.get("bank_account_details")
    return JsonResponse({"transfer": payload})


@login_required
@require_http_methods(["POST"])
def bank_transfer_submit(request, transfer_id=None):
    org, error = _get_org_or_error(request)
    if error:
        return error

    reference_no = (request.POST.get("reference_no") or "").strip()
    receipt = request.FILES.get("receipt")
    if not reference_no:
        return _json_error("reference_no_required", status=400)
    if not receipt:
        return _json_error("receipt_required", status=400)

    if transfer_id is not None:
        transfer = get_object_or_404(PendingTransfer, id=transfer_id, organization=org)
        transfer.reference_no = reference_no
        transfer.receipt = receipt
        transfer.status = "pending"
        transfer.save()
        return JsonResponse({
            "redirect": "/app/billing/",
            "message": "Payment submitted. We will verify and activate your account.",
        })

    data = request.session.get("pending_transfer_data") or {}
    plan_id = data.get("plan_id") if isinstance(data, dict) else None
    if not plan_id:
        return _json_error("no_pending_payment", status=400)
    plan = Plan.objects.filter(id=plan_id).first()
    if not plan:
        return _json_error("plan_not_found", status=404)

    PendingTransfer.objects.create(
        organization=org,
        user=request.user,
        plan=plan,
        request_type=data.get("request_type") or "new",
        billing_cycle=data.get("billing_cycle", "monthly"),
        retention_days=data.get("retention_days") or (plan.retention_days if plan else 30),
        addon_count=data.get("addon_count"),
        currency=data.get("currency", "INR"),
        amount=data.get("amount") or 0,
        reference_no=reference_no,
        receipt=receipt,
        status="pending",
    )
    request.session.pop("pending_transfer_data", None)
    return JsonResponse({
        "redirect": "/app/billing/",
        "message": "Payment submitted. We will verify and activate your account.",
    })


@login_required
@require_http_methods(["POST"])
def plans_rollback(request):
    org, error = _get_org_or_error(request)
    if error:
        return error

    active_sub = dashboard_views.get_active_subscription(org)
    if not active_sub or not active_sub.plan:
        return _json_error("No rollback available.", status=400)

    rollback_entry = _get_rollback_entry(org, active_sub)
    if not rollback_entry:
        return _json_error("No rollback plan found.", status=400)

    sub = Subscription.objects.filter(organization=org).order_by("-start_date").first()
    if not sub:
        sub = Subscription(organization=org, user=request.user)

    sub.user = request.user
    target_plan = rollback_entry["plan"]
    if not target_plan:
        target_plan = Plan.objects.filter(id=rollback_entry["plan_id"]).first()
    if not target_plan:
        return _json_error("Rollback plan not found.", status=400)
    sub.plan = target_plan
    sub.status = "active"
    rollback_start = timezone.now()
    sub.start_date = rollback_start
    sub.end_date = rollback_entry["end_date"] or sub.end_date
    sub.billing_cycle = rollback_entry["billing_cycle"]
    sub.retention_days = target_plan.retention_days or sub.retention_days
    sub.save()

    dashboard_views.log_admin_activity(
        request.user,
        "Rollback Plan",
        f"Rolled back to {target_plan.name} until { _format_datetime(rollback_entry['end_date']) }",
    )

    return JsonResponse({
        "updated": True,
        "message": f"Rollback to {target_plan.name} applied.",
    })


@login_required
@require_http_methods(["GET"])
def profile_summary(request):
    user = request.user
    profile = dashboard_views.get_profile(user)
    if profile and profile.role == "dealer":
        dealer = DealerAccount.objects.filter(user=user).first()
        if not dealer:
            return _json_error("dealer_profile_missing", status=404)
        referral_code = ensure_dealer_referral_code(dealer)
        referral_link = request.build_absolute_uri(f"/agent-signup/?ref={referral_code}") if referral_code else ""
        settings_obj = ReferralSettings.get_active()
        phone_country = "+91"
        phone_number = ""
        if profile.phone_number:
            parts = profile.phone_number.strip().split(" ", 1)
            if parts and parts[0].startswith("+"):
                phone_country = parts[0]
                if len(parts) > 1:
                    phone_number = parts[1]
            else:
                phone_number = profile.phone_number.strip()

        earnings = (
            DealerReferralEarning.objects
            .select_related("referred_org", "referred_dealer", "transfer")
            .filter(referrer_dealer=dealer)
            .order_by("-created_at")[:200]
        )
        earnings_payload = [
            {
                "id": row.id,
                "referred_org": row.referred_org.name if row.referred_org else "",
                "referred_dealer": row.referred_dealer.user.username if row.referred_dealer else "",
                "transfer_id": row.transfer_id,
                "base_amount": float(_money(row.base_amount)),
                "commission_rate": float(row.commission_rate or 0),
                "commission_amount": float(_money(row.commission_amount)),
                "flat_amount": float(_money(row.flat_amount)),
                "status": row.status,
                "payout_reference": row.payout_reference or "",
                "payout_date": row.payout_date.isoformat() if row.payout_date else "",
                "created_at": _format_datetime(row.created_at),
            }
            for row in earnings
        ]

        return JsonResponse({
            "org": {
                "id": None,
                "name": "-",
            },
            "referral": {
                "code": referral_code,
                "link": referral_link,
                "commission_rate": float(settings_obj.dealer_commission_rate or 0),
                "earnings": earnings_payload,
                "subscription_amount": float(settings_obj.dealer_subscription_amount or 0),
            },
            "user": {
                "username": user.username,
                "email": user.email or "",
            },
            "profile": {
                "role": profile.role,
                "phone_number": profile.phone_number or "",
            },
            "phone_country": phone_country,
            "phone_number": phone_number,
            "recent_actions": [],
            "pagination": {
                "page": 1,
                "total_pages": 1,
                "has_next": False,
                "has_previous": False,
                "page_size": 0,
                "total_items": 0,
            },
        })

    if dashboard_views.is_super_admin_user(user):
        phone_country = "+91"
        phone_number = ""
        if profile.phone_number:
            parts = profile.phone_number.strip().split(" ", 1)
            if parts and parts[0].startswith("+"):
                phone_country = parts[0]
                if len(parts) > 1:
                    phone_number = parts[1]
            else:
                phone_number = profile.phone_number.strip()

        return JsonResponse({
            "org": {
                "id": None,
                "name": "-",
            },
            "user": {
                "username": user.username,
                "email": user.email or "",
            },
            "profile": {
                "role": profile.role,
                "phone_number": profile.phone_number or "",
            },
            "phone_country": phone_country,
            "phone_number": phone_number,
            "recent_actions": [],
            "pagination": {
                "page": 1,
                "total_pages": 1,
                "has_next": False,
                "has_previous": False,
                "page_size": 0,
                "total_items": 0,
            },
        })

    org, error = _get_org_or_error(request)
    if error:
        return error

    referral_code = ensure_referral_code(org)
    referral_link = request.build_absolute_uri(f"/signup/?ref={referral_code}") if referral_code else ""
    referral_settings = ReferralSettings.get_active()
    phone_country = "+91"
    phone_number = ""
    if profile.phone_number:
        parts = profile.phone_number.strip().split(" ", 1)
        if parts and parts[0].startswith("+"):
            phone_country = parts[0]
            if len(parts) > 1:
                phone_number = parts[1]
        else:
            phone_number = profile.phone_number.strip()

    recent_actions_qs = (
        AdminActivity.objects
        .filter(user__userprofile__organization=org)
        .select_related("user")
    )
    search_query = (request.GET.get("q") or "").strip()
    if search_query:
        recent_actions_qs = recent_actions_qs.filter(
            models.Q(action__icontains=search_query) |
            models.Q(details__icontains=search_query)
        )
    recent_actions_qs = recent_actions_qs.order_by("-created_at")[:500]
    page_num = request.GET.get("admin_page") or 1
    paginator = Paginator(recent_actions_qs, 50)
    page_obj = paginator.get_page(page_num)
    earnings = (
        ReferralEarning.objects
        .select_related("referred_org", "transfer")
        .filter(referrer_org=org)
        .order_by("-created_at")[:200]
    )
    earnings_payload = [
        {
            "id": row.id,
            "referred_org": row.referred_org.name if row.referred_org else "-",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": row.payout_date.isoformat() if row.payout_date else "",
            "created_at": _format_datetime(row.created_at),
        }
        for row in earnings
    ]

    _, org_timezone = _resolve_org_timezone(org, request=request)
    return JsonResponse({
        "org": {
            "id": org.id,
            "name": org.name,
        },
        "referral": {
            "code": referral_code,
            "link": referral_link,
            "commission_rate": float(referral_settings.commission_rate or 0),
            "earnings": earnings_payload,
        },
        "user": {
            "username": user.username,
            "email": user.email or "",
        },
        "profile": {
            "role": profile.role,
            "phone_number": profile.phone_number or "",
        },
        "org_timezone": org_timezone,
        "phone_country": phone_country,
        "phone_number": phone_number,
        "recent_actions": [
            _admin_activity_payload(row)
            for row in page_obj
        ],
        "pagination": {
            "page": page_obj.number,
            "total_pages": paginator.num_pages,
            "has_next": page_obj.has_next(),
            "has_previous": page_obj.has_previous(),
            "page_size": paginator.per_page,
            "total_items": paginator.count,
        },
    })


@login_required
@require_http_methods(["POST"])
def profile_update_email(request):
    if not dashboard_views.is_super_admin_user(request.user):
        org, error = _get_org_or_error(request)
        if error:
            return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    email = (payload.get("email") or "").strip()
    phone_country = (payload.get("phone_country") or "").strip() or "+91"
    phone_number = (payload.get("phone_number") or "").strip()
    org_timezone = (payload.get("org_timezone") or "").strip()
    if not email:
        return _json_error("Email is required.", status=400)

    user = request.user
    profile = dashboard_views.get_profile(user)
    old_email = (user.email or "").strip().lower()
    new_email = email.lower()
    if old_email != new_email:
        duplicate = User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists()
        if duplicate:
            return _json_error("Email already in use.", status=400)
    user.email = email
    if old_email != new_email:
        user.email_verified = False
        user.email_verified_at = None
    user.save()

    phone_value = ""
    if phone_number:
        phone_value = f"{phone_country} {phone_number}".strip()
    profile.phone_number = phone_value
    profile.save()
    saved_timezone = None
    if not dashboard_views.is_super_admin_user(user):
        org, error = _get_org_or_error(request)
        if error:
            return error
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
        if org_timezone:
            settings_obj.org_timezone = normalize_timezone(org_timezone)
            settings_obj.save(update_fields=["org_timezone"])
        saved_timezone = settings_obj.org_timezone or "UTC"
    if old_email != new_email:
        send_email_verification(user, request=request, force=True)

    dashboard_views.log_admin_activity(user, "Update Email", f"Updated email to {email}")

    return JsonResponse({
        "updated": True,
        "email": user.email,
        "phone_number": profile.phone_number or "",
        "org_timezone": saved_timezone,
        "email_verified": user.email_verified,
    })


@login_required
@require_http_methods(["POST"])
def profile_update_password(request):
    if not dashboard_views.is_super_admin_user(request.user):
        org, error = _get_org_or_error(request)
        if error:
            return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    user = request.user
    if not user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)
    if new_password != confirm_password:
        return _json_error("New passwords do not match.", status=400)
    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        return _json_error(" ".join(exc.messages), status=400)

    user.set_password(new_password)
    user.save()
    update_session_auth_hash(request, user)
    dashboard_views.log_admin_activity(user, "Update Password", "Password updated")
    notify_password_changed(user)

    return JsonResponse({"updated": True})


def _get_dealer_or_error(request):
    user = request.user
    profile = dashboard_views.get_profile(user)
    if not profile or profile.role != "dealer":
        return None, HttpResponseForbidden("Access denied.")
    dealer = DealerAccount.objects.filter(user=user).first()
    if not dealer:
        settings_obj = ReferralSettings.get_active()
        dealer = DealerAccount.objects.create(
            user=user,
            subscription_status="pending",
            subscription_amount=settings_obj.dealer_subscription_amount or 0,
        )
        ensure_dealer_referral_code(dealer)
    return dealer, None


@login_required
@require_http_methods(["GET"])
def dealer_summary(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    settings_obj = ReferralSettings.get_active()
    referral_code = ensure_dealer_referral_code(dealer)
    referral_link = request.build_absolute_uri(f"/agent-signup/?ref={referral_code}") if referral_code else ""
    earnings = DealerReferralEarning.objects.filter(referrer_dealer=dealer)
    total_earned = earnings.aggregate(total=models.Sum("commission_amount"), flat=models.Sum("flat_amount"))
    paid_earned = earnings.filter(status="paid").aggregate(
        total=models.Sum("commission_amount"),
        flat=models.Sum("flat_amount")
    )
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_earned = earnings.filter(created_at__gte=month_start).aggregate(
        total=models.Sum("commission_amount"),
        flat=models.Sum("flat_amount")
    )
    org_referrals_count = earnings.filter(referred_org__isnull=False).count()
    dealer_referrals_count = earnings.filter(referred_dealer__isnull=False).count()
    total_amount = _money(total_earned.get("total") or 0) + _money(total_earned.get("flat") or 0)
    paid_amount = _money(paid_earned.get("total") or 0) + _money(paid_earned.get("flat") or 0)
    month_amount = _money(month_earned.get("total") or 0) + _money(month_earned.get("flat") or 0)
    products_count = Product.objects.count()

    return JsonResponse({
        "dealer": {
            "name": dealer.user.first_name or dealer.user.username,
            "email": dealer.user.email or "",
            "subscription_status": dealer.subscription_status,
            "subscription_start": _format_datetime(dealer.subscription_start),
            "subscription_end": _format_datetime(dealer.subscription_end),
            "subscription_amount": float(_money(dealer.subscription_amount)),
        },
        "commission_rate": float(settings_obj.dealer_commission_rate or 0),
        "referral": {
            "code": referral_code,
            "link": referral_link,
        },
        "referral_amounts": {
            "total": float(total_amount),
            "paid": float(paid_amount),
            "month_total": float(month_amount),
            "org_count": org_referrals_count,
            "dealer_count": dealer_referrals_count,
        },
        "products_count": products_count,
    })


@login_required
@require_http_methods(["GET"])
def dealer_plan_summary(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error
    settings_obj = ReferralSettings.get_active()
    return JsonResponse({
        "dealer_name": dealer.user.first_name or dealer.user.username,
        "dealer_email": dealer.user.email or "",
        "subscription_amount": float(_money(settings_obj.dealer_subscription_amount or 0)),
        "commission_rate": float(settings_obj.dealer_commission_rate or 0),
        "subscription_status": dealer.subscription_status,
    })


@login_required
@require_http_methods(["POST"])
def dealer_subscribe(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    existing_transfer = PendingTransfer.objects.filter(
        user=request.user,
        request_type="dealer",
        status__in=("draft", "pending"),
    ).order_by("-created_at").first()
    if existing_transfer:
        return JsonResponse({
            "redirect": f"/app/dealer-bank-transfer/{existing_transfer.id}/",
            "message": "Payment already pending. Please complete the existing request.",
        })

    settings_obj = ReferralSettings.get_active()
    amount = _money(settings_obj.dealer_subscription_amount or 0)
    transfer = PendingTransfer.objects.create(
        organization=None,
        user=request.user,
        plan=None,
        request_type="dealer",
        billing_cycle="yearly",
        retention_days=365,
        addon_count=None,
        currency="INR",
        amount=float(amount),
        status="draft",
    )
    dealer.subscription_amount = amount
    dealer.save(update_fields=["subscription_amount"])
    send_templated_email(
        request.user.email,
        "Plan Subscription Update",
        "emails/plan_subscription.txt",
        {
            "name": request.user.first_name or request.user.username,
            "plan_name": "Dealer Subscription",
            "billing_cycle": "yearly",
            "currency": "INR",
            "amount": float(amount),
            "payment_status": "Pending",
            "status_note": "Please complete the bank transfer to activate your subscription."
        }
    )
    return JsonResponse({
        "redirect": f"/app/dealer-bank-transfer/{transfer.id}/",
        "message": "Dealer subscription created. Proceed to bank transfer.",
    })


@login_required
@require_http_methods(["GET"])
def dealer_billing_summary(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    transfers = (
        PendingTransfer.objects
        .filter(user=request.user, request_type="dealer")
        .order_by("-created_at")
    )
    rows = [
        {
            "id": t.id,
            "amount": float(_money(t.amount)),
            "currency": t.currency or "INR",
            "status": t.status,
            "status_label": (
                "Approved"
                if t.status == "approved"
                else "Rejected"
                if t.status == "rejected"
                else "Waiting for approval"
                if t.status == "pending"
                else "Awaiting payment"
            ),
            "created_at": _format_datetime(t.created_at),
            "updated_at": _format_datetime(t.updated_at),
        }
        for t in transfers
    ]
    return JsonResponse({
        "subscription_status": dealer.subscription_status,
        "subscription_start": _format_datetime(dealer.subscription_start),
        "subscription_end": _format_datetime(dealer.subscription_end),
        "transfers": rows,
    })


@login_required
@require_http_methods(["GET"])
def dealer_bank_transfer_summary(request, transfer_id):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    transfer = get_object_or_404(PendingTransfer, id=transfer_id, user=request.user)
    amount_value = _money(transfer.amount or 0)
    currency_value = transfer.currency or "INR"

    tax_rate = _gst_rate(currency_value)
    total_amount = _money(amount_value)
    base_amount = total_amount
    tax_amount = Decimal("0.00")
    if tax_rate > 0:
        base_amount = _money(total_amount / (Decimal("1.00") + tax_rate))
        tax_amount = _money(total_amount - base_amount)

    payload = {
        "org_name": dealer.user.first_name or dealer.user.username,
        "plan_name": "Dealer Subscription",
        "billing_cycle": "yearly",
        "amount": float(total_amount),
        "currency": currency_value,
        "base_amount": float(base_amount),
        "tax_amount": float(tax_amount),
        "total_amount": float(total_amount),
        "tax_rate": float(tax_rate * Decimal("100")),
        "transfer_id": transfer.id,
    }
    seller = _invoice_seller()
    if seller and seller.get("bank_account_details"):
        payload["bank_account_details"] = seller.get("bank_account_details")
    return JsonResponse({"transfer": payload})


@login_required
@require_http_methods(["POST"])
def dealer_bank_transfer_submit(request, transfer_id):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    reference_no = (request.POST.get("reference_no") or "").strip()
    receipt = request.FILES.get("receipt")
    if not reference_no:
        return _json_error("reference_no_required", status=400)
    if not receipt:
        return _json_error("receipt_required", status=400)

    transfer = get_object_or_404(PendingTransfer, id=transfer_id, user=request.user)
    transfer.reference_no = reference_no
    transfer.receipt = receipt
    transfer.status = "pending"
    transfer.save()
    return JsonResponse({
        "redirect": "/app/dealer-billing/",
        "message": "Payment submitted. We will verify and activate your account.",
    })


@login_required
@require_http_methods(["GET", "POST"])
def dealer_profile(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    user = request.user
    profile = dashboard_views.get_profile(user)

    if request.method == "GET":
        return JsonResponse({
            "user": {
                "name": user.first_name or "",
                "email": user.email or "",
            },
            "phone_number": profile.phone_number or "",
            "dealer": {
                "address_line1": dealer.address_line1,
                "address_line2": dealer.address_line2,
                "city": dealer.city,
                "state": dealer.state,
                "country": dealer.country,
                "postal_code": dealer.postal_code,
                "bank_name": dealer.bank_name,
                "bank_account_number": dealer.bank_account_number,
                "bank_ifsc": dealer.bank_ifsc,
                "upi_id": dealer.upi_id,
            },
        })

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    user.first_name = (payload.get("name") or user.first_name or "").strip()
    old_email = (user.email or "").strip().lower()
    requested_email = (payload.get("email") or user.email or "").strip()
    new_email = requested_email.lower()
    if old_email != new_email:
        duplicate = User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists()
        if duplicate:
            return _json_error("Email already in use.", status=400)
        user.email_verified = False
        user.email_verified_at = None
    user.email = requested_email
    phone_country = (payload.get("phone_country") or "").strip() or "+91"
    phone_number = (payload.get("phone_number") or "").strip()
    phone_value = f"{phone_country} {phone_number}".strip() if phone_number else ""
    profile.phone_number = phone_value
    user.save()
    profile.save()

    dealer.address_line1 = (payload.get("address_line1") or "").strip()
    dealer.address_line2 = (payload.get("address_line2") or "").strip()
    dealer.city = (payload.get("city") or "").strip()
    dealer.state = (payload.get("state") or "").strip()
    dealer.country = (payload.get("country") or "").strip()
    dealer.postal_code = (payload.get("postal_code") or "").strip()
    dealer.bank_name = (payload.get("bank_name") or "").strip()
    dealer.bank_account_number = (payload.get("bank_account_number") or "").strip()
    dealer.bank_ifsc = (payload.get("bank_ifsc") or "").strip()
    dealer.upi_id = (payload.get("upi_id") or "").strip()
    dealer.save()
    if old_email != new_email:
        send_email_verification(user, request=request, force=True)

    return JsonResponse({"updated": True})


@login_required
@require_http_methods(["POST"])
def dealer_profile_password(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    current_password = payload.get("current_password") or ""
    new_password = payload.get("new_password") or ""
    confirm_password = payload.get("confirm_password") or ""

    user = request.user
    if not user.check_password(current_password):
        return _json_error("Current password is incorrect.", status=400)
    if new_password != confirm_password:
        return _json_error("New passwords do not match.", status=400)
    try:
        validate_password(new_password, user=user)
    except ValidationError as exc:
        return _json_error(" ".join(exc.messages), status=400)

    user.set_password(new_password)
    user.save()
    update_session_auth_hash(request, user)
    notify_password_changed(user)
    return JsonResponse({"updated": True})


@login_required
@require_http_methods(["GET"])
def dealer_referrals(request):
    dealer, error = _get_dealer_or_error(request)
    if error:
        return error

    org_rows = DealerReferralEarning.objects.filter(
        referrer_dealer=dealer,
        referred_org__isnull=False,
    ).order_by("-created_at")
    dealer_rows = DealerReferralEarning.objects.filter(
        referrer_dealer=dealer,
        referred_dealer__isnull=False,
    ).order_by("-created_at")

    def serialize_row(row):
        return {
            "id": row.id,
            "referred_org": row.referred_org.name if row.referred_org else "",
            "referred_dealer": row.referred_dealer.user.username if row.referred_dealer else "",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "flat_amount": float(_money(row.flat_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": row.payout_date.isoformat() if row.payout_date else "",
            "created_at": _format_datetime(row.created_at),
        }

    return JsonResponse({
        "org_referrals": [serialize_row(row) for row in org_rows],
        "dealer_referrals": [serialize_row(row) for row in dealer_rows],
    })
