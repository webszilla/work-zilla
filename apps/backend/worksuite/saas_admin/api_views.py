from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timedelta
from io import BytesIO
from types import SimpleNamespace
import calendar
import json
import os
import math
import zipfile
import urllib.request

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db import models
from django.db.models import Sum
from django.db import IntegrityError, transaction
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.utils import timezone
from zoneinfo import ZoneInfo
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_http_methods

from core.models import (
    Employee,
    Organization,
    PendingTransfer,
    Plan,
    DealerAccount,
    DealerReferralEarning,
    ReferralEarning,
    ReferralSettings,
    Subscription,
    UserProfile,
    BillingProfile,
    InvoiceSellerProfile,
    OrganizationSettings,
    CompanyPrivacySettings,
    DeletedAccount,
    AdminNotification,
    SubscriptionHistory,
    ChatMessage,
    AiUsageMonthly,
)
from core.subscription_utils import is_subscription_active, normalize_subscription_end_date, revert_transfer_subscription
from core.referral_utils import record_referral_earning, record_dealer_org_referral_earning, record_dealer_referral_flat_earning
from core.email_utils import send_templated_email
from .models import (
    MonitorOrgProductEntitlement,
    Product,
    OpenAISettings,
    GlobalMediaStorageSettings,
    BackupRetentionSettings,
    OrganizationBackupRetentionOverride,
    ProductBackupRetentionOverride,
    MediaStoragePullJob,
)
from apps.backend.products.models import Product as CatalogProduct
from apps.backend.retention.models import GlobalRetentionPolicy
from apps.backend.retention.serializers import GlobalRetentionPolicySerializer
from .observability import build_observability_summary
from .serializers import serialize_notification
from apps.backend.backups.models import BackupRecord
from apps.backend.storage.models import (
    StorageFile,
    StorageGlobalSettings,
    OrgSubscription as StorageOrgSubscription,
    OrgAddOn as StorageOrgAddOn,
    Product as StorageProduct,
    Plan as StoragePlan,
    OrgUser as StorageOrgUser,
    OrgStorageUsage as StorageOrgUsage,
    OrgBandwidthUsage as StorageOrgBandwidthUsage,
)
from apps.backend.storage.services import (
    get_plan_storage_gb,
    storage_gb_to_bytes,
)
from apps.backend.storage import services_admin as storage_admin_services
from apps.backend.storage.usage_cache import rebuild_all_usage, rebuild_usage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def _is_saas_admin_user(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if user.is_staff:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    return bool(profile and profile.role in ("superadmin", "super_admin"))


def _require_saas_admin(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")
    return None


def _money(value):
    return Decimal(value or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _gst_rate(currency):
    if currency != "INR":
        return Decimal("0.00")
    return Decimal(str(getattr(settings, "INVOICE_TAX_RATE", 18))) / Decimal("100")


def _normalize_text(value):
    if not value:
        return ""
    return str(value).strip()


def _mask_api_key(value):
    if not value:
        return ""
    value = str(value)
    if len(value) <= 8:
        return "****"
    return f"{value[:3]}****{value[-4:]}"


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


def _format_currency(currency, amount):
    value = _money(amount)
    if not currency:
        return str(value)
    return f"{currency} {value}"


def _addon_price(plan, billing_cycle, currency):
    if not plan:
        return Decimal("0.00")
    if currency == "USD":
        raw = plan.addon_usd_yearly_price if billing_cycle == "yearly" else plan.addon_usd_monthly_price
    else:
        raw = plan.addon_yearly_price if billing_cycle == "yearly" else plan.addon_monthly_price
    return _money(raw or 0)


def _plan_unit_price(plan, billing_cycle, currency):
    if not plan:
        return Decimal("0.00")
    if currency == "USD":
        raw = plan.usd_yearly_price if billing_cycle == "yearly" else plan.usd_monthly_price
    else:
        raw = plan.yearly_price if billing_cycle == "yearly" else plan.monthly_price
    return _money(raw or 0)


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
    tax_rate = _gst_rate(currency)
    total_amount = base_amount * (Decimal("1.00") + tax_rate)
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


def _render_invoice_pdf_bytes(transfer, billing_profile):
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

    buffer = BytesIO()
    doc = canvas.Canvas(buffer, pagesize=A4)
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

    org = transfer.organization
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
        f"Customer ID {org.company_key if org and org.company_key else (org.id if org else '-')}",
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
        f"Billing Cycle {str(transfer.billing_cycle or '').replace('_', ' ').title()}",
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
    plan_unit_price = _plan_unit_price(transfer.plan, transfer.billing_cycle, currency) if transfer.plan else base_amount
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
    buffer.seek(0)
    return buffer.getvalue()

def _parse_features(features_text):
    return [line.strip() for line in (features_text or "").splitlines() if line.strip()]


def _to_india_time(value):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return timezone.localtime(dt, ZoneInfo("Asia/Kolkata"))
    return value


def _format_date(value):
    if not value:
        return ""
    localized = _to_india_time(value)
    if isinstance(localized, datetime):
        return localized.strftime("%Y-%m-%d")
    return localized.strftime("%Y-%m-%d") if hasattr(localized, "strftime") else ""


def _format_datetime(value):
    if not value:
        return ""
    localized = _to_india_time(value)
    if isinstance(localized, datetime):
        return localized.strftime("%Y-%m-%d %H:%M:%S")
    return localized.strftime("%Y-%m-%d %H:%M:%S") if hasattr(localized, "strftime") else ""



def _serialize_retention_policy(policy):
    return {
        "grace_days": int(policy.grace_days),
        "archive_days": int(policy.archive_days),
        "hard_delete_days": int(policy.hard_delete_days),
        "updated_at": _format_datetime(policy.updated_at),
    }


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            dt = None
        if dt is None:
            day = parse_date(value)
            if not day:
                return None
            dt = datetime.combine(day, datetime.min.time())
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    return None


def _serialize_subscription(subscription):
    if not subscription:
        return None
    return {
        "id": subscription.id,
        "plan_id": subscription.plan_id,
        "plan_name": subscription.plan.name if subscription.plan else "-",
        "status": subscription.status,
        "billing_cycle": subscription.billing_cycle,
        "start_date": _format_date(subscription.start_date),
        "end_date": _format_date(subscription.end_date),
        "addon_count": subscription.addon_count,
        "retention_days": subscription.retention_days,
    }


def _serialize_storage_subscription(subscription):
    if not subscription:
        return None
    end_date = getattr(subscription, "renewal_date", None) or getattr(subscription, "end_date", None)
    return {
        "id": subscription.id,
        "plan_id": subscription.plan_id,
        "plan_name": subscription.plan.name if subscription.plan else "-",
        "status": subscription.status,
        "renewal_date": _format_date(getattr(subscription, "renewal_date", None)),
        "end_date": _format_date(end_date),
    }


def _bytes_to_gb_text(value):
    try:
        gb_value = float(value or 0) / float(1024 ** 3)
    except Exception:
        gb_value = 0.0
    return f"{gb_value:.2f} GB"


def _storage_subscription_status(subscription, now=None):
    current = now or timezone.now()
    if not subscription:
        return "inactive"
    raw = (getattr(subscription, "status", "") or "").lower()
    if raw == "expired":
        return "expired"
    if isinstance(subscription, Subscription):
        normalize_subscription_end_date(subscription, now=current)
        if is_subscription_active(subscription, now=current):
            return "trial" if raw == "trialing" else "active"
        return "expired" if raw in ("active", "trialing") else "inactive"
    renewal_date = getattr(subscription, "renewal_date", None)
    if raw == "trialing":
        if renewal_date and renewal_date < current.date():
            return "expired"
        return "trial"
    if raw == "active":
        if renewal_date and renewal_date < current.date():
            return "expired"
        return "active"
    return "inactive"


def _storage_subscription_sort_key(subscription, now=None):
    status = _storage_subscription_status(subscription, now=now)
    rank = {
        "active": 4,
        "trial": 3,
        "expired": 2,
        "inactive": 1,
    }.get(status, 0)
    stamp = (
        getattr(subscription, "updated_at", None)
        or getattr(subscription, "created_at", None)
        or getattr(subscription, "start_date", None)
        or getattr(subscription, "renewal_date", None)
        or getattr(subscription, "end_date", None)
    )
    if isinstance(stamp, date) and not isinstance(stamp, datetime):
        stamp = datetime.combine(stamp, datetime.min.time())
    if isinstance(stamp, datetime):
        if timezone.is_naive(stamp):
            stamp = timezone.make_aware(stamp, timezone.get_current_timezone())
        stamp_value = stamp.timestamp()
    else:
        stamp_value = 0
    return rank, stamp_value


def _pick_best_storage_subscription(candidates, now=None):
    best = None
    best_key = (-1, -1)
    for candidate in candidates or []:
        if not candidate:
            continue
        key = _storage_subscription_sort_key(candidate, now=now)
        if key > best_key:
            best = candidate
            best_key = key
    return best


def _serialize_owner(user):
    if not user:
        return {
            "id": None,
            "username": "",
            "first_name": "",
            "last_name": "",
            "email": "",
        }
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "email": user.email or "",
    }


def _product_description(product):
    if product and product.slug == "monitor":
        return "Work Zilla Work Suiteing and Productivity Insights."
    return product.description if product else ""


def _serialize_org(org, subscription=None):
    owner = org.owner
    owner_name = (owner.get_full_name() if owner else "").strip()
    return {
        "id": org.id,
        "name": org.name,
        "company_key": org.company_key,
        "created_at": _format_datetime(org.created_at),
        "owner_name": owner_name,
        "owner_email": owner.email if owner else "",
        "subscription": _serialize_subscription(subscription),
    }


def _normalize_product_slugs(slug):
    product_slug = "storage" if slug in ("storage", "online-storage") else slug
    catalog_slug = "monitor" if product_slug == "work-suite" else product_slug
    return product_slug, catalog_slug


def _get_product_org_ids(slug):
    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product = Product.objects.filter(slug=product_slug).first()
    if not product:
        return None, set()

    org_ids = set()

    if product_slug == "storage":
        org_ids.update(
            StorageOrgSubscription.objects.values_list("organization_id", flat=True)
        )

    catalog_product = CatalogProduct.objects.filter(slug=catalog_slug).first()
    if catalog_product:
        core_subs = Subscription.objects.filter(plan__product=catalog_product)
        org_ids.update(core_subs.values_list("organization_id", flat=True))
        history = SubscriptionHistory.objects.filter(plan__product=catalog_product)
        org_ids.update(history.values_list("organization_id", flat=True))
    if catalog_slug == "monitor":
        core_subs = Subscription.objects.filter(
            models.Q(plan__product__slug=catalog_slug) | models.Q(plan__product__isnull=True)
        )
        org_ids.update(core_subs.values_list("organization_id", flat=True))
        history = SubscriptionHistory.objects.filter(
            models.Q(plan__product__slug=catalog_slug) | models.Q(plan__product__isnull=True)
        )
        org_ids.update(history.values_list("organization_id", flat=True))

    entitlements = MonitorOrgProductEntitlement.objects.filter(product=product)
    org_ids.update(entitlements.values_list("organization_id", flat=True))

    return product, org_ids


def _get_transfer_org_ids(slug, statuses=None):
    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return product, set()
    pending_qs = PendingTransfer.objects.filter(
        organization__isnull=False,
        request_type__in=("new", "renew", "addon"),
    )
    if statuses:
        pending_qs = pending_qs.filter(status__in=statuses)
    if product_slug == "storage":
        pending_qs = pending_qs.filter(plan__product__slug="storage")
    elif catalog_slug == "monitor":
        pending_qs = pending_qs.filter(
            models.Q(plan__product__slug="monitor") | models.Q(plan__product__isnull=True)
        )
    else:
        pending_qs = pending_qs.filter(plan__product__slug=catalog_slug)
    pending_org_ids = set(pending_qs.values_list("organization_id", flat=True))
    return product, set(org_ids) | pending_org_ids


def _record_history(org, user, plan, status, start_date, end_date, billing_cycle):
    if not plan or not start_date:
        return
    existing = SubscriptionHistory.objects.filter(
        organization=org,
        plan=plan,
        start_date=start_date,
    ).first()
    if existing:
        existing.end_date = end_date
        existing.status = status
        existing.billing_cycle = billing_cycle
        if user:
            existing.user = user
        existing.save()
        return
    SubscriptionHistory.objects.create(
        organization=org,
        user=user,
        plan=plan,
        status=status,
        start_date=start_date,
        end_date=end_date,
        billing_cycle=billing_cycle,
    )


def _apply_transfer(transfer):
    now = timezone.now()
    org = transfer.organization
    submitted_at = transfer.created_at or now

    if transfer.request_type in ("new", "renew") and transfer.plan:
        plan_product = transfer.plan.product if transfer.plan else None
        product_slug = plan_product.slug if plan_product else "monitor"
        product_filter = models.Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter |= models.Q(plan__product__isnull=True)
        sub = (
            Subscription.objects
            .filter(organization=org)
            .filter(product_filter)
            .order_by("-start_date")
            .first()
        )
        if not sub:
            sub = Subscription(organization=org, user=transfer.user, plan=transfer.plan)
        elif sub.status == "active":
            history_end = now
            if sub.plan_id == transfer.plan_id and sub.end_date:
                history_end = sub.end_date
            _record_history(
                org=org,
                user=sub.user,
                plan=sub.plan,
                status="active",
                start_date=sub.start_date,
                end_date=history_end,
                billing_cycle=sub.billing_cycle,
            )

        start_date = submitted_at
        if (
            transfer.request_type == "renew"
            and sub.plan_id == transfer.plan_id
            and sub.end_date
            and sub.end_date > now
        ):
            start_date = sub.end_date

        duration_months = 12 if transfer.billing_cycle == "yearly" else 1
        end_date = start_date + timedelta(days=30 * duration_months)

        sub.user = transfer.user
        sub.plan = transfer.plan
        sub.status = "active"
        sub.start_date = start_date
        sub.end_date = end_date
        sub.billing_cycle = transfer.billing_cycle
        sub.retention_days = transfer.retention_days or (transfer.plan.retention_days if transfer.plan else 30)
        if transfer.plan and transfer.plan.allow_addons and transfer.addon_count is not None:
            sub.addon_count = transfer.addon_count
        sub.save()

        _record_history(
            org=org,
            user=transfer.user,
            plan=transfer.plan,
            status="active",
            start_date=start_date,
            end_date=end_date,
            billing_cycle=transfer.billing_cycle,
        )

        if product_slug == "storage":
            try:
                storage_product = StorageProduct.objects.filter(name__iexact="Online Storage").first()
                if storage_product:
                    storage_plan = None
                    if transfer.plan:
                        storage_plan = (
                            StoragePlan.objects
                            .filter(product=storage_product, name__iexact=transfer.plan.name)
                            .order_by("id")
                            .first()
                        )
                    storage_admin_services.assign_plan_to_org(
                        org=org,
                        product=storage_product,
                        plan=storage_plan,
                        status="active",
                        renewal_date=end_date.date() if end_date else None,
                    )
            except Exception:
                # Core subscription stays source-of-truth; storage mirror can be repaired later.
                pass

        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=org)
        min_interval = transfer.plan.screenshot_min_minutes or 5
        if settings_obj.screenshot_interval_minutes < min_interval:
            settings_obj.screenshot_interval_minutes = min_interval
            settings_obj.save()

    if transfer.request_type == "addon":
        sub = Subscription.objects.filter(organization=org, status="active").first()
        if sub:
            addon_delta = max(0, transfer.addon_count or 0)
            sub.addon_count = (sub.addon_count or 0) + addon_delta
            sub.addon_proration_amount = transfer.amount or 0
            sub.addon_last_proration_at = transfer.updated_at or now
            sub.save()

    if transfer.request_type == "dealer":
        dealer = DealerAccount.objects.filter(user=transfer.user).first()
        if dealer:
            dealer.subscription_status = "active"
            dealer.subscription_start = submitted_at
            dealer.subscription_end = submitted_at + timedelta(days=365)
            dealer.subscription_amount = transfer.amount or dealer.subscription_amount
            dealer.save()
            record_dealer_referral_flat_earning(dealer)

    if transfer.request_type in ("new", "renew"):
        record_referral_earning(transfer)
        record_dealer_org_referral_earning(transfer)


@login_required
@require_http_methods(["GET"])
def overview(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    now = timezone.now()
    orgs = Organization.objects.select_related("owner").order_by("name")
    total_orgs = orgs.count()
    total_users = Employee.objects.count()

    active_subs = (
        Subscription.objects
        .filter(status="active")
        .select_related("plan", "organization")
    )
    active_list = [sub for sub in active_subs if is_subscription_active(sub, now=now)]
    active_sub_count = len(active_list)
    pending_transfers = PendingTransfer.objects.filter(status="pending").count()

    expiring_monthly = 0
    expiring_yearly = 0
    monthly_total = Decimal("0.00")
    yearly_total = Decimal("0.00")
    active_sub_by_org = {}
    for sub in active_list:
        active_sub_by_org[sub.organization_id] = sub
        if sub.end_date:
            remaining_days = (sub.end_date - now).total_seconds() / 86400
            if sub.billing_cycle == "monthly" and remaining_days <= 7:
                expiring_monthly += 1
            if sub.billing_cycle == "yearly" and remaining_days <= 15:
                expiring_yearly += 1
        plan = sub.plan
        if not plan:
            continue
        if sub.billing_cycle == "yearly":
            base = Decimal(str(plan.yearly_price or 0))
            addon = Decimal(str(plan.addon_yearly_price or 0)) * Decimal(sub.addon_count or 0)
            yearly_total += base + addon
        else:
            base = Decimal(str(plan.monthly_price or 0))
            addon = Decimal(str(plan.addon_monthly_price or 0)) * Decimal(sub.addon_count or 0)
            monthly_total += base + addon

    mrr = monthly_total + (yearly_total / Decimal("12"))
    arr = (monthly_total * Decimal("12")) + yearly_total

    products = list(Product.objects.all())
    entitlements = (
        MonitorOrgProductEntitlement.objects
        .select_related("product", "organization")
    )
    entitlements_by_product = defaultdict(list)
    entitlements_by_org = defaultdict(list)
    for ent in entitlements:
        entitlements_by_product[ent.product_id].append(ent)
        entitlements_by_org[ent.organization_id].append(ent)

    product_payload = []
    for product in products:
        items = entitlements_by_product.get(product.id, [])
        active_count = sum(1 for ent in items if ent.status == "active")
        product_payload.append({
            "id": product.id,
            "name": product.name,
            "slug": product.slug,
            "description": _product_description(product),
            "icon": product.icon,
            "status": product.status,
            "features": _parse_features(product.features),
            "active_orgs": active_count,
            "total_orgs": len(items),
        })

    org_payload = []
    for org in orgs:
        owner = org.owner
        ent_list = entitlements_by_org.get(org.id, [])
        active_products = [ent.product.name for ent in ent_list if ent.status == "active"]
        sub = active_sub_by_org.get(org.id)
        sub_payload = None
        if sub:
            sub_payload = {
                "plan": sub.plan.name if sub.plan else "-",
                "status": sub.status,
                "billing_cycle": sub.billing_cycle,
                "end_date": sub.end_date.strftime("%Y-%m-%d") if sub.end_date else "",
            }
        org_payload.append({
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
            "owner_name": owner.get_full_name() if owner else "",
            "owner_email": owner.email if owner else "",
            "products": active_products,
            "subscription": sub_payload,
        })

    return JsonResponse({
        "stats": {
            "total_orgs": total_orgs,
            "total_users": total_users,
            "active_subscriptions": active_sub_count,
            "pending_transfers": pending_transfers,
            "expiring_monthly": expiring_monthly,
            "expiring_yearly": expiring_yearly,
            "mrr": float(_money(mrr)),
            "arr": float(_money(arr)),
        },
        "products": product_payload,
        "orgs": org_payload,
    })


@login_required
@require_http_methods(["GET"])
def product_detail(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    if product_slug == "storage":
        product = Product.objects.filter(slug=product_slug).first()
        if not product:
            return JsonResponse({"error": "product_not_found"}, status=404)
        storage_product = StorageProduct.objects.filter(name__iexact="Online Storage").first()
        plans_qs = StoragePlan.objects.all()
        if storage_product:
            plans_qs = plans_qs.filter(product=storage_product)
        subs = list(
            StorageOrgSubscription.objects
            .select_related("plan", "organization", "organization__owner")
            .order_by("organization__name")
        )
        org_ids = {sub.organization_id for sub in subs}
        core_subs = list(
            Subscription.objects
            .filter(plan__product__slug="storage")
            .select_related("plan", "organization", "organization__owner")
            .order_by("organization_id", "-start_date")
        )
        org_ids.update(sub.organization_id for sub in core_subs)
        sub_candidates_by_org = {}
        for sub in subs:
            sub_candidates_by_org.setdefault(sub.organization_id, []).append(sub)
        for sub in core_subs:
            sub_candidates_by_org.setdefault(sub.organization_id, []).append(sub)
        now = timezone.now()
        sub_by_org = {
            org_id: _pick_best_storage_subscription(candidates, now=now)
            for org_id, candidates in sub_candidates_by_org.items()
        }
        status_counts = {"active": 0, "trial": 0, "inactive": 0, "total": 0, "pending_approvals": 0}
        org_payload = []
        for sub in sub_by_org.values():
            org = sub.organization
            status = _storage_subscription_status(sub, now=now)
            normalized = "trial" if status == "trial" else ("active" if status == "active" else "inactive")
            status_counts[normalized] += 1
            status_counts["total"] += 1
            owner = org.owner
            org_payload.append({
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
                "owner_name": owner.get_full_name() if owner else "",
                "owner_email": owner.email if owner else "",
                "status": status,
                "enabled_at": _format_date(getattr(sub, "created_at", None) or getattr(sub, "start_date", None)),
            })
        plans_payload = [
            {
                "id": plan.id,
                "name": plan.name,
                "monthly_price": float(plan.monthly_price or 0),
                "max_users": plan.max_users,
                "storage_limit_gb": plan.storage_limit_gb,
                "is_active": plan.is_active,
            }
            for plan in plans_qs.order_by("name")
        ]
        return JsonResponse({
            "product": {
                "id": product.id,
                "name": product.name,
                "slug": product.slug,
                "description": _product_description(product),
                "icon": product.icon,
                "status": product.status,
                "features": _parse_features(product.features),
            },
            "stats": status_counts,
            "monthly_sales": {},
            "orgs": org_payload,
            "transfers": [],
            "plans": plans_payload,
        })

    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    org_ids = list(org_ids)
    orgs = (
        Organization.objects
        .filter(id__in=org_ids)
        .select_related("owner")
    )
    entitlements = (
        MonitorOrgProductEntitlement.objects
        .filter(product=product, organization_id__in=org_ids)
        .select_related("organization", "organization__owner")
    )
    entitlements_by_org = {}
    for ent in entitlements:
        existing = entitlements_by_org.get(ent.organization_id)
        if not existing or existing.status != "active":
            entitlements_by_org[ent.organization_id] = ent

    subs_by_org = {}
    if catalog_slug == "monitor" and org_ids:
        subscriptions = (
            Subscription.objects
            .filter(organization_id__in=org_ids)
            .filter(models.Q(plan__product__slug="monitor") | models.Q(plan__product__isnull=True))
            .select_related("organization", "plan")
            .order_by("organization_id", "-start_date")
        )
        for sub in subscriptions:
            if sub.organization_id not in subs_by_org:
                subs_by_org[sub.organization_id] = sub

    status_counts = {"active": 0, "trial": 0, "inactive": 0, "total": 0}

    org_payload = []
    now = timezone.now()
    for org in orgs:
        owner = org.owner
        ent = entitlements_by_org.get(org.id)
        status = ent.status if ent else None
        enabled_at = ent.enabled_at if ent else None
        if not status and catalog_slug == "monitor":
            sub = subs_by_org.get(org.id)
            if sub:
                if is_subscription_active(sub, now=now):
                    status = "active"
                else:
                    status = (sub.status or "inactive").lower()
                enabled_at = sub.start_date
        if not status:
            status = "inactive"

        normalized = status if status in ("active", "trial", "inactive") else "inactive"
        if normalized == "active":
            status_counts["active"] += 1
        elif normalized == "trial":
            status_counts["trial"] += 1
        else:
            status_counts["inactive"] += 1
        status_counts["total"] += 1

        org_payload.append({
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
            "owner_name": owner.get_full_name() if owner else "",
            "owner_email": owner.email if owner else "",
            "status": status,
            "enabled_at": _format_date(enabled_at),
        })

    pending_filter = models.Q(plan__product__slug=catalog_slug)
    if catalog_slug == "monitor":
        pending_filter |= models.Q(plan__product__isnull=True)
    pending = (
        PendingTransfer.objects
        .filter(organization_id__in=org_ids)
        .filter(pending_filter)
        .order_by("-created_at")[:10]
    )
    pending_approvals = (
        PendingTransfer.objects
        .filter(organization_id__in=org_ids, status="pending")
        .filter(pending_filter)
        .count()
    )

    monthly_start = now - timedelta(days=30)
    monthly_totals = defaultdict(Decimal)
    approved_transfers = (
        PendingTransfer.objects
        .filter(organization_id__in=org_ids, status="approved", updated_at__gte=monthly_start)
        .filter(pending_filter)
    )
    for row in approved_transfers:
        currency = row.currency or "INR"
        monthly_totals[currency] += Decimal(str(row.amount or 0))
    monthly_sales = {currency: float(_money(value)) for currency, value in monthly_totals.items()}
    transfers_payload = [
        {
            "id": row.id,
            "organization": row.organization.name if row.organization else "-",
            "request_type": row.request_type,
            "plan": row.plan.name if row.plan else "-",
            "amount": float(_money(row.amount)),
            "currency": row.currency,
            "status": row.status,
            "created_at": _format_datetime(row.created_at),
        }
        for row in pending
    ]

    if catalog_slug == "monitor":
        plan_rows = Plan.objects.filter(models.Q(product__slug="monitor") | models.Q(product__isnull=True))
    else:
        plan_rows = Plan.objects.filter(product__slug=catalog_slug)
    plans_payload = [
        {
            "id": plan.id,
            "name": plan.name,
            "monthly_price": plan.monthly_price,
            "yearly_price": plan.yearly_price,
            "employee_limit": plan.employee_limit,
            "allow_addons": plan.allow_addons,
        }
        for plan in plan_rows.order_by("price")
    ]

    return JsonResponse({
        "product": {
            "id": product.id,
            "name": product.name,
            "slug": product.slug,
            "description": _product_description(product),
            "icon": product.icon,
            "status": product.status,
            "features": _parse_features(product.features),
        },
        "stats": {
            **status_counts,
            "pending_approvals": pending_approvals,
        },
        "monthly_sales": monthly_sales,
        "orgs": org_payload,
        "transfers": transfers_payload,
        "plans": plans_payload,
    })


@login_required
@require_http_methods(["GET"])
def organizations_list(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    orgs = Organization.objects.select_related("owner").order_by("name")
    org_ids = list(orgs.values_list("id", flat=True))
    monitor_product = Product.objects.filter(slug="monitor").first()
    entitlements = (
        MonitorOrgProductEntitlement.objects
        .filter(organization_id__in=org_ids)
        .select_related("product")
    )
    entitlements_by_org = defaultdict(list)
    for ent in entitlements:
        entitlements_by_org[ent.organization_id].append({
            "slug": ent.product.slug,
            "name": ent.product.name,
            "status": ent.status,
        })
    subscriptions = (
        Subscription.objects
        .filter(organization_id__in=org_ids)
        .select_related("plan")
        .order_by("organization_id", "-start_date")
    )
    sub_by_org = {}
    for sub in subscriptions:
        if sub.organization_id not in sub_by_org:
            sub_by_org[sub.organization_id] = sub

    payload = []
    for org in orgs:
        sub = sub_by_org.get(org.id)
        row = _serialize_org(org, sub)
        product_rows = entitlements_by_org.get(org.id, [])
        has_monitor_entitlement = any(item["slug"] == "monitor" for item in product_rows)
        if sub and monitor_product and not has_monitor_entitlement:
            product_rows = product_rows + [{
                "slug": monitor_product.slug,
                "name": monitor_product.name,
                "status": "active",
            }]
        row["products"] = [item["slug"] for item in product_rows]
        row["product_statuses"] = product_rows
        payload.append(row)
    plans_payload = [
        {"id": plan.id, "name": plan.name}
        for plan in Plan.objects.all().order_by("name")
    ]
    products_payload = [
        {"id": product.id, "name": product.name, "slug": product.slug, "status": product.status}
        for product in Product.objects.all().order_by("sort_order", "name")
    ]

    dealers = (
        DealerAccount.objects
        .select_related("user", "referred_by__user")
        .order_by("user__username")
    )
    dealers_payload = [
        {
            "id": dealer.id,
            "name": dealer.user.first_name or dealer.user.username,
            "email": dealer.user.email or "",
            "referral_code": dealer.referral_code or "",
            "referred_by": dealer.referred_by.user.username if dealer.referred_by else "",
            "subscription_status": dealer.subscription_status,
            "subscription_start": _format_datetime(dealer.subscription_start),
            "subscription_end": _format_datetime(dealer.subscription_end),
            "subscription_amount": float(_money(dealer.subscription_amount)),
        }
        for dealer in dealers
    ]
    deleted_payload = [
        {
            "id": row.id,
            "organization_name": row.organization_name,
            "owner_username": row.owner_username,
            "owner_email": row.owner_email or "",
            "deleted_at": _format_datetime(row.deleted_at),
            "reason": row.reason or "",
        }
        for row in DeletedAccount.objects.order_by("-deleted_at")[:500]
    ]

    return JsonResponse({
        "organizations": payload,
        "plans": plans_payload,
        "products": products_payload,
        "dealers": dealers_payload,
        "deleted_orgs": deleted_payload,
        "deleted_dealers": [],
    })


@login_required
@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def dealer_detail(request, dealer_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    dealer = get_object_or_404(DealerAccount.objects.select_related("user", "referred_by__user"), id=dealer_id)
    user = dealer.user
    profile = UserProfile.objects.filter(user=user).first() if user else None

    if request.method == "DELETE":
        send_templated_email(
            user.email if user else "",
            "Account Deleted",
            "emails/account_deleted.txt",
            {
                "name": user.first_name if user and user.first_name else (user.username if user else "User"),
                "account_name": user.email if user else "Dealer Account",
                "reason": "Admin deleted dealer account"
            }
        )
        if user:
            user.delete()
        else:
            dealer.delete()
        return JsonResponse({"status": "deleted"})


    if request.method in ("PUT", "PATCH"):
        try:
            data = json.loads(request.body.decode("utf-8")) if request.body else {}
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

        if user:
            if "name" in data:
                user.first_name = (data.get("name") or "").strip()
            if "email" in data:
                user.email = (data.get("email") or "").strip()
                user.username = user.email
            try:
                user.save()
            except IntegrityError:
                return JsonResponse({"error": "duplicate_value"}, status=400)

        if "phone_number" in data:
            if not profile and user:
                profile = UserProfile.objects.create(user=user, role="dealer")
            if profile:
                profile.phone_number = (data.get("phone_number") or "").strip()
                profile.save()

        if "address_line1" in data:
            dealer.address_line1 = (data.get("address_line1") or "").strip()
        if "address_line2" in data:
            dealer.address_line2 = (data.get("address_line2") or "").strip()
        if "city" in data:
            dealer.city = (data.get("city") or "").strip()
        if "state" in data:
            dealer.state = (data.get("state") or "").strip()
        if "postal_code" in data:
            dealer.postal_code = (data.get("postal_code") or "").strip()
        if "bank_name" in data:
            dealer.bank_name = (data.get("bank_name") or "").strip()
        if "bank_account_number" in data:
            dealer.bank_account_number = (data.get("bank_account_number") or "").strip()
        if "bank_ifsc" in data:
            dealer.bank_ifsc = (data.get("bank_ifsc") or "").strip()
        if "upi_id" in data:
            dealer.upi_id = (data.get("upi_id") or "").strip()
        if "subscription_status" in data:
            dealer.subscription_status = (data.get("subscription_status") or dealer.subscription_status).strip()
        dealer.save()

        return JsonResponse({"status": "updated"})

    org_rows = (
        DealerReferralEarning.objects
        .filter(referrer_dealer=dealer, referred_org__isnull=False)
        .select_related("referred_org", "transfer")
        .order_by("-created_at")
    )
    dealer_rows = (
        DealerReferralEarning.objects
        .filter(referrer_dealer=dealer, referred_dealer__isnull=False)
        .select_related("referred_dealer__user", "transfer")
        .order_by("-created_at")
    )
    org_payload = [
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
        for row in org_rows
    ]
    dealer_payload = [
        {
            "id": row.id,
            "referred_dealer": row.referred_dealer.user.username if row.referred_dealer else "-",
            "flat_amount": float(_money(row.flat_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": row.payout_date.isoformat() if row.payout_date else "",
            "created_at": _format_datetime(row.created_at),
        }
        for row in dealer_rows
    ]

    return JsonResponse({
        "dealer": {
            "id": dealer.id,
            "name": user.first_name if user else "",
            "email": user.email if user else "",
            "phone_number": profile.phone_number if profile else "",
            "referral_code": dealer.referral_code or "",
            "referred_by": dealer.referred_by.user.username if dealer.referred_by else "",
            "subscription_status": dealer.subscription_status,
            "subscription_start": _format_datetime(dealer.subscription_start),
            "subscription_end": _format_datetime(dealer.subscription_end),
            "address_line1": dealer.address_line1,
            "address_line2": dealer.address_line2,
            "city": dealer.city,
            "state": dealer.state,
            "postal_code": dealer.postal_code,
            "bank_name": dealer.bank_name,
            "bank_account_number": dealer.bank_account_number,
            "bank_ifsc": dealer.bank_ifsc,
            "upi_id": dealer.upi_id,
        },
        "org_referrals": org_payload,
        "dealer_referrals": dealer_payload,
    })


@login_required
@require_http_methods(["DELETE"])
def deleted_account_detail(request, account_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    account = DeletedAccount.objects.filter(id=account_id).first()
    if not account:
        return JsonResponse({"error": "not_found"}, status=404)
    account.delete()
    return JsonResponse({"status": "deleted"})


@login_required
@require_http_methods(["GET"])
def inbox_list(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    try:
        page = max(int(request.GET.get("page", 1)), 1)
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = min(max(page_size, 5), 100)

    queryset = (
        AdminNotification.objects
        .select_related("organization")
        .filter(is_deleted=False)
        .order_by("-created_at")
    )
    total = queryset.count()
    start = (page - 1) * page_size
    end = start + page_size
    results = [serialize_notification(item) for item in queryset[start:end]]
    total_pages = max(math.ceil(total / page_size), 1)
    unread_count = queryset.filter(is_read=False).count()

    return JsonResponse({
        "results": results,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "unread_count": unread_count,
    })


@login_required
@require_http_methods(["POST"])
def inbox_mark_read(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid_json"}, status=400)

    ids = data.get("ids") or []
    if not isinstance(ids, list):
        ids = [data.get("id")] if data.get("id") else []
    ids = [int(item) for item in ids if str(item).isdigit()]
    if not ids:
        return JsonResponse({"error": "no_ids"}, status=400)

    updated = (
        AdminNotification.objects
        .filter(id__in=ids)
        .update(is_read=True)
    )
    return JsonResponse({"status": "ok", "updated": updated})


@login_required
@require_http_methods(["DELETE"])
def inbox_delete(request, notification_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    updated = (
        AdminNotification.objects
        .filter(id=notification_id)
        .update(is_deleted=True)
    )
    if not updated:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "deleted"})


def _organization_detail_payload(org, subscription):
    owner = org.owner
    profile = UserProfile.objects.filter(user=owner).first() if owner else None
    billing_profile = BillingProfile.objects.filter(organization=org).first()
    org_settings = OrganizationSettings.objects.filter(organization=org).first()
    privacy_settings = CompanyPrivacySettings.objects.filter(organization=org).first()
    return {
        "organization": {
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
            "created_at": _format_datetime(org.created_at),
        },
        "owner": _serialize_owner(owner),
        "profile": {
            "role": profile.role if profile else "",
            "phone_number": profile.phone_number if profile else "",
        },
        "subscription": _serialize_subscription(subscription),
        "billing_profile": {
            "contact_name": billing_profile.contact_name if billing_profile else "",
            "company_name": billing_profile.company_name if billing_profile else "",
            "email": billing_profile.email if billing_profile else "",
            "phone": billing_profile.phone if billing_profile else "",
            "address_line1": billing_profile.address_line1 if billing_profile else "",
            "address_line2": billing_profile.address_line2 if billing_profile else "",
            "city": billing_profile.city if billing_profile else "",
            "state": billing_profile.state if billing_profile else "",
            "postal_code": billing_profile.postal_code if billing_profile else "",
            "country": billing_profile.country if billing_profile else "",
            "gstin": billing_profile.gstin if billing_profile else "",
            "updated_at": _format_datetime(billing_profile.updated_at) if billing_profile else "",
        },
        "settings": {
            "screenshot_interval_minutes": org_settings.screenshot_interval_minutes if org_settings else "",
            "monitoring_mode": privacy_settings.monitoring_mode if privacy_settings else "",
        },
    }


@login_required
@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def organization_detail(request, org_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    org = get_object_or_404(Organization, id=org_id)
    subscription = (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan")
        .order_by("-start_date")
        .first()
    )

    if request.method == "GET":
        return JsonResponse(_organization_detail_payload(org, subscription))

    if request.method == "DELETE":
        owner = org.owner
        send_templated_email(
            owner.email if owner else "",
            "Account Deleted",
            "emails/account_deleted.txt",
            {
                "name": owner.first_name if owner and owner.first_name else (owner.username if owner else "User"),
                "account_name": org.name,
                "reason": "Admin deleted organization"
            }
        )
        DeletedAccount.objects.create(
            organization_name=org.name,
            owner_username=owner.username if owner else "-",
            owner_email=owner.email if owner else "",
            reason="Admin deleted organization",
        )
        if owner:
            owner.delete()
        else:
            org.delete()
        return JsonResponse({"status": "deleted"})

    data = {}
    if request.body:
        try:
            data = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse({"error": "invalid_json"}, status=400)

    owner = org.owner
    try:
        with transaction.atomic():
            if "name" in data:
                org.name = (data.get("name") or "").strip()
            if "company_key" in data:
                org.company_key = (data.get("company_key") or "").strip()

            billing_profile, _ = BillingProfile.objects.get_or_create(organization=org)
            if "billing_contact_name" in data:
                billing_profile.contact_name = (data.get("billing_contact_name") or "").strip()
            if "billing_company_name" in data:
                billing_profile.company_name = (data.get("billing_company_name") or "").strip()
            if "billing_email" in data:
                billing_profile.email = (data.get("billing_email") or "").strip()
            if "billing_phone" in data:
                billing_profile.phone = (data.get("billing_phone") or "").strip()
            if "billing_address_line1" in data:
                billing_profile.address_line1 = (data.get("billing_address_line1") or "").strip()
            if "billing_address_line2" in data:
                billing_profile.address_line2 = (data.get("billing_address_line2") or "").strip()
            if "billing_city" in data:
                billing_profile.city = (data.get("billing_city") or "").strip()
            if "billing_state" in data:
                billing_profile.state = (data.get("billing_state") or "").strip()
            if "billing_postal_code" in data:
                billing_profile.postal_code = (data.get("billing_postal_code") or "").strip()
            if "billing_country" in data:
                billing_profile.country = (data.get("billing_country") or "").strip()
            if "billing_gstin" in data:
                billing_profile.gstin = (data.get("billing_gstin") or "").strip()

            if owner:
                if "owner_username" in data:
                    owner.username = (data.get("owner_username") or "").strip()
                if "owner_first_name" in data:
                    owner.first_name = (data.get("owner_first_name") or "").strip()
                if "owner_last_name" in data:
                    owner.last_name = (data.get("owner_last_name") or "").strip()
                if "owner_email" in data:
                    owner.email = (data.get("owner_email") or "").strip()

            if "plan_id" in data or "billing_cycle" in data or "status" in data or "end_date" in data:
                plan_id = data.get("plan_id")
                if plan_id:
                    plan = Plan.objects.filter(id=plan_id).first()
                    if not plan:
                        return JsonResponse({"error": "invalid_plan"}, status=400)
                else:
                    plan = subscription.plan if subscription else None

                if not subscription and plan:
                    subscription = Subscription(
                        organization=org,
                        user=owner or request.user,
                        plan=plan,
                    )

                if subscription:
                    if plan:
                        subscription.plan = plan
                    if "billing_cycle" in data and data.get("billing_cycle"):
                        subscription.billing_cycle = data.get("billing_cycle")
                    if "status" in data and data.get("status"):
                        subscription.status = data.get("status")
                    if "end_date" in data:
                        end_date = _parse_datetime(data.get("end_date"))
                        subscription.end_date = end_date
                    if "addon_count" in data and data.get("addon_count") is not None:
                        subscription.addon_count = max(0, int(data.get("addon_count") or 0))

            org.save()
            if owner:
                owner.save()
            if subscription:
                subscription.save()
            billing_profile.save()
    except IntegrityError:
        return JsonResponse({"error": "duplicate_value"}, status=400)
    except ValueError as error:
        details = error.args[0] if error.args else None
        if isinstance(details, dict):
            return JsonResponse(details, status=400)
        return JsonResponse({"error": "invalid_value"}, status=400)

    subscription = (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan")
        .order_by("-start_date")
        .first()
    )
    return JsonResponse(_organization_detail_payload(org, subscription))


def _plan_payload(plan):
    product = plan.product
    return {
        "id": plan.id,
        "name": plan.name,
        "product_slug": product.slug if product else "monitor",
        "product_name": product.name if product else "Work Suite",
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
        "screenshot_min_minutes": plan.screenshot_min_minutes,
        "ai_library_limit_mb": plan.ai_library_limit_mb,
        "website_page_limit": plan.website_page_limit,
        "allow_addons": plan.allow_addons,
        "allow_app_usage": plan.allow_app_usage,
        "allow_hr_view": plan.allow_hr_view,
        "limits": plan.limits or {},
        "features": plan.features or {},
    }


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes", "on")
    return bool(value)


def _update_plan_from_payload(plan, data):
    errors = {}
    if "name" in data:
        plan.name = (data.get("name") or "").strip()
    if "product_slug" in data:
        slug = (data.get("product_slug") or "").strip()
        if slug:
            product = CatalogProduct.objects.filter(slug=slug).first()
            if product:
                plan.product = product

    allow_free = True

    def set_float(field, value):
        if value is None or value == "":
            return
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            errors[field] = ["Enter a valid number."]
            return
        if parsed < 0:
            errors[field] = ["Price must be >= 0."]
            return
        if not allow_free and parsed <= 0:
            errors[field] = ["Price must be > 0."]
            return
        setattr(plan, field, parsed)

    def set_int(field, value):
        if value is None or value == "":
            return
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            errors[field] = ["Enter a valid number."]
            return
        setattr(plan, field, parsed)

    if "monthly_price" in data:
        set_float("monthly_price", data.get("monthly_price"))
    if "yearly_price" in data:
        set_float("yearly_price", data.get("yearly_price"))
    if "usd_monthly_price" in data:
        set_float("usd_monthly_price", data.get("usd_monthly_price"))
    if "usd_yearly_price" in data:
        set_float("usd_yearly_price", data.get("usd_yearly_price"))
    if "addon_monthly_price" in data:
        set_float("addon_monthly_price", data.get("addon_monthly_price"))
    if "addon_yearly_price" in data:
        set_float("addon_yearly_price", data.get("addon_yearly_price"))
    if "addon_usd_monthly_price" in data:
        set_float("addon_usd_monthly_price", data.get("addon_usd_monthly_price"))
    if "addon_usd_yearly_price" in data:
        set_float("addon_usd_yearly_price", data.get("addon_usd_yearly_price"))
    if "addon_agent_monthly_price" in data:
        set_float("addon_agent_monthly_price", data.get("addon_agent_monthly_price"))
    if "addon_agent_yearly_price" in data:
        set_float("addon_agent_yearly_price", data.get("addon_agent_yearly_price"))
    if "employee_limit" in data:
        set_int("employee_limit", data.get("employee_limit"))
    if "retention_days" in data:
        set_int("retention_days", data.get("retention_days"))
    if "screenshot_min_minutes" in data:
        set_int("screenshot_min_minutes", data.get("screenshot_min_minutes"))
    if "ai_library_limit_mb" in data:
        set_int("ai_library_limit_mb", data.get("ai_library_limit_mb"))
    if "website_page_limit" in data:
        set_int("website_page_limit", data.get("website_page_limit"))
    if "allow_addons" in data:
        plan.allow_addons = _parse_bool(data.get("allow_addons"))
    if "allow_app_usage" in data:
        plan.allow_app_usage = _parse_bool(data.get("allow_app_usage"))
    if "allow_hr_view" in data:
        plan.allow_hr_view = _parse_bool(data.get("allow_hr_view"))
    if "limits" in data and isinstance(data.get("limits"), dict):
        plan.limits = data.get("limits") or {}
    if "features" in data and isinstance(data.get("features"), dict):
        plan.features = data.get("features") or {}
    if errors:
        raise ValueError(errors)


@login_required
@require_http_methods(["GET", "POST"])
def plans_list(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    if request.method == "GET":
        product_slug = (request.GET.get("product") or "").strip()
        if product_slug == "work-suite":
            product_slug = "monitor"
        plans = Plan.objects.all()
        if product_slug:
            if product_slug == "monitor":
                plans = plans.filter(models.Q(product__slug="monitor") | models.Q(product__isnull=True))
            else:
                plans = plans.filter(product__slug=product_slug)
        plans = plans.order_by("name")
        return JsonResponse({"plans": [_plan_payload(plan) for plan in plans]})

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid_json"}, status=400)

    plan = Plan()
    try:
        _update_plan_from_payload(plan, data)
        if not plan.name:
            return JsonResponse({"error": "name_required"}, status=400)
        if not plan.product:
            return JsonResponse({"product": ["Product is required."]}, status=400)
        plan.save()
    except ValueError as error:
        details = error.args[0] if error.args else None
        if isinstance(details, dict):
            return JsonResponse(details, status=400)
        return JsonResponse({"error": "invalid_value"}, status=400)
    return JsonResponse({"plan": _plan_payload(plan)})


@login_required
@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def plan_detail(request, plan_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    plan = get_object_or_404(Plan, id=plan_id)

    if request.method == "GET":
        return JsonResponse({"plan": _plan_payload(plan)})

    if request.method == "DELETE":
        plan.delete()
        return JsonResponse({"status": "deleted"})

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid_json"}, status=400)

    try:
        _update_plan_from_payload(plan, data)
        if not plan.name:
            return JsonResponse({"error": "name_required"}, status=400)
        if not plan.product:
            return JsonResponse({"product": ["Product is required."]}, status=400)
        plan.save()
    except ValueError:
        return JsonResponse({"error": "invalid_value"}, status=400)
    return JsonResponse({"plan": _plan_payload(plan)})


@login_required
@require_http_methods(["GET"])
def product_organizations(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)
    if product_slug == "storage":
        orgs = Organization.objects.filter(id__in=list(org_ids)).select_related("owner").order_by("name")
        subscriptions = list(
            StorageOrgSubscription.objects
            .filter(organization_id__in=list(org_ids))
            .select_related("plan")
            .order_by("organization_id", "-created_at")
        )
        sub_candidates_by_org = {}
        for sub in subscriptions:
            sub_candidates_by_org.setdefault(sub.organization_id, []).append(sub)
        core_subs = list(
            Subscription.objects
            .filter(organization_id__in=list(org_ids), plan__product__slug="storage")
            .select_related("plan")
            .order_by("organization_id", "-start_date")
        )
        for sub in core_subs:
            sub_candidates_by_org.setdefault(sub.organization_id, []).append(sub)
        payload = []
        now = timezone.now()
        sub_by_org = {
            org_id: _pick_best_storage_subscription(candidates, now=now)
            for org_id, candidates in sub_candidates_by_org.items()
        }
        for org in orgs:
            owner = org.owner
            owner_name = (owner.get_full_name() if owner else "").strip()
            sub = sub_by_org.get(org.id)
            payload.append({
                "id": org.id,
                "name": org.name,
                "company_key": org.company_key,
                "created_at": _format_datetime(org.created_at),
                "owner_name": owner_name,
                "owner_email": owner.email if owner else "",
                "status": _storage_subscription_status(sub, now=now),
                "subscription": _serialize_storage_subscription(sub),
            })
        plans_payload = [
            {"id": plan.id, "name": plan.name}
            for plan in StoragePlan.objects.all().order_by("name")
        ]
        return JsonResponse({
            "product": {"id": product.id, "name": product.name, "slug": product.slug},
            "organizations": payload,
            "plans": plans_payload,
            "dealers": [],
            "deleted_orgs": [],
            "deleted_dealers": [],
        })
    orgs = Organization.objects.filter(id__in=list(org_ids)).select_related("owner").order_by("name")
    sub_filter = models.Q(plan__product__slug=catalog_slug)
    if catalog_slug == "monitor":
        sub_filter |= models.Q(plan__product__isnull=True)
    subscriptions = (
        Subscription.objects
        .filter(organization_id__in=list(org_ids))
        .filter(sub_filter)
        .select_related("plan")
        .order_by("organization_id", "-start_date")
    )
    sub_by_org = {}
    for sub in subscriptions:
        if sub.organization_id not in sub_by_org:
            sub_by_org[sub.organization_id] = sub

    entitlement_rows = (
        MonitorOrgProductEntitlement.objects
        .filter(product=product, organization_id__in=list(org_ids))
        .order_by("organization_id", "-enabled_at")
    )
    entitlement_by_org = {}
    for row in entitlement_rows:
        existing = entitlement_by_org.get(row.organization_id)
        if not existing or existing.status != "active":
            entitlement_by_org[row.organization_id] = row

    now = timezone.now()
    payload = []
    for org in orgs:
        sub = sub_by_org.get(org.id)
        serialized = _serialize_org(org, sub)
        ent = entitlement_by_org.get(org.id)
        status = (ent.status or "").lower() if ent else ""
        if status not in ("active", "trial", "inactive"):
            if sub:
                if is_subscription_active(sub, now=now):
                    status = "active"
                elif (sub.status or "").lower() == "expired":
                    status = "expired"
                else:
                    status = "inactive"
            else:
                status = "inactive"
        serialized["status"] = status
        payload.append(serialized)
    plans_qs = Plan.objects.all()
    if catalog_slug == "monitor":
        plans_qs = plans_qs.filter(models.Q(product__slug="monitor") | models.Q(product__isnull=True))
    else:
        plans_qs = plans_qs.filter(product__slug=catalog_slug)
    plans_payload = [{"id": plan.id, "name": plan.name} for plan in plans_qs.order_by("name")]
    dealers = (
        DealerAccount.objects
        .select_related("user", "referred_by__user")
        .order_by("user__username")
    )
    dealers_payload = [
        {
            "id": dealer.id,
            "name": dealer.user.first_name or dealer.user.username,
            "username": dealer.user.username,
            "email": dealer.user.email or "",
            "referral_code": dealer.referral_code or "",
            "referred_by": dealer.referred_by.user.username if dealer.referred_by else "",
            "subscription_status": dealer.subscription_status,
            "subscription_start": _format_datetime(dealer.subscription_start),
            "subscription_end": _format_datetime(dealer.subscription_end),
            "subscription_amount": float(_money(dealer.subscription_amount)),
        }
        for dealer in dealers
    ]
    deleted_payload = [
        {
            "id": row.id,
            "organization_name": row.organization_name,
            "owner_username": row.owner_username,
            "owner_email": row.owner_email or "",
            "deleted_at": _format_datetime(row.deleted_at),
            "reason": row.reason or "",
        }
        for row in DeletedAccount.objects.order_by("-deleted_at")[:500]
    ]
    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "organizations": payload,
        "plans": plans_payload,
        "dealers": dealers_payload,
        "deleted_orgs": deleted_payload,
        "deleted_dealers": [],
    })


@login_required
@require_http_methods(["GET"])
def product_users(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)
    if product_slug == "storage":
        org_ids_list = list(org_ids)
        usage_rows = StorageOrgUsage.objects.filter(organization_id__in=org_ids_list)
        usage_by_org = {row.organization_id: row for row in usage_rows}
        bandwidth_rows = (
            StorageOrgBandwidthUsage.objects
            .filter(organization_id__in=org_ids_list)
            .order_by("organization_id", "-billing_cycle_start")
        )
        bandwidth_by_org = {}
        for row in bandwidth_rows:
            if row.organization_id not in bandwidth_by_org:
                bandwidth_by_org[row.organization_id] = row
        device_counts = (
            StorageOrgUser.objects
            .filter(organization_id__in=org_ids_list)
            .values("organization_id")
            .annotate(total=models.Count("id"))
        )
        device_count_by_org = {row["organization_id"]: int(row["total"] or 0) for row in device_counts}
        users = (
            StorageOrgUser.objects
            .filter(organization_id__in=org_ids_list)
            .select_related("user", "organization")
            .order_by("user__first_name", "user__username")
        )
        payload = [
            {
                "id": row.id,
                "name": (row.user.get_full_name() or row.user.username) if row.user else "-",
                "email": row.user.email if row.user else "",
                "pc_name": _bytes_to_gb_text((usage_by_org.get(row.organization_id).used_storage_bytes if usage_by_org.get(row.organization_id) else 0)),
                "device_id": str(device_count_by_org.get(row.organization_id, 0)),
                "device_count": device_count_by_org.get(row.organization_id, 0),
                "total_utilized_space": _bytes_to_gb_text((usage_by_org.get(row.organization_id).used_storage_bytes if usage_by_org.get(row.organization_id) else 0)),
                "monthly_consumed_bandwidth": _bytes_to_gb_text((bandwidth_by_org.get(row.organization_id).used_bandwidth_bytes if bandwidth_by_org.get(row.organization_id) else 0)),
                "org_id": row.organization_id,
                "org_name": row.organization.name if row.organization else "",
                "created_at": _format_datetime(row.created_at),
            }
            for row in users
        ]
        return JsonResponse({
            "product": {"id": product.id, "name": product.name, "slug": product.slug},
            "users": payload,
        })
    users = (
        Employee.objects
        .filter(org_id__in=list(org_ids))
        .select_related("org")
        .order_by("name")
    )
    payload = [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email or "",
            "pc_name": user.pc_name or "",
            "device_id": user.device_id,
            "org_id": user.org_id,
            "org_name": user.org.name if user.org else "",
            "created_at": _format_datetime(user.created_at),
        }
        for user in users
    ]
    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "users": payload,
    })


@login_required
@require_http_methods(["GET", "PUT", "PATCH", "DELETE"])
def product_user_detail(request, slug, user_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)
    if product_slug == "storage":
        row = get_object_or_404(StorageOrgUser, id=user_id)
        if row.organization_id not in org_ids:
            return HttpResponseForbidden("Access denied.")
        if request.method != "GET":
            return JsonResponse({"error": "readonly"}, status=400)
        user = row.user
        usage = StorageOrgUsage.objects.filter(organization_id=row.organization_id).first()
        bandwidth = (
            StorageOrgBandwidthUsage.objects
            .filter(organization_id=row.organization_id)
            .order_by("-billing_cycle_start")
            .first()
        )
        device_count = StorageOrgUser.objects.filter(organization_id=row.organization_id).count()
        return JsonResponse({
            "user": {
                "id": row.id,
                "name": (user.get_full_name() or user.username) if user else "",
                "email": user.email if user else "",
                "pc_name": _bytes_to_gb_text(usage.used_storage_bytes if usage else 0),
                "device_id": str(device_count),
                "device_count": device_count,
                "total_utilized_space": _bytes_to_gb_text(usage.used_storage_bytes if usage else 0),
                "monthly_consumed_bandwidth": _bytes_to_gb_text(bandwidth.used_bandwidth_bytes if bandwidth else 0),
                "org_id": row.organization_id,
                "org_name": row.organization.name if row.organization else "",
                "created_at": _format_datetime(row.created_at),
            }
        })
    user = get_object_or_404(Employee, id=user_id)
    if user.org_id not in org_ids:
        return HttpResponseForbidden("Access denied.")

    if request.method == "GET":
        return JsonResponse({
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email or "",
                "pc_name": user.pc_name or "",
                "device_id": user.device_id,
                "org_id": user.org_id,
                "org_name": user.org.name if user.org else "",
                "created_at": _format_datetime(user.created_at),
            }
        })

    if request.method == "DELETE":
        user.delete()
        return JsonResponse({"status": "deleted"})

    try:
        data = json.loads(request.body.decode("utf-8")) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid_json"}, status=400)

    if "name" in data:
        user.name = (data.get("name") or "").strip()
    if "email" in data:
        user.email = (data.get("email") or "").strip()
    if "pc_name" in data:
        user.pc_name = (data.get("pc_name") or "").strip()
    if "device_id" in data:
        user.device_id = (data.get("device_id") or "").strip()
    try:
        user.save()
    except IntegrityError:
        return JsonResponse({"error": "duplicate_value"}, status=400)

    return JsonResponse({
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email or "",
            "pc_name": user.pc_name or "",
            "device_id": user.device_id,
            "org_id": user.org_id,
            "org_name": user.org.name if user.org else "",
            "created_at": _format_datetime(user.created_at),
        }
    })


@login_required
@require_http_methods(["GET"])
def product_pending_transfers(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_transfer_org_ids(slug, statuses=("pending",))
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)
    if product_slug == "storage":
        org_transfers = (
            PendingTransfer.objects
            .filter(
                organization_id__in=list(org_ids),
                status="pending",
                plan__product__slug="storage",
            )
            .select_related("organization", "plan")
            .order_by("-created_at")
        )
        org_payload = [
            {
                "id": row.id,
                "organization": row.organization.name if row.organization else "-",
                "request_type": row.request_type,
                "billing_cycle": row.billing_cycle,
                "plan": row.plan.name if row.plan else "-",
                "amount": float(_money(row.amount)),
                "currency": row.currency,
                "addon_count": row.addon_count or 0,
                "status": row.status,
                "created_at": _format_datetime(row.created_at),
                "receipt_url": row.receipt.url if row.receipt else "",
            }
            for row in org_transfers
        ]
        return JsonResponse({
            "product": {"id": product.id, "name": product.name, "slug": product.slug},
            "org_transfers": org_payload,
            "dealer_transfers": [],
        })
    plan_filter = models.Q(plan__product__slug=catalog_slug)
    if catalog_slug == "monitor":
        plan_filter |= models.Q(plan__product__isnull=True)
    org_transfers = (
        PendingTransfer.objects
        .filter(organization_id__in=list(org_ids), status="pending")
        .filter(plan_filter)
        .select_related("organization", "plan")
        .order_by("-created_at")
    )
    org_payload = [
        {
            "id": row.id,
            "organization": row.organization.name if row.organization else "-",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle,
            "plan": row.plan.name if row.plan else "-",
            "amount": float(_money(row.amount)),
            "currency": row.currency,
            "addon_count": row.addon_count or 0,
            "status": row.status,
            "created_at": _format_datetime(row.created_at),
            "receipt_url": row.receipt.url if row.receipt else "",
        }
        for row in org_transfers
    ]
    dealer_transfers = (
        PendingTransfer.objects
        .filter(status="pending", request_type="dealer")
        .select_related("user")
        .order_by("-created_at")
    )
    dealer_payload = [
        {
            "id": row.id,
            "organization": row.user.username if row.user else "-",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle or "yearly",
            "plan": "Dealer Subscription",
            "amount": float(_money(row.amount)),
            "currency": row.currency or "INR",
            "addon_count": row.addon_count or 0,
            "status": row.status,
            "created_at": _format_datetime(row.created_at),
            "receipt_url": row.receipt.url if row.receipt else "",
        }
        for row in dealer_transfers
    ]
    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "org_transfers": org_payload,
        "dealer_transfers": dealer_payload,
    })


@login_required
@require_http_methods(["POST"])
def product_pending_transfer_action(request, slug, transfer_id, action):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_transfer_org_ids(slug, statuses=("pending",))
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    transfer = get_object_or_404(PendingTransfer, id=transfer_id)
    if transfer.request_type != "dealer":
        if product_slug == "storage":
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != "storage":
                return HttpResponseForbidden("Access denied.")
        elif catalog_slug == "monitor":
            if not transfer.plan or (transfer.plan.product and transfer.plan.product.slug != "monitor"):
                return HttpResponseForbidden("Access denied.")
        else:
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != catalog_slug:
                return HttpResponseForbidden("Access denied.")
    if transfer.request_type != "dealer" and transfer.organization_id not in org_ids:
        return HttpResponseForbidden("Access denied.")

    if action == "approve":
        if transfer.status != "approved":
            transfer.status = "approved"
            transfer.save()
            _apply_transfer(transfer)
            recipient = ""
            recipient_name = ""
            if transfer.request_type == "dealer":
                recipient = transfer.user.email if transfer.user else ""
                recipient_name = transfer.user.first_name if transfer.user else ""
            else:
                owner = transfer.organization.owner if transfer.organization else None
                recipient = owner.email if owner else (transfer.user.email if transfer.user else "")
                recipient_name = owner.first_name if owner else (transfer.user.first_name if transfer.user else "")
            send_templated_email(
                recipient,
                "Bank Transfer Approved",
                "emails/bank_transfer_approved.txt",
                {
                    "name": recipient_name or "User",
                    "plan_name": transfer.plan.name if transfer.plan else ("Dealer Subscription" if transfer.request_type == "dealer" else "-"),
                    "billing_cycle": transfer.billing_cycle or "yearly",
                    "currency": transfer.currency or "INR",
                    "amount": transfer.amount or 0,
                    "reference_no": transfer.reference_no or "-"
                }
            )
        return JsonResponse({"status": "approved"})
    if action == "reject":
        if transfer.status == "approved":
            revert_transfer_subscription(transfer)
        transfer.status = "rejected"
        transfer.save()
        return JsonResponse({"status": "rejected"})
    if action == "delete":
        if transfer.status == "approved":
            return JsonResponse({"error": "cannot_delete_approved"}, status=400)
        transfer.delete()
        return JsonResponse({"status": "deleted"})
    return JsonResponse({"error": "invalid_action"}, status=400)


@login_required
@require_http_methods(["GET"])
def product_pending_transfer_detail(request, slug, transfer_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_transfer_org_ids(slug, statuses=("pending",))
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    transfer = get_object_or_404(PendingTransfer, id=transfer_id)
    if transfer.request_type != "dealer":
        if product_slug == "storage":
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != "storage":
                return HttpResponseForbidden("Access denied.")
        elif catalog_slug == "monitor":
            if not transfer.plan or (transfer.plan.product and transfer.plan.product.slug != "monitor"):
                return HttpResponseForbidden("Access denied.")
        else:
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != catalog_slug:
                return HttpResponseForbidden("Access denied.")
    if transfer.request_type != "dealer" and transfer.organization_id not in org_ids:
        return HttpResponseForbidden("Access denied.")

    receipt_url = ""
    if transfer.receipt:
        try:
            receipt_url = transfer.receipt.url
        except ValueError:
            receipt_url = ""

    return JsonResponse({
        "transfer": {
            "id": transfer.id,
            "organization": transfer.organization.name if transfer.organization else "-",
            "dealer": transfer.user.username if transfer.user else "-",
            "request_type": transfer.request_type,
            "billing_cycle": transfer.billing_cycle,
            "plan": transfer.plan.name if transfer.plan else ("Dealer Subscription" if transfer.request_type == "dealer" else "-"),
            "amount": float(_money(transfer.amount)),
            "currency": transfer.currency or "INR",
            "addon_count": transfer.addon_count or 0,
            "reference_no": transfer.reference_no or "",
            "notes": transfer.notes or "",
            "status": transfer.status,
            "created_at": _format_datetime(transfer.created_at),
            "updated_at": _format_datetime(transfer.updated_at),
            "receipt_url": receipt_url,
        }
    })


@login_required
@require_http_methods(["POST"])
def product_pending_transfer_clear_receipt(request, slug, transfer_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_transfer_org_ids(slug, statuses=("pending", "draft", "approved", "rejected"))
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    transfer = get_object_or_404(PendingTransfer, id=transfer_id)
    if transfer.request_type != "dealer":
        if product_slug == "storage":
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != "storage":
                return HttpResponseForbidden("Access denied.")
        elif catalog_slug == "monitor":
            if not transfer.plan or (transfer.plan.product and transfer.plan.product.slug != "monitor"):
                return HttpResponseForbidden("Access denied.")
        else:
            if not transfer.plan or not transfer.plan.product or transfer.plan.product.slug != catalog_slug:
                return HttpResponseForbidden("Access denied.")
    if transfer.request_type != "dealer" and transfer.organization_id not in org_ids:
        return HttpResponseForbidden("Access denied.")

    if transfer.receipt:
        receipt_name = transfer.receipt.name
        transfer.receipt.delete(save=False)
        if receipt_name:
            storage = transfer.receipt.storage
            try:
                storage.delete(receipt_name)
            except Exception:
                try:
                    path = storage.path(receipt_name)
                except Exception:
                    path = ""
                if path:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
    transfer.receipt = None
    transfer.save(update_fields=["receipt"])
    return JsonResponse({"status": "cleared"})


@login_required
@require_http_methods(["GET"])
def product_transfer_history(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_transfer_org_ids(slug, statuses=("approved", "rejected"))
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)
    if product_slug == "storage":
        org_transfers = (
            PendingTransfer.objects
            .filter(
                organization_id__in=list(org_ids),
                status__in=("approved", "rejected"),
                plan__product__slug="storage",
            )
            .select_related("organization", "plan")
            .order_by("-updated_at")
        )
        rows = [
            {
                "sort_time": row.updated_at or row.created_at,
                "id": row.id,
                "organization": row.organization.name if row.organization else "-",
                "request_type": row.request_type,
                "billing_cycle": row.billing_cycle,
                "plan": row.plan.name if row.plan else "-",
                "amount": float(_money(row.amount)),
                "currency": row.currency,
                "status": row.status,
                "updated_at": _format_datetime(row.updated_at),
                "created_at": _format_datetime(row.created_at),
                "receipt_url": row.receipt.url if row.receipt else "",
            }
            for row in org_transfers
        ]
        rows.sort(key=lambda item: item["sort_time"] or timezone.now(), reverse=True)
        payload = [{key: value for key, value in row.items() if key != "sort_time"} for row in rows]
        return JsonResponse({
            "product": {"id": product.id, "name": product.name, "slug": product.slug},
            "transfers": payload,
        })

    history_filter = models.Q(plan__product__slug=catalog_slug)
    if catalog_slug == "monitor":
        history_filter |= models.Q(plan__product__isnull=True)
    org_transfers = (
        PendingTransfer.objects
        .filter(organization_id__in=list(org_ids), status__in=("approved", "rejected"))
        .filter(history_filter)
        .select_related("organization", "plan")
        .order_by("-updated_at")
    )
    dealer_transfers = (
        PendingTransfer.objects
        .filter(status__in=("approved", "rejected"), request_type="dealer")
        .select_related("user")
        .order_by("-updated_at")
    )

    rows = []
    for row in org_transfers:
        rows.append({
            "sort_time": row.updated_at or row.created_at,
            "id": row.id,
            "organization": row.organization.name if row.organization else "-",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle,
            "plan": row.plan.name if row.plan else "-",
            "amount": float(_money(row.amount)),
            "currency": row.currency,
            "status": row.status,
            "updated_at": _format_datetime(row.updated_at),
            "created_at": _format_datetime(row.created_at),
            "receipt_url": row.receipt.url if row.receipt else "",
        })
    for row in dealer_transfers:
        rows.append({
            "sort_time": row.updated_at or row.created_at,
            "id": row.id,
            "organization": row.user.username if row.user else "-",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle or "yearly",
            "plan": "Dealer Subscription",
            "amount": float(_money(row.amount)),
            "currency": row.currency or "INR",
            "status": row.status,
            "updated_at": _format_datetime(row.updated_at),
            "created_at": _format_datetime(row.created_at),
            "receipt_url": row.receipt.url if row.receipt else "",
        })

    rows.sort(key=lambda item: item["sort_time"] or timezone.now(), reverse=True)
    payload = [{key: value for key, value in row.items() if key != "sort_time"} for row in rows]

    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "transfers": payload,
    })


@login_required
@require_http_methods(["GET"])
def product_billing_history(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product_slug, catalog_slug = _normalize_product_slugs(slug)
    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    plan_product = CatalogProduct.objects.filter(slug=catalog_slug).first()
    if catalog_slug == "monitor":
        if plan_product:
            plan_filter = models.Q(plan__product=plan_product) | models.Q(plan__product__isnull=True)
        else:
            plan_filter = models.Q(plan__product__isnull=True)
    else:
        plan_filter = models.Q(plan__product=plan_product) if plan_product else models.Q(plan__product__slug=catalog_slug)

    org_transfers = (
        PendingTransfer.objects
        .filter(organization_id__in=list(org_ids))
        .filter(plan_filter)
        .select_related("organization", "plan", "organization__owner", "user")
        .order_by("-updated_at", "-created_at")
    )

    transfer_rows = []
    for row in org_transfers:
        org = row.organization
        owner = org.owner if org else None
        transfer_rows.append({
            "sort_time": row.updated_at or row.created_at,
            "id": row.id,
            "organization": org.name if org else (row.org_display_name or "-"),
            "owner_name": (owner.get_full_name() if owner else "").strip(),
            "owner_email": owner.email if owner else "",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle,
            "plan": row.plan.name if row.plan else "-",
            "amount": float(_money(row.amount)),
            "currency": row.currency,
            "status": row.status,
            "paid_on": _format_date(row.paid_on),
            "reference_no": row.reference_no or "",
            "notes": row.notes or "",
            "created_at": _format_datetime(row.created_at),
            "updated_at": _format_datetime(row.updated_at),
            "receipt_url": row.receipt.url if row.receipt else "",
            "invoice_available": row.status == "approved",
            "invoice_url": f"/api/dashboard/billing/invoice/{row.id}" if row.status == "approved" else "",
        })
    transfer_rows.sort(key=lambda item: item["sort_time"] or timezone.now(), reverse=True)
    transfer_payload = [{key: value for key, value in row.items() if key != "sort_time"} for row in transfer_rows]

    history_rows = (
        SubscriptionHistory.objects
        .filter(organization_id__in=list(org_ids))
        .filter(plan_filter)
        .select_related("organization", "plan", "user")
        .order_by("-created_at")
    )
    history_payload = []
    for row in history_rows:
        org = row.organization
        user = row.user
        history_payload.append({
            "id": row.id,
            "organization": org.name if org else (row.org_display_name or "-"),
            "plan": row.plan.name if row.plan else "-",
            "status": row.status,
            "billing_cycle": row.billing_cycle,
            "start_date": _format_datetime(row.start_date),
            "end_date": _format_datetime(row.end_date),
            "created_at": _format_datetime(row.created_at),
            "user_name": user.get_full_name() if user else "",
            "user_email": user.email if user else "",
        })
    if product_slug == "storage":
        existing_orgs = {row["organization"] for row in history_payload if row.get("organization")}
        storage_subs = (
            StorageOrgSubscription.objects
            .filter(organization_id__in=list(org_ids))
            .select_related("organization", "plan", "organization__owner")
            .order_by("-created_at")
        )
        for sub in storage_subs:
            org = sub.organization
            org_name = org.name if org else "-"
            if org_name in existing_orgs:
                continue
            owner = org.owner if org else None
            history_payload.append({
                "id": f"storage-{sub.id}",
                "organization": org_name,
                "plan": sub.plan.name if sub.plan else "-",
                "status": sub.status,
                "billing_cycle": "monthly",
                "start_date": _format_datetime(sub.created_at),
                "end_date": _format_datetime(sub.renewal_date),
                "created_at": _format_datetime(sub.created_at),
                "user_name": owner.get_full_name() if owner else "",
                "user_email": owner.email if owner else "",
            })

    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "transfers": transfer_payload,
        "subscriptions": history_payload,
    })


@login_required
@require_http_methods(["GET"])
def billing_history(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    org_transfers = (
        PendingTransfer.objects
        .select_related("organization", "plan", "plan__product", "organization__owner", "user")
        .order_by("-updated_at", "-created_at")
    )
    dealer_transfers = (
        PendingTransfer.objects
        .filter(request_type="dealer")
        .select_related("user")
        .order_by("-updated_at", "-created_at")
    )

    transfer_rows = []
    for row in org_transfers:
        org = row.organization
        owner = org.owner if org else None
        product = row.plan.product if row.plan and row.plan.product else None
        transfer_rows.append({
            "sort_time": row.updated_at or row.created_at,
            "id": row.id,
            "organization": org.name if org else (row.org_display_name or "-"),
            "owner_name": (owner.get_full_name() if owner else "").strip(),
            "owner_email": owner.email if owner else "",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle,
            "plan": row.plan.name if row.plan else "-",
            "product": product.name if product else "-",
            "product_slug": product.slug if product else "",
            "amount": float(_money(row.amount)),
            "currency": row.currency,
            "status": row.status,
            "paid_on": _format_date(row.paid_on),
            "reference_no": row.reference_no or "",
            "notes": row.notes or "",
            "created_at": _format_datetime(row.created_at),
            "updated_at": _format_datetime(row.updated_at),
            "receipt_url": row.receipt.url if row.receipt else "",
            "invoice_available": row.status == "approved",
            "invoice_url": f"/api/dashboard/billing/invoice/{row.id}" if row.status == "approved" else "",
        })
    for row in dealer_transfers:
        transfer_rows.append({
            "sort_time": row.updated_at or row.created_at,
            "id": row.id,
            "organization": row.user.username if row.user else "-",
            "owner_name": "",
            "owner_email": row.user.email if row.user else "",
            "request_type": row.request_type,
            "billing_cycle": row.billing_cycle or "yearly",
            "plan": "Dealer Subscription",
            "product": "-",
            "product_slug": "",
            "amount": float(_money(row.amount)),
            "currency": row.currency or "INR",
            "status": row.status,
            "paid_on": _format_date(row.paid_on),
            "reference_no": row.reference_no or "",
            "notes": row.notes or "",
            "created_at": _format_datetime(row.created_at),
            "updated_at": _format_datetime(row.updated_at),
            "receipt_url": row.receipt.url if row.receipt else "",
            "invoice_available": row.status == "approved",
            "invoice_url": f"/api/dashboard/billing/invoice/{row.id}" if row.status == "approved" else "",
        })

    transfer_rows.sort(key=lambda item: item["sort_time"] or timezone.now(), reverse=True)
    transfer_payload = [{key: value for key, value in row.items() if key != "sort_time"} for row in transfer_rows]

    history_rows = (
        SubscriptionHistory.objects
        .select_related("organization", "plan", "plan__product", "user")
        .order_by("-created_at")
    )
    history_payload = []
    for row in history_rows:
        org = row.organization
        user = row.user
        product = row.plan.product if row.plan and row.plan.product else None
        history_payload.append({
            "id": row.id,
            "organization": org.name if org else (row.org_display_name or "-"),
            "plan": row.plan.name if row.plan else "-",
            "product": product.name if product else "-",
            "product_slug": product.slug if product else "",
            "status": row.status,
            "billing_cycle": row.billing_cycle,
            "start_date": _format_datetime(row.start_date),
            "end_date": _format_datetime(row.end_date),
            "created_at": _format_datetime(row.created_at),
            "user_name": user.get_full_name() if user else "",
            "user_email": user.email if user else "",
        })

    available_dates = (
        PendingTransfer.objects
        .filter(status="approved", organization__isnull=False, paid_on__isnull=False)
        .values_list("paid_on", flat=True)
    )
    months = sorted({value.strftime("%Y-%m") for value in available_dates})

    return JsonResponse({
        "transfers": transfer_payload,
        "subscriptions": history_payload,
        "available_months": months,
    })


@login_required
@require_http_methods(["GET"])
def billing_gst_archive(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    from_value = (request.GET.get("from") or "").strip()
    to_value = (request.GET.get("to") or "").strip()

    def parse_month(value):
        try:
            year_str, month_str = value.split("-", 1)
            year = int(year_str)
            month = int(month_str)
            if month < 1 or month > 12:
                return None
            return date(year, month, 1)
        except (ValueError, TypeError):
            return None

    from_month = parse_month(from_value)
    to_month = parse_month(to_value)
    if not from_month or not to_month:
        return JsonResponse({"error": "invalid_month"}, status=400)

    if from_month > to_month:
        from_month, to_month = to_month, from_month

    last_day = calendar.monthrange(to_month.year, to_month.month)[1]
    end_date = date(to_month.year, to_month.month, last_day)
    start_date = from_month

    transfers = (
        PendingTransfer.objects
        .filter(
            status="approved",
            organization__isnull=False,
            paid_on__gte=start_date,
            paid_on__lte=end_date,
        )
        .select_related("organization", "plan", "organization__owner")
        .order_by("paid_on", "id")
    )

    if not transfers.exists():
        return JsonResponse({"error": "no_invoices"}, status=404)

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for transfer in transfers:
            org = transfer.organization
            billing_profile = BillingProfile.objects.filter(organization=org).first()
            if not billing_profile:
                billing_profile = SimpleNamespace(
                    contact_name=org.name if org else "-",
                    company_name=org.name if org else "-",
                    address_line1="-",
                    address_line2="",
                    city="-",
                    state="",
                    postal_code="-",
                    country="India",
                    email=org.owner.email if org and org.owner else "",
                    gstin="",
                )
            pdf_bytes = _render_invoice_pdf_bytes(transfer, billing_profile)
            invoice_number = _build_invoice_number(transfer)
            filename = f"invoice-{invoice_number}.pdf"
            archive.writestr(filename, pdf_bytes)

    zip_buffer.seek(0)
    response = HttpResponse(zip_buffer.read(), content_type="application/zip")
    response["Content-Disposition"] = (
        f'attachment; filename="gst-bills-{from_month.strftime("%Y-%m")}-to-{to_month.strftime("%Y-%m")}.zip"'
    )
    return response


@login_required
@require_http_methods(["GET"])
def product_renewals(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    now = timezone.now()
    monthly_window = getattr(settings, "RENEW_WINDOW_DAYS_MONTHLY", 7)
    yearly_window = getattr(settings, "RENEW_WINDOW_DAYS_YEARLY", 15)

    subscriptions = (
        Subscription.objects
        .filter(organization_id__in=list(org_ids))
        .select_related("organization", "plan", "organization__owner")
        .order_by("organization_id", "-start_date")
    )
    latest_by_org = {}
    for sub in subscriptions:
        if sub.organization_id not in latest_by_org:
            latest_by_org[sub.organization_id] = sub

    upcoming = []
    missed = []
    for sub in latest_by_org.values():
        end_date = sub.end_date
        if not end_date:
            continue
        cycle = sub.billing_cycle or "monthly"
        renew_window = yearly_window if cycle == "yearly" else monthly_window
        delta_days = math.ceil((end_date - now).total_seconds() / 86400)
        org = sub.organization
        owner = org.owner if org else None
        row = {
            "organization": org.name if org else "-",
            "owner_name": (owner.get_full_name() if owner else "").strip(),
            "owner_email": owner.email if owner else "",
            "plan": sub.plan.name if sub.plan else "-",
            "billing_cycle": cycle,
            "end_date": _format_date(end_date),
            "status": sub.status or "",
            "days_remaining": max(delta_days, 0),
        }
        if end_date < now or sub.status == "expired":
            row["days_overdue"] = abs(delta_days)
            missed.append(row)
        elif delta_days <= renew_window:
            upcoming.append(row)

    deleted = [
        {
            "id": row.id,
            "organization_name": row.organization_name,
            "owner_username": row.owner_username,
            "owner_email": row.owner_email or "",
            "deleted_at": _format_datetime(row.deleted_at),
            "reason": row.reason or "This account not renewed after expired.",
        }
        for row in DeletedAccount.objects.filter(reason__icontains="expired").order_by("-deleted_at")[:200]
    ]

    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "upcoming": upcoming,
        "missed": missed,
        "deleted": deleted,
    })


@login_required
@require_http_methods(["GET"])
def product_referrals(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    org_ids_list = list(org_ids)
    billing_profiles = (
        BillingProfile.objects
        .filter(organization_id__in=org_ids_list)
    )
    billing_map = {row.organization_id: row for row in billing_profiles}

    org_earnings = (
        ReferralEarning.objects
        .select_related("referrer_org", "referred_org", "transfer")
        .filter(referrer_org_id__in=org_ids_list)
        .order_by("-created_at")
    )
    org_payload = []
    for row in org_earnings:
        profile = billing_map.get(row.referrer_org_id)
        org_payload.append({
            "id": row.id,
            "referrer_org": row.referrer_org.name if row.referrer_org else "",
            "referred_org": row.referred_org.name if row.referred_org else "",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": _format_date(row.payout_date),
            "created_at": _format_datetime(row.created_at),
            "bank_details": {
                "contact_name": profile.contact_name if profile else "",
                "company_name": profile.company_name if profile else "",
                "email": profile.email if profile else "",
                "phone": profile.phone if profile else "",
                "address_line1": profile.address_line1 if profile else "",
                "address_line2": profile.address_line2 if profile else "",
                "city": profile.city if profile else "",
                "state": profile.state if profile else "",
                "postal_code": profile.postal_code if profile else "",
                "country": profile.country if profile else "",
                "gstin": profile.gstin if profile else "",
            },
        })

    dealer_earnings = (
        DealerReferralEarning.objects
        .select_related("referrer_dealer__user", "referred_org", "referred_dealer__user", "transfer")
        .order_by("-created_at")
    )
    dealer_payload = []
    for row in dealer_earnings:
        dealer = row.referrer_dealer
        dealer_payload.append({
            "id": row.id,
            "referrer_dealer": dealer.user.username if dealer and dealer.user else "",
            "referred_org": row.referred_org.name if row.referred_org else "",
            "referred_dealer": row.referred_dealer.user.username if row.referred_dealer else "",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "flat_amount": float(_money(row.flat_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": _format_date(row.payout_date),
            "created_at": _format_datetime(row.created_at),
            "bank_details": {
                "name": dealer.user.first_name if dealer and dealer.user else "",
                "email": dealer.user.email if dealer and dealer.user else "",
                "bank_name": dealer.bank_name if dealer else "",
                "bank_account_number": dealer.bank_account_number if dealer else "",
                "bank_ifsc": dealer.bank_ifsc if dealer else "",
                "upi_id": dealer.upi_id if dealer else "",
                "address_line1": dealer.address_line1 if dealer else "",
                "address_line2": dealer.address_line2 if dealer else "",
                "city": dealer.city if dealer else "",
                "state": dealer.state if dealer else "",
                "postal_code": dealer.postal_code if dealer else "",
            },
        })

    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "org_referrals": org_payload,
        "dealer_referrals": dealer_payload,
    })


def _format_duration_compact(seconds):
    seconds = int(max(0, seconds or 0))
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


@login_required
@require_http_methods(["GET"])
def product_support_access(request, slug):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product, org_ids = _get_product_org_ids(slug)
    if not product:
        return JsonResponse({"error": "product_not_found"}, status=404)

    now = timezone.now()
    privacy_settings = (
        CompanyPrivacySettings.objects
        .select_related("organization", "organization__owner")
        .filter(
            organization_id__in=list(org_ids),
            monitoring_mode="privacy_lock",
            support_access_enabled_until__gt=now,
        )
    )
    rows = []
    for setting in privacy_settings:
        org = setting.organization
        owner = org.owner
        admin_name = "-"
        admin_email = ""
        if owner:
            admin_name = owner.get_full_name() or owner.username
            admin_email = owner.email or ""
        approved_seconds = None
        if setting.support_access_duration_hours:
            approved_seconds = setting.support_access_duration_hours * 3600
        elif setting.support_access_enabled_until and setting.updated_at:
            approved_seconds = (setting.support_access_enabled_until - setting.updated_at).total_seconds()
        rows.append({
            "org_id": org.id,
            "organization": org.name,
            "admin_name": admin_name,
            "admin_email": admin_email,
            "monitoring_mode": setting.get_monitoring_mode_display(),
            "support_access_until": _format_datetime(setting.support_access_enabled_until),
            "approved_duration": _format_duration_compact(approved_seconds) if approved_seconds else "-",
        })
    rows.sort(key=lambda item: item["organization"].lower())

    return JsonResponse({
        "product": {"id": product.id, "name": product.name, "slug": product.slug},
        "rows": rows,
    })


@login_required
@require_http_methods(["GET"])
def referrals_summary(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    settings_obj = ReferralSettings.get_active()
    org_earnings = (
        ReferralEarning.objects
        .select_related("referrer_org", "referred_org", "transfer")
        .order_by("-created_at")
    )
    org_payload = [
        {
            "id": row.id,
            "referrer_org": row.referrer_org.name if row.referrer_org else "-",
            "referred_org": row.referred_org.name if row.referred_org else "-",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": _format_date(row.payout_date),
            "created_at": _format_datetime(row.created_at),
        }
        for row in org_earnings
    ]
    dealer_earnings = (
        DealerReferralEarning.objects
        .select_related("referrer_dealer", "referred_org", "referred_dealer", "transfer")
        .order_by("-created_at")
    )
    dealer_payload = [
        {
            "id": row.id,
            "referrer_dealer": row.referrer_dealer.user.username if row.referrer_dealer else "-",
            "referred_org": row.referred_org.name if row.referred_org else "",
            "referred_dealer": row.referred_dealer.user.username if row.referred_dealer else "",
            "transfer_id": row.transfer_id,
            "base_amount": float(_money(row.base_amount)),
            "commission_rate": float(row.commission_rate or 0),
            "commission_amount": float(_money(row.commission_amount)),
            "flat_amount": float(_money(row.flat_amount)),
            "status": row.status,
            "payout_reference": row.payout_reference or "",
            "payout_date": _format_date(row.payout_date),
            "created_at": _format_datetime(row.created_at),
        }
        for row in dealer_earnings
    ]
    dealers = (
        DealerAccount.objects
        .select_related("user", "referred_by")
        .order_by("user__username")
    )
    dealers_payload = [
        {
            "id": dealer.id,
            "username": dealer.user.username,
            "email": dealer.user.email or "",
            "referral_code": dealer.referral_code or "",
            "referred_by": dealer.referred_by.user.username if dealer.referred_by else "",
            "subscription_status": dealer.subscription_status,
            "subscription_start": _format_datetime(dealer.subscription_start),
            "subscription_end": _format_datetime(dealer.subscription_end),
            "subscription_amount": float(_money(dealer.subscription_amount)),
        }
        for dealer in dealers
    ]
    return JsonResponse({
        "settings": {
            "commission_rate": float(settings_obj.commission_rate or 0),
            "dealer_commission_rate": float(settings_obj.dealer_commission_rate or 0),
            "dealer_subscription_amount": float(settings_obj.dealer_subscription_amount or 0),
            "dealer_referral_flat_amount": float(settings_obj.dealer_referral_flat_amount or 0),
            "updated_at": _format_datetime(settings_obj.updated_at),
        },
        "org_earnings": org_payload,
        "dealer_earnings": dealer_payload,
        "dealers": dealers_payload,
    })


@login_required
@require_http_methods(["POST"])
def referrals_update_settings(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    settings_obj = ReferralSettings.get_active()
    def parse_decimal(key, default_value):
        try:
            value = Decimal(str(payload.get(key, default_value)))
        except (TypeError, ValueError):
            value = Decimal(str(default_value))
        if value < 0:
            value = Decimal("0")
        return value

    settings_obj.commission_rate = parse_decimal("commission_rate", settings_obj.commission_rate or 0)
    settings_obj.dealer_commission_rate = parse_decimal("dealer_commission_rate", settings_obj.dealer_commission_rate or 0)
    settings_obj.dealer_subscription_amount = parse_decimal(
        "dealer_subscription_amount",
        settings_obj.dealer_subscription_amount or 0,
    )
    settings_obj.dealer_referral_flat_amount = parse_decimal(
        "dealer_referral_flat_amount",
        settings_obj.dealer_referral_flat_amount or 0,
    )
    settings_obj.save(update_fields=[
        "commission_rate",
        "dealer_commission_rate",
        "dealer_subscription_amount",
        "dealer_referral_flat_amount",
        "updated_at",
    ])
    return JsonResponse({
        "commission_rate": float(settings_obj.commission_rate or 0),
        "dealer_commission_rate": float(settings_obj.dealer_commission_rate or 0),
        "dealer_subscription_amount": float(settings_obj.dealer_subscription_amount or 0),
        "dealer_referral_flat_amount": float(settings_obj.dealer_referral_flat_amount or 0),
        "updated_at": _format_datetime(settings_obj.updated_at),
    })


@login_required
@require_http_methods(["POST"])
def referrals_update_dealer(request, dealer_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    dealer = get_object_or_404(DealerAccount, id=dealer_id)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    status = (payload.get("subscription_status") or dealer.subscription_status).strip().lower()
    if status not in ("pending", "active", "expired"):
        status = dealer.subscription_status
    subscription_start = _parse_datetime(payload.get("subscription_start")) or dealer.subscription_start
    subscription_end = _parse_datetime(payload.get("subscription_end")) or dealer.subscription_end
    try:
        amount = Decimal(str(payload.get("subscription_amount", dealer.subscription_amount or 0)))
    except (TypeError, ValueError):
        amount = dealer.subscription_amount or 0

    previous_status = dealer.subscription_status
    dealer.subscription_status = status
    dealer.subscription_start = subscription_start
    dealer.subscription_end = subscription_end
    dealer.subscription_amount = amount
    dealer.save(update_fields=[
        "subscription_status",
        "subscription_start",
        "subscription_end",
        "subscription_amount",
    ])
    if dealer.subscription_status == "active" and previous_status != "active":
        record_dealer_referral_flat_earning(dealer)

    return JsonResponse({
        "updated": True,
        "subscription_status": dealer.subscription_status,
        "subscription_start": _format_datetime(dealer.subscription_start),
        "subscription_end": _format_datetime(dealer.subscription_end),
        "subscription_amount": float(_money(dealer.subscription_amount)),
    })


@login_required
@require_http_methods(["POST"])
def referrals_update_dealer_payout(request, earning_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    earning = get_object_or_404(DealerReferralEarning, id=earning_id)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    status = (payload.get("status") or earning.status or "pending").strip().lower()
    if status not in ("pending", "paid", "rejected"):
        status = earning.status
    payout_reference = (payload.get("payout_reference") or "").strip()
    payout_date = parse_date((payload.get("payout_date") or "").strip())

    earning.status = status
    earning.payout_reference = payout_reference
    earning.payout_date = payout_date
    earning.save(update_fields=["status", "payout_reference", "payout_date", "updated_at"])
    return JsonResponse({
        "updated": True,
        "status": earning.status,
        "payout_reference": earning.payout_reference,
        "payout_date": _format_date(earning.payout_date),
    })


@login_required
@require_http_methods(["POST"])
def referrals_update_payout(request, earning_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    earning = get_object_or_404(ReferralEarning, id=earning_id)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    status = (payload.get("status") or earning.status or "pending").strip().lower()
    if status not in ("pending", "paid", "rejected"):
        status = earning.status
    payout_reference = (payload.get("payout_reference") or "").strip()
    payout_date = parse_date((payload.get("payout_date") or "").strip())

    earning.status = status
    earning.payout_reference = payout_reference
    earning.payout_date = payout_date
    earning.save(update_fields=["status", "payout_reference", "payout_date", "updated_at"])
    return JsonResponse({
        "updated": True,
        "status": earning.status,
        "payout_reference": earning.payout_reference,
        "payout_date": _format_date(earning.payout_date),
    })


@login_required
@require_http_methods(["GET"])
def observability_summary(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    days = request.GET.get("days") or 7
    org_id = request.GET.get("org_id") or None
    product = request.GET.get("product") or None

    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7

    try:
        org_id = int(org_id) if org_id else None
    except (TypeError, ValueError):
        org_id = None
    if product is not None:
        product = product.strip() or None

    payload = build_observability_summary(
        days=days,
        org_id=org_id,
        product_slug=product,
    )
    return JsonResponse(payload)


@login_required
@require_http_methods(["GET"])
def ai_chatbot_usage_summary(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    days = request.GET.get("days") or 7
    org_id = request.GET.get("org_id") or None
    period = request.GET.get("period") or None
    year = request.GET.get("year") or None
    month = request.GET.get("month") or None

    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 60))

    try:
        org_id = int(org_id) if org_id else None
    except (TypeError, ValueError):
        org_id = None

    if year and month:
        try:
            period = f"{int(year):04d}{int(month):02d}"
        except (TypeError, ValueError):
            period = None
    period = (period or timezone.now().strftime("%Y%m")).strip()
    usd_to_inr = getattr(settings, "USD_TO_INR_RATE", 85)

    usage_qs = AiUsageMonthly.objects.filter(product_slug="ai-chatbot", period_yyyymm=period)
    if org_id:
        usage_qs = usage_qs.filter(organization_id=org_id)

    ai_replies_limit = 0
    if org_id:
        subs = (
            Subscription.objects
            .filter(organization_id=org_id)
            .select_related("plan", "plan__product")
            .order_by("-start_date")
        )
        active_sub = next((sub for sub in subs if is_subscription_active(sub, now=timezone.now())), None)
        if active_sub and active_sub.plan:
            product = active_sub.plan.product
            slug = product.slug if product else "monitor"
            if slug == "ai-chatbot":
                limits = active_sub.plan.limits or {}
                ai_replies_limit = int(limits.get("ai_replies_per_month") or 0)

    totals_row = usage_qs.aggregate(
        ai_replies_used=Sum("ai_replies_used"),
        tokens_total=Sum("tokens_total"),
        cost_usd_total=Sum("cost_usd_total"),
        cost_inr_total=Sum("cost_inr_total"),
        request_count=Sum("request_count"),
    )
    totals_ai = int(totals_row.get("ai_replies_used") or 0)
    totals_tokens = int(totals_row.get("tokens_total") or 0)
    totals_cost_usd = float(totals_row.get("cost_usd_total") or 0)
    totals_cost_inr = float(totals_row.get("cost_inr_total") or 0) or round(totals_cost_usd * float(usd_to_inr), 2)
    orgs_active = usage_qs.values("organization_id").distinct().count()
    usage_percent = int((totals_ai / ai_replies_limit) * 100) if ai_replies_limit else 0

    top_rows = (
        usage_qs
        .select_related("organization")
        .order_by("-ai_replies_used")[:10]
    )
    top_orgs = [
        {
            "org_id": row.organization_id,
            "org_name": row.organization.name if row.organization else "",
            "ai_replies_used": row.ai_replies_used,
            "tokens_total": row.tokens_total,
            "cost_usd_total": float(row.cost_usd_total or 0),
            "cost_inr_est": float(row.cost_inr_total or 0) or round(float(row.cost_usd_total or 0) * float(usd_to_inr), 2),
        }
        for row in top_rows
    ]

    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days - 1)
    message_qs = ChatMessage.objects.filter(
        sender_type="bot",
        ai_model__isnull=False,
        created_at__date__gte=start_date,
        created_at__date__lte=end_date,
    )
    if org_id:
        message_qs = message_qs.filter(conversation__organization_id=org_id)
    daily_rows = (
        message_qs
        .annotate(day=models.functions.TruncDate("created_at"))
        .values("day")
        .annotate(
            ai_replies=models.Count("id"),
            tokens_total=Sum("tokens_total"),
            cost_usd_total=Sum("cost_usd"),
        )
    )
    daily_by_day = {
        row["day"]: {
            "ai_replies": int(row.get("ai_replies") or 0),
            "tokens": int(row.get("tokens_total") or 0),
            "cost_usd": float(row.get("cost_usd_total") or 0),
        }
        for row in daily_rows
    }
    daily = []
    for offset in range(days):
        day = start_date + timedelta(days=offset)
        row = daily_by_day.get(day, {"ai_replies": 0, "tokens": 0, "cost_usd": 0})
        daily.append({
            "date": day.isoformat(),
            "ai_replies": row["ai_replies"],
            "tokens": row["tokens"],
            "cost_usd": row["cost_usd"],
            "cost_inr_est": round(row["cost_usd"] * float(usd_to_inr), 2),
        })

    alerts = []
    if totals_cost_inr >= 2000:
        alerts.append({"level": "warning", "message": f"High AI spend this month: INR {totals_cost_inr}"})
    if ai_replies_limit:
        if totals_ai >= ai_replies_limit:
            alerts.append({"level": "danger", "message": "AI usage limit reached. Upgrade plan to continue."})
        elif usage_percent >= 80:
            alerts.append({"level": "warning", "message": "AI usage is above 80% for this org."})

    return JsonResponse({
        "period": period,
        "totals": {
            "orgs_active": orgs_active,
            "ai_replies_used": totals_ai,
            "ai_replies_limit": ai_replies_limit,
            "usage_percent": usage_percent,
            "tokens_total": totals_tokens,
            "cost_usd_total": totals_cost_usd,
            "cost_inr_est": totals_cost_inr,
        },
        "top_orgs": top_orgs,
        "daily": daily,
        "alerts": alerts,
    })


@login_required
@require_http_methods(["GET"])
def ai_chatbot_usage_trend(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    org_id = request.GET.get("org_id") or None
    months = request.GET.get("months") or 6
    try:
        org_id = int(org_id) if org_id else None
    except (TypeError, ValueError):
        org_id = None
    if not org_id:
        return JsonResponse({"detail": "org_id_required"}, status=400)
    try:
        months = int(months)
    except (TypeError, ValueError):
        months = 6
    months = max(1, min(months, 24))

    usd_to_inr = getattr(settings, "USD_TO_INR_RATE", 85)
    today = timezone.now().date().replace(day=1)
    periods = []
    year = today.year
    month = today.month
    for _ in range(months):
        periods.append((year, month, f"{year:04d}{month:02d}"))
        month -= 1
        if month <= 0:
            month = 12
            year -= 1
    period_keys = [item[2] for item in periods]

    rows = (
        AiUsageMonthly.objects
        .filter(organization_id=org_id, product_slug="ai-chatbot", period_yyyymm__in=period_keys)
        .values("period_yyyymm", "ai_replies_used", "tokens_total", "cost_usd_total", "cost_inr_total")
    )
    by_period = {
        row["period_yyyymm"]: row
        for row in rows
    }
    trend = []
    for year, month, period_key in periods:
        row = by_period.get(period_key, {})
        cost_inr = row.get("cost_inr_total") or (float(row.get("cost_usd_total") or 0) * float(usd_to_inr))
        trend.append({
            "year": year,
            "month": month,
            "ai_replies_used": int(row.get("ai_replies_used") or 0),
            "total_tokens": int(row.get("tokens_total") or 0),
            "cost_inr": round(float(cost_inr or 0), 2),
        })
    return JsonResponse({
        "org_id": org_id,
        "months": months,
        "trend": trend,
    })


@login_required
@require_http_methods(["GET", "POST"])
def ai_chatbot_openai_settings(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    settings_obj = OpenAISettings.objects.filter(provider="openai").first()
    if request.method == "GET":
        return JsonResponse({
            "provider": "openai",
            "model": settings_obj.model if settings_obj else "gpt-4o-mini",
            "input_cost_per_1k_tokens_inr": float(settings_obj.input_cost_per_1k_tokens_inr) if settings_obj else 0,
            "output_cost_per_1k_tokens_inr": float(settings_obj.output_cost_per_1k_tokens_inr) if settings_obj else 0,
            "fixed_markup_percent": float(settings_obj.fixed_markup_percent) if settings_obj else 0,
            "is_active": bool(settings_obj.is_active) if settings_obj else True,
            "api_key_masked": _mask_api_key(settings_obj.api_key) if settings_obj else "",
            "updated_at": _format_datetime(settings_obj.updated_at) if settings_obj else "",
        })

    payload = json.loads(request.body.decode("utf-8") or "{}")
    api_key = str(payload.get("api_key", "") or "").strip()
    model = str(payload.get("model", "") or "gpt-4o-mini").strip()
    input_cost = payload.get("input_cost_per_1k_tokens_inr", 0)
    output_cost = payload.get("output_cost_per_1k_tokens_inr", 0)
    markup = payload.get("fixed_markup_percent", 0)
    is_active = bool(payload.get("is_active", True))
    try:
        input_cost = Decimal(str(input_cost or 0))
        output_cost = Decimal(str(output_cost or 0))
        markup = Decimal(str(markup or 0))
    except Exception:
        return JsonResponse({"detail": "invalid_cost"}, status=400)

    if not settings_obj:
        settings_obj = OpenAISettings(provider="openai")
    settings_obj.model = model or settings_obj.model
    settings_obj.input_cost_per_1k_tokens_inr = input_cost
    settings_obj.output_cost_per_1k_tokens_inr = output_cost
    settings_obj.fixed_markup_percent = markup
    settings_obj.is_active = is_active
    if api_key:
        settings_obj.api_key = api_key
    settings_obj.save()
    if is_active:
        OpenAISettings.objects.exclude(id=settings_obj.id).update(is_active=False)

    return JsonResponse({
        "provider": "openai",
        "model": settings_obj.model,
        "input_cost_per_1k_tokens_inr": float(settings_obj.input_cost_per_1k_tokens_inr),
        "output_cost_per_1k_tokens_inr": float(settings_obj.output_cost_per_1k_tokens_inr),
        "fixed_markup_percent": float(settings_obj.fixed_markup_percent),
        "is_active": bool(settings_obj.is_active),
        "api_key_masked": _mask_api_key(settings_obj.api_key),
        "updated_at": _format_datetime(settings_obj.updated_at),
    })


@login_required
@require_http_methods(["GET", "PUT"])
def retention_policy_settings(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    policy = GlobalRetentionPolicy.get_solo()
    if request.method == "GET":
        return JsonResponse(_serialize_retention_policy(policy))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    serializer = GlobalRetentionPolicySerializer(data=payload)
    if not serializer.is_valid():
        return JsonResponse(serializer.errors, status=400)

    data = serializer.validated_data
    policy.grace_days = data["grace_days"]
    policy.archive_days = data["archive_days"]
    policy.hard_delete_days = data["hard_delete_days"]
    policy.save(update_fields=["grace_days", "archive_days", "hard_delete_days", "updated_at"])
    return JsonResponse(_serialize_retention_policy(policy))


def _mask_secret(value):
    value = value or ""
    if len(value) <= 4:
        return "****" if value else ""
    return f"{value[:2]}****{value[-2:]}"


def _serialize_media_storage_settings(settings_obj):
    return {
        "storage_mode": settings_obj.storage_mode,
        "endpoint_url": settings_obj.endpoint_url or "",
        "bucket_name": settings_obj.bucket_name or "",
        "access_key_id": settings_obj.access_key_id or "",
        "secret_access_key_masked": _mask_secret(settings_obj.secret_access_key),
        "has_secret_access_key": bool(settings_obj.secret_access_key),
        "region_name": settings_obj.region_name or "",
        "base_path": settings_obj.base_path or "",
        "updated_at": _format_datetime(settings_obj.updated_at),
    }


@login_required
@require_http_methods(["GET", "PUT"])
def media_storage_settings(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    settings_obj = GlobalMediaStorageSettings.get_solo()
    if request.method == "GET":
        return JsonResponse(_serialize_media_storage_settings(settings_obj))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    storage_mode = (payload.get("storage_mode") or "").strip().lower()
    if storage_mode not in ("local", "object"):
        return JsonResponse({"storage_mode": ["invalid_choice"]}, status=400)

    endpoint_url = (payload.get("endpoint_url") or "").strip()
    bucket_name = (payload.get("bucket_name") or "").strip()
    access_key_id = (payload.get("access_key_id") or "").strip()
    secret_access_key = (payload.get("secret_access_key") or "").strip()
    region_name = (payload.get("region_name") or "").strip()
    base_path = (payload.get("base_path") or "").strip()

    if storage_mode == "object":
        if not endpoint_url:
            return JsonResponse({"endpoint_url": ["required"]}, status=400)
        if not bucket_name:
            return JsonResponse({"bucket_name": ["required"]}, status=400)
        if not access_key_id and not settings_obj.access_key_id:
            return JsonResponse({"access_key_id": ["required"]}, status=400)
        if not secret_access_key and not settings_obj.secret_access_key:
            return JsonResponse({"secret_access_key": ["required"]}, status=400)

    settings_obj.storage_mode = storage_mode
    settings_obj.endpoint_url = endpoint_url
    settings_obj.bucket_name = bucket_name
    if access_key_id:
        settings_obj.access_key_id = access_key_id
    if secret_access_key:
        settings_obj.secret_access_key = secret_access_key
    settings_obj.region_name = region_name
    settings_obj.base_path = base_path
    settings_obj.save()

    return JsonResponse(_serialize_media_storage_settings(settings_obj))


@login_required
@require_http_methods(["GET", "POST"])
def storage_sync_settings(request):
    error = _require_saas_admin(request)
    if error:
        return error
    settings_obj = StorageGlobalSettings.get_solo()
    if request.method == "GET":
        return JsonResponse({
            "global_sync_enabled": settings_obj.sync_globally_enabled,
            "updated_at": _format_datetime(settings_obj.updated_at),
        })
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    value = payload.get("global_sync_enabled")
    if value is None:
        return JsonResponse({"global_sync_enabled": ["required"]}, status=400)
    settings_obj.sync_globally_enabled = bool(value)
    settings_obj.save(update_fields=["sync_globally_enabled", "updated_at"])
    return JsonResponse({
        "global_sync_enabled": settings_obj.sync_globally_enabled,
        "updated_at": _format_datetime(settings_obj.updated_at),
    })


@login_required
@require_http_methods(["GET"])
def storage_usage_summary(request):
    error = _require_saas_admin(request)
    if error:
        return error
    query = (request.GET.get("q") or "").strip()
    limit = int(request.GET.get("limit") or 50)
    limit = max(1, min(limit, 200))
    offset = int(request.GET.get("offset") or 0)
    org_qs = Organization.objects.select_related("owner")
    if query:
        org_qs = org_qs.filter(
            models.Q(name__icontains=query) |
            models.Q(owner__email__icontains=query) |
            models.Q(owner__username__icontains=query)
        )
    total = org_qs.count()
    orgs = list(org_qs.order_by("name")[offset:offset + limit])
    org_ids = [org.id for org in orgs]

    usage_rows = (
        StorageFile.objects
        .filter(organization_id__in=org_ids)
        .values("organization_id")
        .annotate(total=Sum("size_bytes"))
    )
    usage_map = {row["organization_id"]: int(row["total"] or 0) for row in usage_rows}

    storage_subs = (
        StorageOrgSubscription.objects
        .filter(organization_id__in=org_ids)
        .select_related("plan", "product")
        .order_by("-updated_at")
    )
    sub_map = {}
    for sub in storage_subs:
        if sub.organization_id not in sub_map:
            sub_map[sub.organization_id] = sub

    addons_rows = (
        StorageOrgAddOn.objects
        .filter(organization_id__in=org_ids)
        .values("organization_id")
        .annotate(
            total_qty=Sum("quantity"),
            total_gb=Sum(
                models.ExpressionWrapper(
                    models.F("quantity") * models.F("addon__storage_gb"),
                    output_field=models.IntegerField(),
                )
            ),
        )
    )
    addon_qty_map = {row["organization_id"]: int(row["total_qty"] or 0) for row in addons_rows}
    addon_gb_map = {row["organization_id"]: int(row["total_gb"] or 0) for row in addons_rows}

    rows = []
    for org in orgs:
        sub = sub_map.get(org.id)
        plan = sub.plan if sub else None
        plan_storage_gb = get_plan_storage_gb(plan)
        addon_slots = addon_qty_map.get(org.id, 0)
        addon_storage_gb = addon_gb_map.get(org.id, 0)
        total_storage_gb = plan_storage_gb + addon_storage_gb
        limit_bytes = storage_gb_to_bytes(total_storage_gb)
        used_bytes = usage_map.get(org.id, 0)
        remaining_bytes = max(0, limit_bytes - used_bytes) if limit_bytes else 0
        usage_percent = int((used_bytes / limit_bytes) * 100) if limit_bytes else 0
        rows.append({
            "org_id": org.id,
            "org_name": org.name,
            "owner_email": org.owner.email if org.owner else "",
            "subscription": _serialize_storage_subscription(sub) if sub else None,
            "plan_storage_gb": plan_storage_gb,
            "addon_slots": addon_slots,
            "total_storage_gb": total_storage_gb,
            "used_bytes": used_bytes,
            "limit_bytes": limit_bytes,
            "remaining_bytes": remaining_bytes,
            "usage_percent": usage_percent,
        })

    return JsonResponse({
        "items": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    })


@login_required
@require_http_methods(["POST"])
def storage_product_upsert(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        product = storage_admin_services.upsert_product(
            product_id=payload.get("id"),
            name=(payload.get("name") or "").strip(),
            is_active=payload.get("is_active", True),
            description=payload.get("description") or "",
        )
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({
        "id": product.id,
        "name": product.name,
        "is_active": product.is_active,
        "description": product.description,
    })


@login_required
@require_http_methods(["GET", "POST"])
def storage_plan_upsert(request):
    error = _require_saas_admin(request)
    if error:
        return error
    if request.method == "GET":
        product_id = request.GET.get("product_id")
        plans = StoragePlan.objects.all()
        if product_id:
            plans = plans.filter(product_id=product_id)
        plans = plans.order_by("name")
        return JsonResponse({
            "plans": [
                {
                    "id": plan.id,
                    "product_id": plan.product_id,
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
                    "device_limit_per_user": plan.device_limit_per_user,
                    "storage_limit_gb": plan.storage_limit_gb,
                    "bandwidth_limit_gb_monthly": plan.bandwidth_limit_gb_monthly,
                    "is_bandwidth_limited": plan.is_bandwidth_limited,
                    "is_active": plan.is_active,
                    "currency": "INR",
                }
                for plan in plans
            ]
        })
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        product_id = payload.get("product_id")
        if not product_id:
            storage_product = StorageProduct.objects.filter(name__iexact="Online Storage").first()
            if storage_product:
                product_id = storage_product.id
        plan = storage_admin_services.upsert_plan(
            plan_id=payload.get("id"),
            product=product_id,
            name=(payload.get("name") or "").strip(),
            monthly_price=payload.get("monthly_price") or 0,
            yearly_price=payload.get("yearly_price") or 0,
            usd_monthly_price=payload.get("usd_monthly_price") or 0,
            usd_yearly_price=payload.get("usd_yearly_price") or 0,
            monthly_price_inr=payload.get("monthly_price_inr") or 0,
            yearly_price_inr=payload.get("yearly_price_inr") or 0,
            monthly_price_usd=payload.get("monthly_price_usd") or 0,
            yearly_price_usd=payload.get("yearly_price_usd") or 0,
            max_users=payload.get("max_users"),
            device_limit_per_user=payload.get("device_limit_per_user") or 1,
            storage_limit_gb=payload.get("storage_limit_gb") or 0,
            bandwidth_limit_gb_monthly=payload.get("bandwidth_limit_gb_monthly") or 0,
            is_bandwidth_limited=payload.get("is_bandwidth_limited", True),
            is_active=payload.get("is_active", True),
        )
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({
        "id": plan.id,
        "product_id": plan.product_id,
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
        "device_limit_per_user": plan.device_limit_per_user,
        "storage_limit_gb": plan.storage_limit_gb,
        "bandwidth_limit_gb_monthly": plan.bandwidth_limit_gb_monthly,
        "is_bandwidth_limited": plan.is_bandwidth_limited,
        "is_active": plan.is_active,
        "currency": "INR",
    })


@login_required
@require_http_methods(["POST"])
def storage_addon_upsert(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        addon = storage_admin_services.upsert_addon(
            addon_id=payload.get("id"),
            product=payload.get("product_id"),
            name=(payload.get("name") or "").strip(),
            storage_gb=payload.get("storage_gb") or 0,
            price_monthly=payload.get("price_monthly") or 0,
            stackable=payload.get("stackable", True),
            is_active=payload.get("is_active", True),
        )
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({
        "id": addon.id,
        "product_id": addon.product_id,
        "name": addon.name,
        "storage_gb": addon.storage_gb,
        "price_monthly": float(addon.price_monthly or 0),
        "stackable": addon.stackable,
        "is_active": addon.is_active,
    })


@login_required
@require_http_methods(["POST"])
def storage_assign_plan(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        sub = storage_admin_services.assign_plan_to_org(
            org=payload.get("org_id"),
            product=payload.get("product_id"),
            plan=payload.get("plan_id"),
            status=(payload.get("status") or "active").strip().lower(),
            renewal_date=parse_date(payload.get("renewal_date") or ""),
        )
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({
        "id": sub.id,
        "org_id": sub.organization_id,
        "product_id": sub.product_id,
        "plan_id": sub.plan_id,
        "status": sub.status,
        "renewal_date": _format_date(sub.renewal_date),
    })


@login_required
@require_http_methods(["POST"])
def storage_org_addon_quantity(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    try:
        row = storage_admin_services.set_org_addon_quantity(
            org=payload.get("org_id"),
            addon=payload.get("addon_id"),
            quantity=payload.get("quantity"),
        )
    except ValueError as exc:
        return JsonResponse({"detail": str(exc)}, status=400)
    return JsonResponse({
        "id": row.id,
        "org_id": row.organization_id,
        "addon_id": row.addon_id,
        "quantity": row.quantity,
    })


@login_required
@require_http_methods(["POST"])
def storage_usage_rebuild(request):
    error = _require_saas_admin(request)
    if error:
        return error
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    org_id = payload.get("org_id")
    if org_id:
        org = Organization.objects.filter(id=org_id).first()
        if not org:
            return JsonResponse({"detail": "org_not_found"}, status=404)
        usage = rebuild_usage(org)
        return JsonResponse({
            "org_id": org.id,
            "used_storage_bytes": int(usage.used_storage_bytes or 0),
            "last_calculated_at": _format_datetime(usage.last_calculated_at),
        })
    rows = rebuild_all_usage()
    return JsonResponse({
        "recalculated": len(rows),
    })


def _iter_local_media_files(local_root):
    if not local_root or not os.path.exists(local_root):
        return
    for root, _, files in os.walk(local_root):
        for filename in files:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, local_root)
            rel_path = rel_path.replace(os.sep, "/")
            yield full_path, rel_path


def _ensure_object_storage_ready():
    settings_obj = GlobalMediaStorageSettings.get_solo()
    if settings_obj.storage_mode != "object" or not settings_obj.is_object_configured():
        return None, JsonResponse({"detail": "object_storage_not_configured"}, status=400)
    try:
        from apps.backend.core_platform import storage as storage_utils
    except Exception:
        return None, JsonResponse({"detail": "object_storage_unavailable"}, status=500)
    dest_storage = storage_utils._build_object_storage(settings_obj)
    if not dest_storage:
        return None, JsonResponse({"detail": "object_storage_unavailable"}, status=500)
    return dest_storage, None


@login_required
@require_http_methods(["POST"])
def media_storage_pull_preview(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    dest_storage, error = _ensure_object_storage_ready()
    if error:
        return error

    local_root = str(getattr(settings, "MEDIA_ROOT", "") or "")
    if not local_root or not os.path.exists(local_root):
        return JsonResponse({"detail": "local_media_root_missing", "total": 0, "existing": 0})

    total = 0
    existing = 0
    sample_existing = []
    check_limit = 200
    to_check = []
    try:
        for _, rel_path in _iter_local_media_files(local_root):
            total += 1
            if len(to_check) < check_limit:
                to_check.append(rel_path)
        for rel_path in to_check:
            if dest_storage.exists(rel_path):
                existing += 1
                if len(sample_existing) < 10:
                    sample_existing.append(rel_path)
    except Exception as exc:
        return JsonResponse({"detail": "object_storage_error", "error": str(exc)}, status=400)

    return JsonResponse({
        "total": total,
        "existing": existing,
        "sample_existing": sample_existing,
        "checked": len(to_check),
        "partial": total > len(to_check),
    })


@login_required
@require_http_methods(["POST"])
def media_storage_pull_start(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    dest_storage, error = _ensure_object_storage_ready()
    if error:
        return error

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    delete_local = bool(payload.get("delete_local", False))
    overwrite = bool(payload.get("overwrite", False))

    job = MediaStoragePullJob.objects.create(
        requested_by=request.user,
        delete_local=delete_local,
        overwrite=overwrite,
        status="pending",
    )
    try:
        from .tasks import pull_local_media_job
        broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
        if broker_url.startswith("memory://"):
            import threading

            threading.Thread(
                target=pull_local_media_job,
                args=(str(job.id),),
                daemon=True,
            ).start()
        else:
            pull_local_media_job.delay(str(job.id))
    except Exception:
        job.status = "failed"
        job.error_message = "Failed to start background job."
        job.save(update_fields=["status", "error_message"])
        return JsonResponse({"detail": "job_start_failed"}, status=500)

    return JsonResponse({"job_id": str(job.id)})


@login_required
@require_http_methods(["GET"])
def media_storage_pull_status(request, job_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    job = MediaStoragePullJob.objects.filter(id=job_id).first()
    if not job:
        return JsonResponse({"detail": "not_found"}, status=404)

    return JsonResponse({
        "id": str(job.id),
        "status": job.status,
        "total_files": job.total_files,
        "existing_files": job.existing_files,
        "copied_files": job.copied_files,
        "skipped_files": job.skipped_files,
        "file_type_counts": job.file_type_counts or {},
        "current_path": job.current_path,
        "delete_local": job.delete_local,
        "overwrite": job.overwrite,
        "error_message": job.error_message,
        "started_at": _format_datetime(job.started_at),
        "finished_at": _format_datetime(job.finished_at),
    })


def _serialize_retention_settings(obj):
    return {
        "last_n": obj.last_n,
        "daily_days": obj.daily_days,
        "weekly_weeks": obj.weekly_weeks,
        "monthly_months": obj.monthly_months,
        "updated_at": _format_datetime(obj.updated_at),
    }


@login_required
@require_http_methods(["GET", "PUT"])
def backup_retention_settings(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    settings_obj = BackupRetentionSettings.get_solo()
    if request.method == "GET":
        return JsonResponse(_serialize_retention_settings(settings_obj))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    def _get_int(field, current):
        try:
            value = int(payload.get(field, current))
        except (TypeError, ValueError):
            return None
        return max(value, 0)

    last_n = _get_int("last_n", settings_obj.last_n)
    daily_days = _get_int("daily_days", settings_obj.daily_days)
    weekly_weeks = _get_int("weekly_weeks", settings_obj.weekly_weeks)
    monthly_months = _get_int("monthly_months", settings_obj.monthly_months)

    if None in (last_n, daily_days, weekly_weeks, monthly_months):
        return JsonResponse({"detail": "invalid_values"}, status=400)

    settings_obj.last_n = last_n
    settings_obj.daily_days = daily_days
    settings_obj.weekly_weeks = weekly_weeks
    settings_obj.monthly_months = monthly_months
    settings_obj.save(update_fields=["last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at"])

    return JsonResponse(_serialize_retention_settings(settings_obj))


@login_required
@require_http_methods(["GET", "PUT"])
def org_backup_retention_override(request, org_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    org = Organization.objects.filter(id=org_id).first()
    if not org:
        return JsonResponse({"detail": "not_found"}, status=404)

    settings_obj, _ = OrganizationBackupRetentionOverride.objects.get_or_create(organization=org)
    if request.method == "GET":
        return JsonResponse(_serialize_retention_settings(settings_obj))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    def _get_int(field, current):
        try:
            value = int(payload.get(field, current))
        except (TypeError, ValueError):
            return None
        return max(value, 0)

    settings_obj.last_n = _get_int("last_n", settings_obj.last_n) or 0
    settings_obj.daily_days = _get_int("daily_days", settings_obj.daily_days) or 0
    settings_obj.weekly_weeks = _get_int("weekly_weeks", settings_obj.weekly_weeks) or 0
    settings_obj.monthly_months = _get_int("monthly_months", settings_obj.monthly_months) or 0
    settings_obj.save(update_fields=["last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at"])

    return JsonResponse(_serialize_retention_settings(settings_obj))


@login_required
@require_http_methods(["GET", "PUT"])
def product_backup_retention_override(request, product_id):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    product = Product.objects.filter(id=product_id).first()
    if not product:
        return JsonResponse({"detail": "not_found"}, status=404)

    settings_obj, _ = ProductBackupRetentionOverride.objects.get_or_create(product=product)
    if request.method == "GET":
        return JsonResponse(_serialize_retention_settings(settings_obj))

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"detail": "invalid_json"}, status=400)

    def _get_int(field, current):
        try:
            value = int(payload.get(field, current))
        except (TypeError, ValueError):
            return None
        return max(value, 0)

    settings_obj.last_n = _get_int("last_n", settings_obj.last_n) or 0
    settings_obj.daily_days = _get_int("daily_days", settings_obj.daily_days) or 0
    settings_obj.weekly_weeks = _get_int("weekly_weeks", settings_obj.weekly_weeks) or 0
    settings_obj.monthly_months = _get_int("monthly_months", settings_obj.monthly_months) or 0
    settings_obj.save(update_fields=["last_n", "daily_days", "weekly_weeks", "monthly_months", "updated_at"])

    return JsonResponse(_serialize_retention_settings(settings_obj))


@login_required
@require_http_methods(["GET"])
def backup_activity(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    qs = BackupRecord.objects.select_related("organization", "product", "requested_by")

    q = (request.GET.get("q") or "").strip()
    if q:
        qs = qs.filter(organization__name__icontains=q)

    status = (request.GET.get("status") or "").strip()
    if status:
        qs = qs.filter(status=status)

    product_id = request.GET.get("product_id")
    if product_id:
        try:
            qs = qs.filter(product_id=int(product_id))
        except (TypeError, ValueError):
            pass

    limit = int(request.GET.get("limit") or 50)
    offset = int(request.GET.get("offset") or 0)
    limit = max(1, min(limit, 200))
    offset = max(offset, 0)

    total = qs.count()
    rows = []
    for rec in qs.order_by("-requested_at")[offset : offset + limit]:
        user = rec.requested_by
        rows.append(
            {
                "id": str(rec.id),
                "organization_id": rec.organization_id,
                "organization_name": rec.organization.name if rec.organization else "-",
                "product_id": rec.product_id,
                "product_name": rec.product.name if rec.product else "-",
                "admin_user": user.email if user else "-",
                "size_bytes": rec.size_bytes,
                "status": rec.status,
                "requested_at": _format_datetime(rec.requested_at),
                "completed_at": _format_datetime(rec.completed_at),
                "expires_at": _format_datetime(rec.expires_at),
            }
        )

    return JsonResponse(
        {
            "items": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    )


@login_required
@require_http_methods(["POST"])
def ai_chatbot_openai_test(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    payload = json.loads(request.body.decode("utf-8") or "{}")
    api_key = str(payload.get("api_key", "") or "").strip()
    model = str(payload.get("model", "") or "").strip()

    settings_obj = OpenAISettings.objects.filter(provider="openai").first()
    if not api_key:
        api_key = settings_obj.api_key if settings_obj else ""
    if not model:
        model = settings_obj.model if settings_obj else "gpt-4o-mini"

    if not api_key:
        return JsonResponse({"ok": False, "detail": "api_key_missing"}, status=400)

    try:
        req = urllib.request.Request("https://api.openai.com/v1/models")
        req.add_header("Authorization", f"Bearer {api_key}")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                return JsonResponse({"ok": True, "model": model})
            return JsonResponse({"ok": False, "detail": f"status_{response.status}"}, status=400)
    except Exception as exc:
        return JsonResponse({"ok": False, "detail": str(exc)}, status=400)
