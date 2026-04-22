from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.views import redirect_to_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import render, redirect
from types import SimpleNamespace
from django.http import JsonResponse, HttpResponse, Http404
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.views.decorators.http import require_http_methods
from django.db.utils import OperationalError, ProgrammingError
import json
import re
from datetime import timedelta, date, datetime
from decimal import Decimal, ROUND_HALF_UP
import os
import glob
from pathlib import Path
from urllib.parse import quote
from types import SimpleNamespace

from apps.backend.enquiries.views import build_enquiry_context
from apps.backend.brand.models import ProductRouteMapping
from apps.backend.brand.models import SiteBrandSettings
from apps.backend.products.models import Product
from saas_admin.models import Product as SaaSAdminProduct
from apps.backend.website import application_downloads
from core.observability import log_event
from core.subscription_utils import FREE_TRIAL_DAYS, is_free_plan, is_subscription_active
from core.access_control import get_access_role, iter_accessible_product_slugs
from core.models import (
    Organization,
    Plan,
    Subscription,
    PendingTransfer,
    Employee,
    UserProfile,
    BillingProfile,
    SubscriptionHistory,
    InvoiceSellerProfile,
    OrgSupportTicket,
    OrgSupportTicketMessage,
    OrgSupportTicketAttachment,
)
from apps.backend.common_auth.models import User
from core.notification_emails import send_email_verification

CANONICAL_DOWNLOAD_HOST = "getworkzilla.com"
CANONICAL_DOWNLOAD_BASE_URL = f"https://{CANONICAL_DOWNLOAD_HOST}"
LOCAL_DOWNLOAD_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0"}
TICKET_MAX_ATTACHMENTS = 5
TICKET_MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024


def _resolve_latest_download(*candidates):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    downloads_dir = os.path.join(base_dir, "static", "downloads")
    for candidate in candidates:
        if not candidate:
            continue
        if any(token in candidate for token in ("*", "?", "[")):
            matches = glob.glob(os.path.join(downloads_dir, candidate))
            if matches:
                latest_path = max(matches, key=os.path.getmtime)
                return latest_path, os.path.basename(latest_path)
            continue
        file_path = os.path.join(downloads_dir, candidate)
        if os.path.exists(file_path):
            return file_path, os.path.basename(file_path)
    raise Http404("Installer not found.")


def _prune_download_variants(*patterns, keep=1):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    downloads_dir = os.path.join(base_dir, "static", "downloads")
    for pattern in patterns:
        if not pattern:
            continue
        matches = glob.glob(os.path.join(downloads_dir, pattern))
        if len(matches) <= keep:
            continue
        sorted_matches = sorted(matches, key=os.path.getmtime, reverse=True)
        for stale_path in sorted_matches[keep:]:
            try:
                os.remove(stale_path)
            except OSError:
                continue


def _is_local_download_request(request):
    host = (request.get_host() or "").split(":")[0].strip().lower()
    return host in LOCAL_DOWNLOAD_HOSTS


def _request_host_name(request):
    return (request.get_host() or "").split(":")[0].strip().lower()


def _is_canonical_download_host(request):
    host = _request_host_name(request)
    return host == CANONICAL_DOWNLOAD_HOST or host == f"www.{CANONICAL_DOWNLOAD_HOST}"


def _maybe_redirect_to_canonical_download(request, path):
    # Local development must use local files only.
    if _is_local_download_request(request):
        return None
    # On canonical live host, serve normally.
    if _is_canonical_download_host(request):
        return None
    # On other hosts/IPs, force canonical public download URL.
    return redirect(f"{CANONICAL_DOWNLOAD_BASE_URL}{path}")

def _has_download_artifact(*candidates):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    downloads_dir = os.path.join(base_dir, "static", "downloads")
    for candidate in candidates:
        if not candidate:
            continue
        if any(token in candidate for token in ("*", "?", "[")):
            if glob.glob(os.path.join(downloads_dir, candidate)):
                return True
            continue
        if os.path.exists(os.path.join(downloads_dir, candidate)):
            return True
    return False


def _parse_checkout_paid_on(value):
    normalized = str(value or "").strip()
    if not normalized:
        return None
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(normalized, fmt).date()
        except ValueError:
            continue
    return None


def _remember_post_verify_next(request, next_path="/checkout/"):
    target = str(next_path or "").strip()
    if not target.startswith("/"):
        return ""
    request.session["post_verify_next"] = target
    request.session.modified = True
    return target


def _send_checkout_verification_email(request, next_path="/checkout/"):
    safe_next_path = _remember_post_verify_next(request, next_path=next_path)
    if request.user.email:
        send_email_verification(
            request.user,
            request=request,
            force=False,
            next_path=safe_next_path or None,
        )
    return safe_next_path

def _prefer_arm64_mac(request):
    user_agent = (request.META.get("HTTP_USER_AGENT") or "").lower()
    if any(token in user_agent for token in ("intel", "x86_64", "x64")):
        return False
    return any(token in user_agent for token in ("arm64", "aarch64", "apple silicon"))


def _normalize_ticket_category(value, default="support"):
    category = str(value or "").strip().lower()
    return category if category in {"support", "sales"} else default


def _normalize_ticket_status(value, default="open"):
    status = str(value or "").strip().lower()
    return status if status in {"open", "in_progress", "resolved", "closed"} else default


def _normalize_ticket_product_slug(value, default="monitor"):
    slug = str(value or "").strip().lower()
    if not slug:
        return default
    if slug in {"worksuite", "work-suite"}:
        return "monitor"
    if slug == "online-storage":
        return "storage"
    return slug


def _ticket_product_label(slug):
    normalized = _normalize_ticket_product_slug(slug, default="")
    labels = {
        "monitor": "Work Suite",
        "storage": "Online Storage",
        "ai-chatbot": "AI Chatbot",
        "imposition-software": "Print Marks",
        "business-autopilot": "Business Autopilot",
        "business-autopilot-erp": "Business Autopilot",
        "whatsapp-automation": "Whatsapp Automation",
        "digital-card": "Digital Card",
        "ai-chat-widget": "AI Chat Widget",
    }
    if normalized in labels:
        return labels[normalized]
    return normalized.replace("-", " ").title() if normalized else ""


def _ticket_product_options_for_org(org):
    options = []
    seen = set()
    for sub in (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan", "plan__product")
        .order_by("-start_date")
    ):
        product = getattr(sub.plan, "product", None)
        slug = _normalize_ticket_product_slug(getattr(product, "slug", "") or "monitor", default="monitor")
        if slug in seen:
            continue
        seen.add(slug)
        options.append({"slug": slug, "name": _ticket_product_label(slug)})
    try:
        from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
        has_storage = StorageOrgSubscription.objects.filter(organization=org).exists()
        if has_storage and "storage" not in seen:
            seen.add("storage")
            options.append({"slug": "storage", "name": _ticket_product_label("storage")})
    except Exception:
        pass
    if not options:
        options.append({"slug": "monitor", "name": _ticket_product_label("monitor")})
    return options


def _validate_ticket_attachments(files):
    if len(files) > TICKET_MAX_ATTACHMENTS:
        return f"Maximum {TICKET_MAX_ATTACHMENTS} images allowed."
    for file_obj in files:
        size = int(getattr(file_obj, "size", 0) or 0)
        if size > TICKET_MAX_ATTACHMENT_BYTES:
            return "Each image must be 2MB or smaller."
        content_type = str(getattr(file_obj, "content_type", "") or "").lower()
        if content_type and not content_type.startswith("image/"):
            return "Only image attachments are allowed."
    return ""


def _is_org_admin_account(request, org, profile=None):
    return _has_account_billing_access(request.user, org, profile)


def _has_account_billing_access(user, org, profile=None):
    if not user.is_authenticated or not org:
        return False
    if getattr(user, "is_staff", False) or getattr(org, "owner_id", None) == user.id:
        return True
    profile = profile or UserProfile.objects.filter(user=user).first()
    return bool(profile and getattr(profile, "is_org_admin", False))


def _accessible_account_product_slugs(user, org, profile=None):
    if not getattr(user, "is_authenticated", False) or not org:
        return set()
    profile = profile or UserProfile.objects.filter(user=user).first()
    role = get_access_role(user, profile)
    if role == "ORG_ADMIN":
        return set()
    fallback_slugs = set()
    try:
        from apps.backend.business_autopilot.api_views import _grant_business_autopilot_access
        from apps.backend.business_autopilot.models import OrganizationUser

        membership = (
            OrganizationUser.objects
            .filter(organization=org, user=user, is_active=True)
            .only("role")
            .first()
        )
        if membership:
            _grant_business_autopilot_access(user, getattr(org, "owner", None), membership.role)
            fallback_slugs.add("business-autopilot-erp")
    except Exception:
        pass
    return {slug for slug in iter_accessible_product_slugs(user) if slug} | fallback_slugs


def _filter_rows_by_product_slugs(rows, allowed_slugs, attr_name="product_slug"):
    if not allowed_slugs:
        return list(rows)
    filtered = []
    for row in rows:
        slug = getattr(row, attr_name, None) if not isinstance(row, dict) else row.get(attr_name)
        if slug in allowed_slugs:
            filtered.append(row)
    return filtered


def _plan_product_slug(plan_obj):
    if not plan_obj:
        return "monitor"
    product_obj = getattr(plan_obj, "product", None)
    if product_obj and getattr(product_obj, "slug", ""):
        return product_obj.slug
    return "monitor"


def _purge_closed_tickets(days=45):
    cutoff = timezone.now() - timedelta(days=max(int(days or 45), 1))
    return (
        OrgSupportTicket.objects
        .filter(status="closed", closed_at__isnull=False, closed_at__lt=cutoff)
        .delete()
    )


def _ticket_author_name(message):
    if message.author:
        full_name = f"{getattr(message.author, 'first_name', '')} {getattr(message.author, 'last_name', '')}".strip()
        return full_name or getattr(message.author, "username", "") or getattr(message.author, "email", "")
    if message.author_role == "saas_admin":
        return "SaaS Admin"
    if message.author_role == "system":
        return "System"
    return "ORG Admin"


def _build_latest_static_download_url(request, *candidates, fallback_path=None):
    try:
        resolved_url, filename = application_downloads.resolve_latest_download_url(*candidates)
        if resolved_url.startswith(("http://", "https://")):
            return resolved_url
        return request.build_absolute_uri(f"/downloads/files/{quote(filename)}")
    except Http404:
        if fallback_path:
            return request.build_absolute_uri(fallback_path)
        raise


def _redirect_to_latest_static_download(request, *candidates, fallback_path=None):
    response = redirect(
        _build_latest_static_download_url(
            request,
            *candidates,
            fallback_path=fallback_path,
        )
    )
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def download_managed_file(request, filename):
    item = application_downloads.serve_local_application_download(filename)
    file_handle = open(item["storage_key"], "rb")
    return FileResponse(
        file_handle,
        content_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{item["filename"]}"',
        },
    )


def application_downloads_page(request):
    items = application_downloads.list_application_downloads()
    route_rows = []
    for route in application_downloads.DIRECT_DOWNLOAD_ROUTES:
        label = str(route.get("label") or "")
        path = str(route.get("path") or "")
        haystack = f"{label} {path}".lower()
        icon_class = "bi-cloud-arrow-down"
        if "windows" in haystack:
            icon_class = "bi-windows"
        elif "mac" in haystack:
            icon_class = "bi-apple"
        route_rows.append({
            "label": label,
            "path": path,
            "icon_class": icon_class,
        })

    table_rows = []
    for item in items:
        download_href = item["download_url"]
        if not download_href:
            download_href = request.build_absolute_uri(f"/downloads/files/{quote(item['filename'])}")
        table_rows.append({
            "filename": item["filename"],
            "product": item["product"],
            "platform": item["platform"] or "-",
            "arch": item["arch"] or "-",
            "size_bytes": item["size_bytes"],
            "last_modified": item["last_modified"],
            "download_url": download_href,
        })
    return render(
        request,
        "public/application_downloads.html",
        {
            "download_items": table_rows,
            "download_routes": route_rows,
            "download_location_label": "Backblaze Application Downloads",
        },
    )


def download_windows_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/windows-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Installer-win-*.exe", "Work Zilla Agent Setup *.exe")
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Installer-win-x64-*.exe",
        "Work Zilla Agent Setup *x64*.exe",
        "Work Zilla Installer-win-*.exe",
        "Work Zilla Agent Setup *.exe",
        "WorkZillaInstallerSetup.exe",
        "WorkZillaAgentSetup.exe",
    )


def download_windows_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/windows-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Agent Setup *.exe")
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Agent Setup *x64*.exe",
        "Work Zilla Agent Setup *.exe",
        "WorkZillaInstallerSetup.exe",
        "WorkZillaAgentSetup.exe",
    )

def download_windows_monitor_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/windows-monitor-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Agent Setup *.exe")
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Agent Setup *x64*.exe",
        "Work Zilla Agent Setup *.exe",
        "WorkZillaInstallerSetup.exe",
        "WorkZillaAgentSetup.exe",
    )

def download_windows_storage_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/windows-storage-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Storage Setup *.exe", "Work Zilla Storage Agent Setup *.exe")
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Storage Setup *x64*.exe",
        "Work Zilla Storage Agent Setup *x64*.exe",
        "Work Zilla Storage Setup *.exe",
        "Work Zilla Storage Agent Setup *.exe",
        "Work Zilla Storage Setup.exe",
    )


def download_mac_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/mac-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants(
        "Work Zilla Installer-mac-arm64-*.dmg",
        "Work Zilla Installer-mac-arm64-*.zip",
        "Work Zilla Installer-mac-x64-*.dmg",
        "Work Zilla Installer-mac-x64-*.zip",
        "Work Zilla Agent-*.dmg",
        "Work Zilla Agent-*.pkg",
        "Work Zilla Agent-*-mac.zip",
    )
    prefer_arm = _prefer_arm64_mac(request)
    if prefer_arm:
        return _redirect_to_latest_static_download(
            request,
            "Work Zilla Installer-mac-arm64-*.dmg",
            "Work Zilla Installer-mac-arm64-*.zip",
            "Work Zilla Installer-mac-x64-*.dmg",
            "Work Zilla Installer-mac-x64-*.zip",
            "Work Zilla Installer-mac-*.dmg",
            "Work Zilla Installer-mac-*.zip",
            "Work Zilla Agent-*-arm64.dmg",
            "Work Zilla Agent-*-arm64.pkg",
            "Work Zilla Agent-*-arm64-mac.zip",
            "Work Zilla Agent-*.dmg",
            "Work Zilla Agent-*.pkg",
            "Work Zilla Agent-*-mac.zip",
        )
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Installer-mac-x64-*.dmg",
        "Work Zilla Installer-mac-x64-*.zip",
        "Work Zilla Installer-mac-arm64-*.dmg",
        "Work Zilla Installer-mac-arm64-*.zip",
        "Work Zilla Installer-mac-*.dmg",
        "Work Zilla Installer-mac-*.zip",
        "Work Zilla Agent-*.dmg",
        "Work Zilla Agent-*.pkg",
        "Work Zilla Agent-*-mac.zip",
        "Work Zilla Agent-*-arm64.dmg",
        "Work Zilla Agent-*-arm64.pkg",
        "Work Zilla Agent-*-arm64-mac.zip",
    )


def download_mac_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/mac-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Agent-*.dmg", "Work Zilla Agent-*.pkg", "Work Zilla Agent-*-mac.zip")
    prefer_arm = _prefer_arm64_mac(request)
    if prefer_arm:
        return _redirect_to_latest_static_download(
            request,
            "Work Zilla Agent-*-arm64.dmg",
            "Work Zilla Agent-*-arm64.pkg",
            "Work Zilla Agent-*-arm64-mac.zip",
            "Work Zilla Agent-*.dmg",
            "Work Zilla Agent-*.pkg",
            "Work Zilla Agent-*-mac.zip",
        )
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Agent-*.dmg",
        "Work Zilla Agent-*.pkg",
        "Work Zilla Agent-*-mac.zip",
        "Work Zilla Agent-*-arm64.dmg",
        "Work Zilla Agent-*-arm64.pkg",
        "Work Zilla Agent-*-arm64-mac.zip",
    )

def download_mac_monitor_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/mac-monitor-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Agent-*.dmg", "Work Zilla Agent-*.pkg", "Work Zilla Agent-*-mac.zip")
    prefer_arm = _prefer_arm64_mac(request)
    if prefer_arm:
        return _redirect_to_latest_static_download(
            request,
            "Work Zilla Agent-*-arm64.dmg",
            "Work Zilla Agent-*-arm64.pkg",
            "Work Zilla Agent-*-arm64-mac.zip",
            "Work Zilla Agent-*.dmg",
            "Work Zilla Agent-*.pkg",
            "Work Zilla Agent-*-mac.zip",
        )
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Agent-*.dmg",
        "Work Zilla Agent-*.pkg",
        "Work Zilla Agent-*-mac.zip",
        "Work Zilla Agent-*-arm64.dmg",
        "Work Zilla Agent-*-arm64.pkg",
        "Work Zilla Agent-*-arm64-mac.zip",
    )

def download_mac_storage_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/mac-storage-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Storage-*.dmg", "Work Zilla Storage-*.pkg", "Work Zilla Storage-*-mac.zip")
    prefer_arm = _prefer_arm64_mac(request)
    if prefer_arm:
        return _redirect_to_latest_static_download(
            request,
            "Work Zilla Storage-*-arm64.dmg",
            "Work Zilla Storage-*-arm64.pkg",
            "Work Zilla Storage-*-arm64-mac.zip",
            "Work Zilla Storage-*.dmg",
            "Work Zilla Storage-*.pkg",
            "Work Zilla Storage-*-mac.zip",
        )
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Storage-*.dmg",
        "Work Zilla Storage-*.pkg",
        "Work Zilla Storage-*-mac.zip",
        "Work Zilla Storage-*-arm64.dmg",
        "Work Zilla Storage-*-arm64.pkg",
        "Work Zilla Storage-*-arm64-mac.zip",
    )


def download_windows_imposition_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/windows-imposition-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants("Work Zilla Imposition Setup *.exe")
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Imposition Setup *x64*.exe",
        "Work Zilla Imposition Setup *.exe",
    )


def download_mac_imposition_product_agent(request):
    redirect_response = _maybe_redirect_to_canonical_download(request, "/downloads/mac-imposition-product-agent/")
    if redirect_response:
        return redirect_response
    _prune_download_variants(
        "Work Zilla Imposition-*.dmg",
        "Work Zilla Imposition-*.pkg",
        "Work Zilla Imposition-*-mac.zip",
    )
    prefer_arm = _prefer_arm64_mac(request)
    if prefer_arm:
        return _redirect_to_latest_static_download(
            request,
            "Work Zilla Imposition-*-arm64.dmg",
            "Work Zilla Imposition-*-arm64.pkg",
            "Work Zilla Imposition-*-arm64-mac.zip",
            "Work Zilla Imposition-*.dmg",
            "Work Zilla Imposition-*.pkg",
            "Work Zilla Imposition-*-mac.zip",
        )
    return _redirect_to_latest_static_download(
        request,
        "Work Zilla Imposition-*.dmg",
        "Work Zilla Imposition-*.pkg",
        "Work Zilla Imposition-*-mac.zip",
        "Work Zilla Imposition-*-arm64.dmg",
        "Work Zilla Imposition-*-arm64.pkg",
        "Work Zilla Imposition-*-arm64-mac.zip",
    )


def bootstrap_products_config(request):
    monitor_windows_url = _build_latest_static_download_url(
        request,
        "Work Zilla Agent Setup *x64*.exe",
        "Work Zilla Agent Setup *.exe",
        fallback_path="/downloads/windows-monitor-product-agent/",
    )
    monitor_mac_url = _build_latest_static_download_url(
        request,
        "Work Zilla Agent-*-arm64.dmg" if _prefer_arm64_mac(request) else "Work Zilla Agent-*.dmg",
        "Work Zilla Agent-*.dmg",
        fallback_path="/downloads/mac-monitor-product-agent/",
    )
    storage_windows_url = _build_latest_static_download_url(
        request,
        "Work Zilla Storage Setup *x64*.exe",
        "Work Zilla Storage Agent Setup *x64*.exe",
        "Work Zilla Storage Setup *.exe",
        "Work Zilla Storage Agent Setup *.exe",
        fallback_path="/downloads/windows-storage-product-agent/",
    )
    storage_mac_url = _build_latest_static_download_url(
        request,
        "Work Zilla Storage-*-arm64.dmg" if _prefer_arm64_mac(request) else "Work Zilla Storage-*.dmg",
        "Work Zilla Storage-*.dmg",
        fallback_path="/downloads/mac-storage-product-agent/",
    )
    imposition_windows_url = _build_latest_static_download_url(
        request,
        "Work Zilla Imposition Setup *x64*.exe",
        "Work Zilla Imposition Setup *.exe",
        fallback_path="/downloads/windows-imposition-product-agent/",
    )
    imposition_mac_url = _build_latest_static_download_url(
        request,
        "Work Zilla Imposition-*-arm64.dmg" if _prefer_arm64_mac(request) else "Work Zilla Imposition-*.dmg",
        "Work Zilla Imposition-*.dmg",
        fallback_path="/downloads/mac-imposition-product-agent/",
    )

    return JsonResponse(
        {
            "monitor": {
                "windows": monitor_windows_url,
                "mac": monitor_mac_url,
            },
            "storage": {
                "windows": storage_windows_url,
                "mac": storage_mac_url,
            },
            "imposition": {
                "windows": imposition_windows_url,
                "mac": imposition_mac_url,
            },
            "imposition-software": {
                "windows": imposition_windows_url,
                "mac": imposition_mac_url,
            },
        }
    )


def _normalize_product_slug(value, default="monitor"):
    slug = (value or "").strip().lower()
    if slug in {"worksuite", "work-suite"}:
        return "monitor"
    if slug == "online-storage":
        return "storage"
    return slug or default


def _is_business_autopilot_alias(slug):
    normalized = (slug or "").strip().lower()
    return normalized in {"business-autopilot", "business-autopilot-erp"}


def _normalize_saas_slug_to_public(value):
    slug = str(value or "").strip().lower()
    if slug in {"work-suite", "worksuite"}:
        return "worksuite"
    if slug == "online-storage":
        return "storage"
    if slug in {"business-autopilot", "business-autopilot-erp"}:
        return "business-autopilot"
    if slug in {"imposition", "imposition software"}:
        return "imposition-software"
    return slug


def _dashboard_path_for_product(value):
    slug = _normalize_product_slug(value)
    if slug == "monitor":
        return "/app/work-suite/"
    if slug == "imposition-software":
        return "/app/imposition/"
    if slug in {"business-autopilot-erp", "business-autopilot"}:
        return "/app/business-autopilot/"
    return f"/app/{slug}/"


def _display_product_name(product=None, slug=None):
    normalized_slug = _normalize_product_slug(
        (getattr(product, "slug", None) if product else None) or slug
    )
    if normalized_slug == "monitor":
        return "Work Suite"

    if product and getattr(product, "name", None):
        name = str(product.name).strip()
        if name.lower() == "monitor":
            return "Work Suite"
        return name

    if normalized_slug == "storage":
        return "Online Storage"
    if normalized_slug == "ai-chatbot":
        return "AI Chatbot"
    if normalized_slug == "imposition-software":
        return "Print Marks"
    if normalized_slug in {"business-autopilot-erp", "business-autopilot"}:
        return "Business Autopilot"
    return "Work Suite"


def _display_plan_name(plan=None, fallback="-"):
    raw_name = str(getattr(plan, "name", "") or "").strip()
    if not raw_name:
        return fallback
    # Legacy ERP suffix is hidden in customer-facing views ("Pro ERP" -> "Pro")
    if raw_name.lower().endswith(" erp"):
        normalized = raw_name[:-4].strip()
        if normalized:
            return normalized
    return raw_name


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


def _org_has_used_free_trial(org, product_slug):
    if not org:
        return False
    product_slug = _normalize_product_slug(product_slug)
    subs = (
        Subscription.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    if product_slug == "monitor":
        subs = subs.filter(Q(plan__product__slug="monitor") | Q(plan__product__isnull=True))
    else:
        subs = subs.filter(plan__product__slug=product_slug)
    for sub in subs:
        if sub.plan and is_free_plan(sub.plan):
            return True
    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    if product_slug == "monitor":
        history_rows = history_rows.filter(Q(plan__product__slug="monitor") | Q(plan__product__isnull=True))
    else:
        history_rows = history_rows.filter(plan__product__slug=product_slug)
    for row in history_rows:
        if row.plan and is_free_plan(row.plan):
            return True
    if product_slug == "storage":
        try:
            from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
        except Exception:
            return False
        storage_subs = StorageOrgSubscription.objects.filter(organization=org).select_related("plan")
        for sub in storage_subs:
            if sub.plan is None or _storage_is_free_plan(sub.plan):
                return True
    return False


def _base_context(request):
    context = build_enquiry_context(request)
    products = []
    try:
        saas_rows = (
            SaaSAdminProduct.objects
            .filter(status="active")
            .order_by("sort_order", "name")
            .values("slug")
        )
        ordered_internal_slugs = []
        seen = set()
        for row in saas_rows:
            public_slug = _normalize_saas_slug_to_public(row.get("slug"))
            internal_slug = _normalize_product_slug(public_slug, default="")
            if not internal_slug or internal_slug in {"ai-chat-widget", "digital-card"}:
                continue
            if internal_slug in seen:
                continue
            seen.add(internal_slug)
            ordered_internal_slugs.append(internal_slug)

        product_map = {
            item.slug: item
            for item in Product.objects.filter(is_active=True, slug__in=ordered_internal_slugs)
        }
        products = [product_map[slug] for slug in ordered_internal_slugs if slug in product_map]
    except (OperationalError, ProgrammingError):
        products = []

    if not products:
        products = list(
            Product.objects
            .filter(is_active=True)
            .exclude(slug="ai-chat-widget")
            .order_by("sort_order", "name")
        )

    context["products"] = products
    context["is_logged_in"] = request.user.is_authenticated
    if request.user.is_authenticated:
        profile = UserProfile.objects.filter(user=request.user).first()
        context["is_agent"] = bool(profile and profile.role == "ai_chatbot_agent")
    else:
        context["is_agent"] = False
    return context


def _billing_profile_complete(profile):
    if not profile:
        return False
    required_fields = [
        "contact_name",
        "company_name",
        "email",
        "phone",
        "address_line1",
        "city",
        "country",
        "state",
        "postal_code",
    ]
    return all(str(getattr(profile, field, "") or "").strip() for field in required_fields)


def _split_phone_number(phone_value):
    value = str(phone_value or "").strip()
    if not value:
        return "", ""
    normalized = value.replace("-", " ")
    if normalized.startswith("+"):
        parts = [part for part in normalized.split(" ") if part]
        if len(parts) >= 2:
            return parts[0], " ".join(parts[1:])
        return normalized, ""
    return "+91", normalized


def _build_phone_number(country_code, number):
    country = (country_code or "").strip()
    phone = (number or "").strip()
    if not country and not phone:
        return ""
    if not country:
        return phone
    if not phone:
        return country
    return f"{country} {phone}".strip()


def _format_bank_details(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    normalized = raw.replace("\r", "\n")
    lines = []
    for chunk in normalized.split("\n"):
        if not chunk.strip():
            continue
        for part in chunk.split(","):
            item = part.strip()
            if item:
                lines.append(item)
    return "\n".join(lines)


def _billing_products_for_org(org):
    products_by_slug = {}

    def add_product(product):
        if product:
            slug = (product.slug or "").strip()
            if not slug or slug == "ai-chat-widget":
                return
            if slug == "monitor":
                slug = "worksuite"
            if slug not in products_by_slug:
                name = "Work Suite" if product.slug == "monitor" else product.name
                products_by_slug[slug] = {"slug": slug, "name": name}
            return
        if "worksuite" not in products_by_slug:
            products_by_slug["worksuite"] = {"slug": "worksuite", "name": "Work Suite"}

    transfers = (
        PendingTransfer.objects
        .filter(organization=org)
        .select_related("plan", "plan__product")
    )
    for transfer in transfers:
        add_product(transfer.plan.product if transfer.plan else None)

    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan", "plan__product")
    )
    for entry in history_rows:
        add_product(entry.plan.product if entry.plan else None)

    return sorted(products_by_slug.values(), key=lambda item: item["name"].lower())


def _save_billing_profile_from_request(request, org, profile):
    required_fields = [
        "contact_name",
        "company_name",
        "email",
        "phone",
        "address_line1",
        "city",
        "country",
        "state",
        "postal_code",
    ]
    missing = [field for field in required_fields if not (request.POST.get(field) or "").strip()]
    if missing:
        messages.error(request, "Please fill all required billing fields.")
        return profile, False
    if not profile:
        profile = BillingProfile(organization=org)
    profile.contact_name = (request.POST.get("contact_name") or "").strip()
    profile.company_name = (request.POST.get("company_name") or "").strip()
    profile.email = (request.POST.get("email") or "").strip()
    phone_value = (request.POST.get("phone") or "").strip()
    if not phone_value:
        phone_value = _build_phone_number(
            request.POST.get("phone_country"),
            request.POST.get("phone_number_input"),
        )
    profile.phone = phone_value
    profile.address_line1 = (request.POST.get("address_line1") or "").strip()
    profile.address_line2 = (request.POST.get("address_line2") or "").strip()
    profile.city = (request.POST.get("city") or "").strip()
    profile.state = (request.POST.get("state") or "").strip()
    profile.postal_code = (request.POST.get("postal_code") or "").strip()
    profile.country = (request.POST.get("country") or "").strip() or "India"
    profile.gstin = (request.POST.get("gstin") or "").strip()
    profile.save()
    user_profile = UserProfile.objects.filter(user=request.user).first()
    if user_profile:
        new_phone = (request.POST.get("phone") or "").strip()
        if new_phone and user_profile.phone_number != new_phone:
            user_profile.phone_number = new_phone
            user_profile.save(update_fields=["phone_number"])
    messages.success(request, "Billing profile updated.")
    return profile, True


def home_view(request):
    return render(request, "public/home.html", _base_context(request))


def pricing_view(request):
    context = _base_context(request)
    try:
        plans = Plan.objects.all().order_by("price", "name")
        plans_by_product = {}
        for plan in plans:
            slug = getattr(plan.product, "slug", None) or "monitor"
            plans_by_product.setdefault(slug, []).append(plan)
        plans_by_product.setdefault("monitor", [])
        context["plans_by_product"] = plans_by_product
    except OperationalError:
        context["plans_by_product"] = {}
    active_plans = {}
    if request.user.is_authenticated:
        org = _resolve_org_for_user(request.user)
        active_subs = (
            Subscription.objects
            .filter(organization=org, status__in=["active", "trialing"])
            .select_related("plan", "plan__product")
            .order_by("-start_date")
        )
        for sub in active_subs:
            plan = sub.plan
            if not plan:
                continue
            product = plan.product if plan else None
            slug = product.slug if product and product.slug else "monitor"
            if slug not in active_plans:
                active_plans[slug] = {
                    "plan_id": plan.id,
                    "status": sub.status,
                }
        try:
            from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
            storage_sub = (
                StorageOrgSubscription.objects
                .filter(organization=org, status__in=["active", "trialing"])
                .select_related("plan")
                .order_by("-updated_at")
                .first()
            )
            if storage_sub and "storage" not in active_plans:
                active_plans["storage"] = {
                    "plan_id": storage_sub.plan_id,
                    "status": storage_sub.status,
                }
        except Exception:
            pass
    context["active_plans_json"] = json.dumps(active_plans)
    return render(request, "public/pricing.html", context)


def imposition_pricing_view(request):
    context = _base_context(request)
    product = Product.objects.filter(slug="imposition-software", is_active=True).first()
    plans = []
    trial_plan_id = None
    plan_id_map = {}
    if product:
        all_plans = (
            Plan.objects
            .filter(product=product)
            .order_by("monthly_price", "yearly_price", "name")
        )
        for plan in all_plans:
            feature_flags = dict(plan.features or {})
            plan_id_map[str(plan.name or "").strip().lower()] = plan.id
            if feature_flags.get("is_trial"):
                trial_plan_id = plan.id
                continue
            plans.append(plan)

    context.update({
        "imposition_product": product,
        "imposition_plans": plans,
        "imposition_trial_plan_id": trial_plan_id,
        "imposition_plan_id_map_json": json.dumps(plan_id_map),
    })
    return render(request, "public/imposition_pricing.html", context)


def imposition_software_view(request):
    context = _base_context(request)
    context["imposition_trial_plan_id"] = None
    product = Product.objects.filter(slug="imposition-software", is_active=True).first()
    if product:
        all_plans = (
            Plan.objects
            .filter(product=product)
            .order_by("monthly_price", "name")
        )
        trial_plan = None
        for row in all_plans:
            if (row.features or {}).get("is_trial"):
                trial_plan = row
                break
        if trial_plan:
            context["imposition_trial_plan_id"] = trial_plan.id
    return render(request, "public/imposition_software.html", context)


def contact_view(request):
    context = _base_context(request)
    site_brand = SiteBrandSettings.get_active()
    seller = InvoiceSellerProfile.objects.order_by("-updated_at").first()

    company_name = (
        (seller.name if seller and seller.name else "")
        or (site_brand.site_name if site_brand and site_brand.site_name else "")
        or "Work Zilla"
    )
    support_email = (
        (site_brand.support_email if site_brand and site_brand.support_email else "")
        or (seller.support_email if seller and seller.support_email else "")
        or "workzonemonitor@webszilla.com"
    )
    support_phone = (
        (site_brand.support_phone if site_brand and site_brand.support_phone else "")
        or "+91 90928 33701"
    )

    address_lines = []
    if seller:
        for value in [seller.address_line1, seller.address_line2]:
            text = (value or "").strip()
            if text:
                address_lines.append(text)
        location_parts = [
            (seller.city or "").strip(),
            (seller.state or "").strip(),
            (seller.postal_code or "").strip(),
        ]
        location_line = ", ".join([part for part in location_parts if part])
        if location_line:
            address_lines.append(location_line)
        country = (seller.country or "").strip()
        if country and country.lower() != "india":
            address_lines.append(country)

    if not address_lines:
        address_lines = ["182/C, 4th Main Road, Sadasivam Nagar, Madipakkam, Chennai - 600091"]

    phone_href = "".join(ch for ch in str(support_phone) if ch.isdigit() or ch == "+")

    context.update({
        "contact_info": {
            "company_name": company_name,
            "support_email": support_email,
            "support_phone": support_phone,
            "support_phone_href": phone_href,
            "address_lines": address_lines,
        }
    })
    return render(request, "public/contact.html", context)


def about_view(request):
    return render(request, "public/about.html", _base_context(request))


def privacy_view(request):
    return render(request, "public/privacy.html", _base_context(request))


def terms_view(request):
    return render(request, "public/terms.html", _base_context(request))


def refund_policy_view(request):
    return render(request, "public/refund_policy.html", _base_context(request))


def disclaimer_view(request):
    return render(request, "public/disclaimer.html", _base_context(request))


@require_POST
def checkout_select(request):
    plan_id = request.POST.get("plan_id")
    product_slug = _normalize_product_slug(request.POST.get("product_slug"))
    currency = (request.POST.get("currency") or "inr").lower()
    billing = (request.POST.get("billing") or "monthly").lower()
    try:
        addon_count = int(request.POST.get("addon_count") or 0)
    except (TypeError, ValueError):
        addon_count = 0
    addon_count = max(0, addon_count)

    request.session["selected_product_slug"] = product_slug
    request.session["selected_plan_id"] = plan_id
    request.session["selected_currency"] = currency
    request.session["selected_billing"] = billing
    request.session["selected_addon_count"] = addon_count

    if not request.user.is_authenticated:
        return redirect("/auth/signup/?next=/checkout/")
    return redirect("/checkout/")


@login_required(login_url="/auth/login/")
def checkout_view(request):
    if request.user.email and not request.user.email_verified:
        _send_checkout_verification_email(request, next_path="/checkout/")
        if request.user.email:
            messages.info(
                request,
                f"Please verify your email ({request.user.email}) to continue checkout.",
            )
        else:
            messages.info(request, "Please verify your email to continue checkout.")
        return redirect("/my-account/")

    context = _base_context(request)
    plan_id = request.session.get("selected_plan_id")
    product_slug = _normalize_product_slug(request.session.get("selected_product_slug"))
    currency = request.session.get("selected_currency") or "inr"
    billing = request.session.get("selected_billing") or "monthly"
    try:
        addon_count = int(request.session.get("selected_addon_count") or 0)
    except (TypeError, ValueError):
        addon_count = 0
    addon_count = max(0, addon_count)
    plan = Plan.objects.filter(id=plan_id).first() if plan_id else None
    selected_product_name = _display_product_name(slug=product_slug) if product_slug else ""
    price_suffix = "/user per month" if billing == "monthly" else "/user per year"
    if product_slug in ("storage", "online-storage"):
        try:
            from apps.backend.storage.models import Plan as StoragePlan
            storage_plan = StoragePlan.objects.filter(id=plan_id).select_related("product").first()
            if storage_plan:
                selected_product_name = storage_plan.product.name if storage_plan.product else "Online Storage"
                plan = SimpleNamespace(
                    name=storage_plan.name,
                    monthly_price=storage_plan.monthly_price_inr,
                    yearly_price=storage_plan.yearly_price_inr,
                    usd_monthly_price=storage_plan.monthly_price_usd,
                    usd_yearly_price=storage_plan.yearly_price_usd,
                )
                price_suffix = "/org per month" if billing == "monthly" else "/org per year"
        except Exception:
            pass
    if not getattr(plan, "allow_addons", False):
        addon_count = 0
    addon_unit_price = float(_addon_price(plan, currency, billing) or 0) if getattr(plan, "allow_addons", False) else 0.0
    base_amount = float(_plan_price(plan, currency, billing) or 0) if plan else 0.0
    total_amount = base_amount + (addon_unit_price * addon_count)
    org = _resolve_org_for_user(request.user)
    profile = BillingProfile.objects.filter(organization=org).first()
    user_profile = UserProfile.objects.filter(user=request.user).first()
    seller = InvoiceSellerProfile.objects.order_by("-updated_at").first()
    bank_account_details = _format_bank_details(seller.bank_account_details if seller else "")
    seller_upi_id = (seller.upi_id or "").strip() if seller else ""

    if request.method == "POST":
        action = (request.POST.get("billing_action") or "").strip()
        if action == "save_profile":
            profile, _ = _save_billing_profile_from_request(request, org, profile)
            return redirect(request.get_full_path())

    phone_value = ""
    if profile and profile.phone:
        phone_value = profile.phone
    elif user_profile and user_profile.phone_number:
        phone_value = user_profile.phone_number
    phone_country, phone_number = _split_phone_number(phone_value)

    context.update({
        "selected_product_slug": product_slug,
        "selected_product_name": selected_product_name,
        "selected_currency": currency,
        "selected_billing": billing,
        "selected_plan": plan,
        "selected_addon_count": addon_count,
        "selected_addon_price": addon_unit_price,
        "selected_base_amount": base_amount,
        "selected_total_amount": total_amount,
        "price_suffix": price_suffix,
        "billing_profile": profile,
        "billing_profile_complete": _billing_profile_complete(profile),
        "billing_profile_email": (profile.email if profile and profile.email else request.user.email),
        "billing_profile_phone": phone_value,
        "billing_phone_country": phone_country,
        "billing_phone_number": phone_number,
        "bank_account_details": bank_account_details,
        "seller_upi_id": seller_upi_id,
    })
    return render(request, "public/checkout.html", context)


def _resolve_org_for_user(user):
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    org = Organization.objects.filter(owner=user).first()
    if org and profile and not profile.organization:
        profile.organization = org
        profile.save(update_fields=["organization"])
    if org:
        return org
    company_key = f"{user.username}-{user.id}".lower()
    org = Organization.objects.create(
        name=(user.get_full_name() or user.username or "My Organization").strip(),
        company_key=company_key,
        owner=user,
    )
    if profile:
        profile.organization = org
        profile.save(update_fields=["organization"])
    return org


def _plan_price(plan, currency, billing):
    currency = (currency or "inr").lower()
    billing = (billing or "monthly").lower()
    if currency == "usd":
        return plan.usd_monthly_price if billing == "monthly" else plan.usd_yearly_price
    return plan.monthly_price if billing == "monthly" else plan.yearly_price


def _addon_price(plan, currency, billing):
    currency = (currency or "inr").lower()
    billing = (billing or "monthly").lower()
    if currency == "usd":
        direct_value = plan.addon_usd_monthly_price if billing == "monthly" else plan.addon_usd_yearly_price
    else:
        direct_value = plan.addon_monthly_price if billing == "monthly" else plan.addon_yearly_price
    if direct_value not in (None, ""):
        try:
            parsed = float(direct_value)
        except (TypeError, ValueError):
            parsed = 0.0
        if parsed > 0:
            return parsed

    # Pricing page for Business Autopilot uses limits.user_price_*.
    limits = getattr(plan, "limits", None) or {}
    if currency == "usd":
        key = "user_price_usdt_month" if billing == "monthly" else "user_price_usdt_year"
        fallback = limits.get(key)
        if fallback in (None, ""):
            alt_key = "user_price_usd_month" if billing == "monthly" else "user_price_usd_year"
            fallback = limits.get(alt_key)
    else:
        key = "user_price_inr_month" if billing == "monthly" else "user_price_inr_year"
        fallback = limits.get(key)
    try:
        return float(fallback or 0)
    except (TypeError, ValueError):
        return 0.0


def _active_subscription_for_product(org, product_slug):
    if not org:
        return None
    product_slug = _normalize_product_slug(product_slug)
    qs = Subscription.objects.filter(organization=org, status__in=("active", "trialing")).select_related("plan", "plan__product")
    if product_slug == "monitor":
        qs = qs.filter(Q(plan__product__slug="monitor") | Q(plan__product__isnull=True))
    else:
        qs = qs.filter(plan__product__slug=product_slug)
    return qs.order_by("-start_date", "-id").first()


def _subscription_next_cycle_addon_count(subscription):
    if not subscription:
        return 0
    scheduled = getattr(subscription, "addon_next_cycle_count", None)
    if scheduled is None:
        scheduled = subscription.addon_count
    try:
        return max(0, int(scheduled or 0))
    except (TypeError, ValueError):
        return max(0, int(subscription.addon_count or 0))


def _subscription_temporary_addon_window(subscription, now=None):
    now = now or timezone.now()
    if not subscription:
        return {"extra": 0, "until": None}
    active_addons = max(0, int(subscription.addon_count or 0))
    scheduled_addons = _subscription_next_cycle_addon_count(subscription)
    extra = max(0, active_addons - scheduled_addons)
    if extra <= 0:
        return {"extra": 0, "until": None}
    until = getattr(subscription, "end_date", None)
    if until and until <= now:
        return {"extra": 0, "until": None}
    return {"extra": extra, "until": until}


def _addon_proration_preview(subscription, currency="inr", now=None, addon_delta=1):
    now = now or timezone.now()
    addon_delta = max(0, int(addon_delta or 0))
    if not subscription or not subscription.plan or addon_delta <= 0:
        return {
            "remaining_days": 0,
            "cycle_days": 30,
            "unit_price": Decimal("0.00"),
            "prorated_unit_price": Decimal("0.00"),
            "amount": Decimal("0.00"),
            "start_at": now,
            "end_at": now,
            "description": "",
        }
    plan = subscription.plan
    billing_cycle = (subscription.billing_cycle or "monthly").lower()
    cycle_days = 365 if billing_cycle == "yearly" else 30
    raw_unit_price = _addon_price(plan, currency, billing_cycle) or 0
    unit_price = Decimal(str(raw_unit_price))
    start_at = now
    end_at = subscription.end_date if subscription.end_date and subscription.end_date > now else (now + timedelta(days=cycle_days))
    remaining_seconds = max(0, (end_at - start_at).total_seconds())
    cycle_seconds = max(1, cycle_days * 24 * 60 * 60)
    ratio = Decimal(str(remaining_seconds / cycle_seconds))
    prorated_unit = (unit_price * ratio).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total_amount = (prorated_unit * Decimal(addon_delta)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    remaining_days = max(0, int((end_at.date() - start_at.date()).days))
    currency_label = (currency or "INR").upper()
    description = (
        f"Add-on users proration ({addon_delta} user{'s' if addon_delta != 1 else ''}) "
        f"for {remaining_days} day{'s' if remaining_days != 1 else ''} "
        f"from {start_at.strftime('%d %b %Y')} to {end_at.strftime('%d %b %Y')} "
        f"(billing cycle: {billing_cycle.title()}, {remaining_days}/{cycle_days} days remaining). "
        f"Unit {currency_label} {unit_price} prorated to {currency_label} {prorated_unit}."
    )
    return {
        "remaining_days": remaining_days,
        "cycle_days": cycle_days,
        "unit_price": unit_price,
        "prorated_unit_price": prorated_unit,
        "amount": total_amount,
        "start_at": start_at,
        "end_at": end_at,
        "description": description,
    }


def _plan_rank(plan):
    if not plan:
        return 0
    prices = [
        plan.yearly_price or 0,
        plan.monthly_price or 0,
        plan.usd_yearly_price or 0,
        plan.usd_monthly_price or 0,
        plan.price or 0,
    ]
    return max(prices)


def _storage_plan_rank(plan):
    if not plan:
        return 0
    name = (getattr(plan, "name", "") or "").strip().lower()
    order = {"free": 0, "basic": 1, "standard": 2, "pro": 3}
    if name in order:
        return order[name]
    price = getattr(plan, "monthly_price", 0) or 0
    try:
        return int(price)
    except (TypeError, ValueError):
        return 0


def _latest_subscription_for_product(org, product_slug):
    if not org:
        return None
    product_slug = _normalize_product_slug(product_slug)
    qs = Subscription.objects.filter(organization=org).select_related("plan", "plan__product")
    if product_slug == "monitor":
        qs = qs.filter(plan__product__slug__in=["monitor", None])
    else:
        qs = qs.filter(plan__product__slug=product_slug)
    return qs.order_by("-start_date").first()


def _clear_renew_session(request):
    for key in (
        "renew_product_slug",
        "renew_plan_id",
        "renew_currency",
        "renew_billing",
        "renew_addon_count",
    ):
        request.session.pop(key, None)
    request.session.modified = True


@require_http_methods(["POST"])
def subscription_start(request):
    trial_error_messages = {
        "email_verification_required": "Please verify your email before starting the free trial.",
        "checkout_in_progress": "Checkout already started for this product. Continue from My Account.",
        "trial_already_used": "Free trial already used for this product.",
        "subscription_exists": "A plan is already active for this product.",
        "trial_history_exists": "Free trial is not available after previous billing activity.",
        "trial_disabled": "Free trial is currently unavailable.",
        "trial_not_available": "Free trial is not available for this product.",
    }

    def _trial_block_response(detail, *, status=409, redirect_url=""):
        payload = {
            "detail": detail,
            "message": trial_error_messages.get(detail, trial_error_messages["trial_not_available"]),
        }
        if redirect_url:
            payload["redirect"] = redirect_url
        return JsonResponse(payload, status=status)

    if not request.user.is_authenticated:
        return JsonResponse({"detail": "authentication_required"}, status=401)
    if request.user.email and not request.user.email_verified:
        _send_checkout_verification_email(request, next_path="/checkout/")
        if request.user.email:
            messages.info(
                request,
                f"Please verify your email ({request.user.email}) to continue checkout.",
            )
        else:
            messages.info(request, "Please verify your email to continue checkout.")
        return _trial_block_response(
            "email_verification_required",
            status=403,
            redirect_url="/my-account/",
        )
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    product_slug = _normalize_product_slug(payload.get("product"))
    plan_id = payload.get("plan_id")
    interval = (payload.get("interval") or "monthly").strip().lower()
    if interval not in ("monthly", "yearly"):
        interval = "monthly"
    if not product_slug or not plan_id:
        return JsonResponse({"detail": "invalid_payload"}, status=400)

    if product_slug in ("storage", "online-storage"):
        from apps.backend.storage.models import Plan as StoragePlan, OrgSubscription as StorageOrgSubscription
        from apps.backend.storage.models import Product as StorageProduct
        plan = StoragePlan.objects.filter(id=plan_id).select_related("product").first()
        if not plan:
            return JsonResponse({"detail": "plan_not_found"}, status=404)
        storage_product = plan.product if plan.product_id else StorageProduct.objects.filter(name__iexact="Online Storage").first()
        if not storage_product:
            return JsonResponse({"detail": "product_not_found"}, status=404)
    else:
        plan = Plan.objects.filter(id=plan_id).select_related("product").first()
        if not plan:
            return JsonResponse({"detail": "plan_not_found"}, status=404)
        plan_product_slug = _normalize_product_slug(plan.product.slug if plan.product else "monitor")
        same_product = plan_product_slug == product_slug or (
            _is_business_autopilot_alias(plan_product_slug)
            and _is_business_autopilot_alias(product_slug)
        )
        if not same_product:
            return JsonResponse({"detail": "product_mismatch"}, status=400)

    org = _resolve_org_for_user(request.user)
    if not org:
        return JsonResponse({"detail": "organization_required"}, status=403)

    pending_checkout = False
    has_history = False
    has_subscription = False
    has_storage_sub = False
    has_live_subscription = False

    if product_slug in ("storage", "online-storage"):
        has_storage_sub = StorageOrgSubscription.objects.filter(organization=org).exists()
        storage_subscriptions = Subscription.objects.filter(
            organization=org,
            plan__product__slug="storage",
        )
        has_subscription = storage_subscriptions.exists()
        has_live_subscription = storage_subscriptions.exclude(status="expired").exists()
        has_pending_subscription = storage_subscriptions.filter(status="pending").exists()
        pending_checkout = PendingTransfer.objects.filter(
            organization=org,
            status__in=["draft", "pending"],
            request_type__in=["new", "renew"],
            plan__product__slug="storage",
        ).exists() or has_pending_subscription

        storage_slug = "storage"
        has_history = SubscriptionHistory.objects.filter(
            organization=org,
            plan__product__slug=storage_slug
        ).exists()
    else:
        product_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter |= Q(plan__product__isnull=True)
        has_history = SubscriptionHistory.objects.filter(
            organization=org
        ).filter(product_filter).exists()
        product_subscriptions = Subscription.objects.filter(
            organization=org
        ).filter(product_filter)
        has_subscription = product_subscriptions.exists()
        has_live_subscription = product_subscriptions.exclude(status="expired").exists()
        has_pending_subscription = product_subscriptions.filter(status="pending").exists()
        pending_checkout = PendingTransfer.objects.filter(
            organization=org,
            status__in=["draft", "pending"],
            request_type__in=["new", "renew"],
        ).filter(product_filter).exists() or has_pending_subscription

    trial_days = FREE_TRIAL_DAYS
    used_free_trial = _org_has_used_free_trial(org, product_slug)
    trial_available = (
        trial_days > 0
        and not has_history
        and not has_subscription
        and not has_storage_sub
        and not used_free_trial
    )
    if not trial_available:
        if trial_days <= 0:
            return _trial_block_response("trial_disabled")
        if pending_checkout:
            return _trial_block_response("checkout_in_progress", redirect_url="/my-account/billing/")
        if used_free_trial:
            return _trial_block_response("trial_already_used")
        if has_live_subscription or has_storage_sub:
            return _trial_block_response("subscription_exists")
        if has_history or has_subscription:
            return _trial_block_response("trial_history_exists")
        return _trial_block_response("trial_not_available")

    if trial_available:
        now = timezone.now()
        trial_end = now + timedelta(days=trial_days)
        if product_slug in ("storage", "online-storage"):
            subscription = StorageOrgSubscription.objects.create(
                organization=org,
                product=storage_product,
                plan=plan,
                status="trialing",
                renewal_date=trial_end.date(),
            )
            return JsonResponse({
                "status": "trialing",
                "trial_end": trial_end.isoformat(),
                "redirect": "/app/storage/",
                "subscription_id": subscription.id,
            })
        else:
            subscription = Subscription.objects.create(
                user=request.user,
                organization=org,
                plan=plan,
                status="trialing",
                start_date=now,
                end_date=trial_end,
                trial_end=trial_end,
                billing_cycle=interval,
                retention_days=plan.retention_days or 30,
                addon_next_cycle_count=0,
            )
            SubscriptionHistory.objects.create(
                organization=org,
                user=request.user,
                plan=plan,
                status="active",
                start_date=now,
                end_date=trial_end,
                billing_cycle=interval,
            )
            return JsonResponse({
                "status": "trialing",
                "trial_end": trial_end.isoformat(),
                "redirect": _dashboard_path_for_product(product_slug),
                "subscription_id": subscription.id,
            })

    return _trial_block_response("trial_not_available")


@require_POST
@login_required(login_url="/auth/login/")
def checkout_confirm(request):
    if request.user.email and not request.user.email_verified:
        _send_checkout_verification_email(request, next_path="/checkout/")
        if request.user.email:
            messages.info(
                request,
                f"Please verify your email ({request.user.email}) to continue checkout.",
            )
        else:
            messages.info(request, "Please verify your email to continue checkout.")
        return redirect("/my-account/")

    plan_id = request.session.get("selected_plan_id")
    product_slug = _normalize_product_slug(request.session.get("selected_product_slug"))
    currency = request.session.get("selected_currency") or "inr"
    billing = request.session.get("selected_billing") or "monthly"
    try:
        addon_count = int(request.POST.get("addon_count") or request.session.get("selected_addon_count") or 0)
    except (TypeError, ValueError):
        addon_count = 0
    addon_count = max(0, addon_count)
    plan = Plan.objects.filter(id=plan_id).first()
    storage_plan = None
    if product_slug in ("storage", "online-storage"):
        try:
            from apps.backend.storage.models import Plan as StoragePlan
            storage_plan = StoragePlan.objects.filter(id=plan_id).first()
        except Exception:
            storage_plan = None
        if storage_plan:
            plan = (
                Plan.objects
                .filter(product__slug="storage", name__iexact=storage_plan.name)
                .first()
            )
    if not plan:
        messages.error(request, "Select a plan before checkout.")
        return redirect("/pricing/")
    if not getattr(plan, "allow_addons", False):
        addon_count = 0

    org = _resolve_org_for_user(request.user)
    plan_product_slug = _normalize_product_slug(plan.product.slug if plan and plan.product else "", default="")
    pending_transfers = PendingTransfer.objects.filter(
        organization=org,
        status="pending",
        request_type__in=("new", "renew"),
    )
    if plan_product_slug == "monitor":
        pending_transfers = pending_transfers.filter(
            Q(plan__product__slug__in=["monitor", "worksuite", "work-suite"]) | Q(plan__product__isnull=True)
        )
    elif plan_product_slug:
        pending_transfers = pending_transfers.filter(plan__product__slug=plan_product_slug)
    existing_pending = pending_transfers.order_by("-created_at").first()
    if existing_pending:
        messages.info(
            request,
            "This plan payment is already pending approval. Please wait for admin approval or create a ticket in My Account.",
        )
        return redirect(f"/my-account/bank-transfer/{existing_pending.id}/")

    profile = BillingProfile.objects.filter(organization=org).first()
    if not _billing_profile_complete(profile):
        messages.error(request, "Please complete company billing details before checkout.")
        return redirect("/checkout/")

    utr_number = (request.POST.get("utr_number") or "").strip()
    paid_on_input = request.POST.get("paid_on") or None
    paid_on = _parse_checkout_paid_on(paid_on_input)
    notes = (request.POST.get("notes") or "").strip()
    receipt = request.FILES.get("receipt")
    if not utr_number or not paid_on:
        messages.error(request, "UTR number and paid date are required for bank transfer.")
        return redirect("/checkout/")
    if not receipt:
        messages.error(request, "Please upload bank transfer proof.")
        return redirect("/checkout/")
    if receipt.size and receipt.size > (2 * 1024 * 1024):
        messages.error(request, "Receipt image must be 2MB or smaller.")
        return redirect("/checkout/")
    allowed_ext = {".jpg", ".jpeg", ".png", ".webp"}
    filename = str(receipt.name or "")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_ext:
        messages.error(request, "Receipt must be a JPG, PNG, or WebP image.")
        return redirect("/checkout/")
    if not getattr(receipt, "content_type", "").startswith("image/"):
        messages.error(request, "Receipt must be an image file.")
        return redirect("/checkout/")

    with transaction.atomic():
        subscription = Subscription.objects.create(
            user=request.user,
            organization=org,
            plan=plan,
            status="pending",
            billing_cycle=billing,
            retention_days=plan.retention_days or 30,
            addon_count=addon_count if plan.allow_addons else 0,
            addon_next_cycle_count=addon_count if plan.allow_addons else 0,
        )
        if storage_plan:
            if currency.lower() == "usd":
                amount = storage_plan.usd_monthly_price if billing == "monthly" else storage_plan.usd_yearly_price
            else:
                amount = storage_plan.monthly_price_inr if billing == "monthly" else storage_plan.yearly_price_inr
        else:
            amount = _plan_price(plan, currency, billing) or 0
            amount = float(amount or 0) + (float(_addon_price(plan, currency, billing) or 0) * addon_count)
        PendingTransfer.objects.create(
            organization=org,
            user=request.user,
            plan=plan,
            request_type="new",
            billing_cycle=billing,
            retention_days=plan.retention_days or 30,
            addon_count=addon_count if plan.allow_addons else 0,
            currency=currency.upper(),
            amount=float(amount or 0),
            status="pending",
            reference_no=utr_number,
            paid_on=paid_on,
            receipt=receipt,
            notes=notes,
        )

    for key in (
        "selected_product_slug",
        "selected_plan_id",
        "selected_currency",
        "selected_billing",
        "selected_addon_count",
    ):
        request.session.pop(key, None)

    messages.success(request, "Payment request submitted. We will activate your plan soon.")
    return redirect("/my-account/")


@login_required(login_url="/auth/login/")
def billing_renew_start(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    product_slug = _normalize_product_slug(request.GET.get("product"))
    requested_plan_id = request.GET.get("plan") or request.GET.get("plan_id")
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")
    if org:
        pending_exists = PendingTransfer.objects.filter(
            organization=org,
            status__in=["pending", "draft"],
            request_type="renew",
        ).filter(
            Q(plan__product__slug=product_slug) | Q(plan__product__isnull=True)
        ).exists()
        if pending_exists:
            messages.info(request, "Renewal already submitted. Awaiting admin approval.")
            return redirect("/my-account/")
    latest = None
    if requested_plan_id:
        try:
            requested_plan_id_int = int(requested_plan_id)
        except (TypeError, ValueError):
            requested_plan_id_int = None
        if requested_plan_id_int:
            requested_plan = (
                Plan.objects
                .filter(id=requested_plan_id_int)
                .select_related("product")
                .first()
            )
            if requested_plan:
                plan_product_slug = _normalize_product_slug(
                    requested_plan.product.slug if requested_plan.product else product_slug
                )
                if plan_product_slug:
                    product_slug = plan_product_slug
                latest = (
                    Subscription.objects
                    .filter(organization=org, plan_id=requested_plan.id)
                    .select_related("plan", "plan__product")
                    .order_by("-start_date", "-id")
                    .first()
                )
                if not latest:
                    history = (
                        SubscriptionHistory.objects
                        .filter(organization=org, plan_id=requested_plan.id)
                        .select_related("plan", "plan__product")
                        .order_by("-start_date", "-id")
                        .first()
                    )
                    if history:
                        latest = SimpleNamespace(
                            plan=history.plan,
                            plan_id=history.plan_id,
                            billing_cycle=history.billing_cycle or "monthly",
                            addon_count=0,
                            addon_next_cycle_count=0,
                        )
    if not latest:
        latest = _latest_subscription_for_product(org, product_slug)
    if not latest or not latest.plan:
        messages.error(request, "No previous subscription found to renew.")
        return redirect("/pricing/")
    if is_free_plan(latest.plan):
        if not is_subscription_active(latest):
            messages.error(request, "Free trial expired. Please choose a paid plan.")
        else:
            messages.info(request, "Free trial plan does not require renewal.")
        _clear_renew_session(request)
        return redirect(f"/pricing/?product={product_slug}")

    request.session["renew_product_slug"] = product_slug
    request.session["renew_plan_id"] = latest.plan_id
    request.session["renew_currency"] = "inr"
    request.session["renew_billing"] = latest.billing_cycle or "monthly"
    request.session["renew_addon_count"] = _subscription_next_cycle_addon_count(latest)
    request.session.modified = True
    return redirect("/my-account/billing/renew/")


@login_required(login_url="/auth/login/")
def billing_renew_view(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")

    plan_id = request.session.get("renew_plan_id")
    product_slug = _normalize_product_slug(request.session.get("renew_product_slug"))
    currency = request.session.get("renew_currency") or "inr"
    billing = request.session.get("renew_billing") or "monthly"
    addon_count = int(request.session.get("renew_addon_count") or 0)

    plan = Plan.objects.filter(id=plan_id).select_related("product").first() if plan_id else None
    if not plan:
        messages.error(request, "Please choose a plan to renew.")
        _clear_renew_session(request)
        return redirect("/pricing/")
    if is_free_plan(plan):
        messages.error(request, "Free trial plan cannot be renewed. Please select a paid plan.")
        _clear_renew_session(request)
        return redirect(f"/pricing/?product={product_slug}")

    currency = currency if currency in ("inr", "usd") else "inr"
    billing = billing if billing in ("monthly", "yearly") else "monthly"
    if not plan.allow_addons:
        addon_count = 0

    pending_renewal = False
    if org:
        pending_renewal = PendingTransfer.objects.filter(
            organization=org,
            status__in=["pending", "draft"],
            request_type="renew",
        ).filter(
            Q(plan__product__slug=product_slug) | Q(plan__product__isnull=True)
        ).exists()

    request.session["renew_currency"] = currency
    request.session["renew_billing"] = billing
    request.session["renew_addon_count"] = int(addon_count)

    base_price = float(_plan_price(plan, currency, billing) or 0)
    addon_price = float(_addon_price(plan, currency, billing) or 0)
    total_price = base_price + (addon_price * max(0, addon_count))

    context.update({
        "selected_plan": plan,
        "selected_plan_name": _display_plan_name(plan),
        "selected_product_slug": product_slug,
        "selected_currency": currency,
        "selected_billing": billing,
        "addon_count": addon_count,
        "base_price": base_price,
        "addon_price": addon_price,
        "total_price": total_price,
        "has_pending_renewal": pending_renewal,
        "show_billing_tab": True,
        "show_ticketing_tab": _is_org_admin_account(request, org, profile),
    })
    return render(request, "public/billing_renew.html", context)


@require_POST
@login_required(login_url="/auth/login/")
def billing_renew_confirm(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    plan_id = request.session.get("renew_plan_id")
    product_slug = _normalize_product_slug(request.session.get("renew_product_slug"))
    currency = request.session.get("renew_currency") or "inr"
    billing = request.session.get("renew_billing") or "monthly"

    plan = Plan.objects.filter(id=plan_id).select_related("product").first() if plan_id else None
    if not plan:
        messages.error(request, "Please choose a plan to renew.")
        _clear_renew_session(request)
        return redirect("/pricing/")
    if is_free_plan(plan):
        messages.error(request, "Free trial plan cannot be renewed. Please select a paid plan.")
        _clear_renew_session(request)
        return redirect(f"/pricing/?product={product_slug}")

    currency = currency if currency in ("inr", "usd") else "inr"
    billing = billing if billing in ("monthly", "yearly") else "monthly"

    try:
        addon_count = int(request.POST.get("addon_count") or 0)
    except (TypeError, ValueError):
        addon_count = 0
    addon_count = max(0, addon_count)
    if not plan.allow_addons:
        addon_count = 0

    utr_number = (request.POST.get("utr_number") or "").strip()
    paid_on = request.POST.get("paid_on") or None
    notes = (request.POST.get("notes") or "").strip()
    receipt = request.FILES.get("receipt")

    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")
    if org:
        has_pending = PendingTransfer.objects.filter(
            organization=org,
            status__in=["pending", "draft"],
            request_type="renew",
        ).filter(
            Q(plan__product__slug=product_slug) | Q(plan__product__isnull=True)
        ).exists()
        if has_pending:
            log_event(
                "renew_submitted",
                status="blocked",
                org=org,
                user=request.user,
                product_slug=product_slug,
                meta={
                    "reason": "already_pending",
                    "plan_id": plan.id,
                    "billing_cycle": billing,
                    "addon_count": addon_count,
                },
                request=request,
            )
            messages.info(request, "A renewal request is already pending approval.")
            return redirect("/my-account/")

    if not receipt:
        messages.error(request, "Please upload payment proof.")
        return redirect("/my-account/billing/renew/")
    if receipt.size and receipt.size > (1 * 1024 * 1024):
        messages.error(request, "Payment proof must be 1MB or smaller.")
        return redirect("/my-account/billing/renew/")
    allowed_ext = {".jpg", ".jpeg", ".png", ".pdf"}
    filename = str(receipt.name or "")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in allowed_ext:
        messages.error(request, "Allowed file types: JPG, JPEG, PNG, PDF.")
        return redirect("/my-account/billing/renew/")
    content_type = (getattr(receipt, "content_type", "") or "").lower()
    allowed_content_types = {"image/jpeg", "image/png", "application/pdf"}
    if content_type and content_type not in allowed_content_types:
        messages.error(request, "Invalid file type. Allowed: JPG, JPEG, PNG, PDF.")
        return redirect("/my-account/billing/renew/")

    amount = float(_plan_price(plan, currency, billing) or 0)
    addon_price = float(_addon_price(plan, currency, billing) or 0)
    amount = amount + (addon_price * addon_count)

    with transaction.atomic():
        latest = _latest_subscription_for_product(org, product_slug)
        if latest:
            # Keep current subscription active until the transfer is approved.
            pass

        transfer = PendingTransfer.objects.create(
            organization=org,
            user=request.user,
            plan=plan,
            request_type="renew",
            billing_cycle=billing,
            retention_days=plan.retention_days or 30,
            addon_count=addon_count,
            currency=currency.upper(),
            amount=float(amount or 0),
            status="pending",
            reference_no=utr_number,
            paid_on=paid_on,
            receipt=receipt,
            notes=notes,
        )

    log_event(
        "renew_submitted",
        status="pending",
        org=org,
        user=request.user,
        product_slug=product_slug,
        meta={
            "plan_id": plan.id,
            "billing_cycle": billing,
            "addon_count": addon_count,
            "currency": currency.upper(),
            "amount": float(amount or 0),
            "subscription_id": latest.id if latest else None,
            "pendingtransfer_id": transfer.id,
        },
        request=request,
    )

    for key in (
        "renew_product_slug",
        "renew_plan_id",
        "renew_currency",
        "renew_billing",
        "renew_addon_count",
    ):
        request.session.pop(key, None)

    messages.success(request, "Renewal submitted. We will activate your plan soon.")
    return redirect("/my-account/")


@login_required(login_url="/auth/login/")
def billing_addons_manage(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")
    product_slug = _normalize_product_slug(request.GET.get("product") or request.POST.get("product"))
    if not product_slug:
        messages.error(request, "Product is required.")
        return redirect("/my-account/")

    sub = _active_subscription_for_product(org, product_slug)
    if not sub or not sub.plan:
        messages.error(request, "No active subscription found for this product.")
        return redirect("/my-account/")
    if not sub.plan.allow_addons:
        messages.info(request, "Add-on users are not available for this plan.")
        return redirect("/my-account/")

    now = timezone.now()
    current_addons = int(sub.addon_count or 0)
    scheduled_addons = _subscription_next_cycle_addon_count(sub)
    temporary_window = _subscription_temporary_addon_window(sub, now=now)
    existing_user_count = Employee.objects.filter(org=org).count() if org else 0
    currency = ((request.GET.get("currency") or request.POST.get("currency") or "INR").strip().upper())
    if currency not in ("INR", "USD"):
        currency = "INR"
    pending_addon = (
        PendingTransfer.objects
        .filter(
            organization=org,
            plan=sub.plan,
            request_type="addon",
            status__in=("pending", "draft"),
        )
        .order_by("-created_at")
        .first()
    )

    target_addons = scheduled_addons
    if request.method == "POST":
        try:
            target_addons = int(request.POST.get("target_addon_count") or scheduled_addons)
        except (TypeError, ValueError):
            target_addons = scheduled_addons
        target_addons = max(0, target_addons)
        if target_addons == scheduled_addons:
            messages.info(request, "No add-on user change detected.")
            return redirect(f"/my-account/billing/addons/?product={product_slug}")

        if target_addons < current_addons:
            sub.addon_next_cycle_count = target_addons
            sub.save(update_fields=["addon_next_cycle_count"])
            reduced_for_next_cycle = current_addons - target_addons
            if reduced_for_next_cycle > 0:
                end_date = sub.end_date
                if end_date:
                    messages.success(
                        request,
                        f"Next billing add-on users set to {target_addons}. "
                        f"You still have {reduced_for_next_cycle} extra add-on user seat{'s' if reduced_for_next_cycle != 1 else ''} available until {end_date.strftime('%d %b %Y')}.",
                    )
                else:
                    messages.success(
                        request,
                        f"Next billing add-on users set to {target_addons}. You can still use up to {current_addons} add-on users in the current cycle.",
                    )
            else:
                messages.success(request, "Next billing cycle add-on target updated.")
            return redirect(f"/my-account/billing/addons/?product={product_slug}")

        if target_addons <= current_addons:
            sub.addon_next_cycle_count = target_addons
            sub.save(update_fields=["addon_next_cycle_count"])
            messages.success(request, f"Next billing add-on users updated to {target_addons}.")
            return redirect(f"/my-account/billing/addons/?product={product_slug}")

        if pending_addon:
            messages.info(request, "An add-on payment request is already pending approval.")
            return redirect(f"/my-account/bank-transfer/{pending_addon.id}/")

        addon_delta = target_addons - current_addons
        preview = _addon_proration_preview(sub, currency=currency.lower(), addon_delta=addon_delta)
        if preview["amount"] <= 0:
            messages.error(request, "Unable to calculate add-on proration amount.")
            return redirect(f"/my-account/billing/addons/?product={product_slug}")
        transfer = PendingTransfer.objects.create(
            organization=org,
            user=request.user,
            plan=sub.plan,
            request_type="addon",
            billing_cycle=sub.billing_cycle or "monthly",
            retention_days=sub.retention_days or (sub.plan.retention_days if sub.plan else 30),
            addon_count=addon_delta,
            currency=currency,
            amount=float(preview["amount"]),
            status="draft",
            notes=(
                f"{preview['description']} Current add-ons: {current_addons}. "
                f"Current next-cycle add-ons: {scheduled_addons}. "
                f"Requested total add-ons after approval: {target_addons}."
            ),
        )
        messages.info(request, "Add-on payment request created. Complete bank transfer submission to continue.")
        return redirect(f"/my-account/bank-transfer/{transfer.id}/")
    else:
        try:
            target_addons = int(request.GET.get("target") or scheduled_addons)
        except (TypeError, ValueError):
            target_addons = scheduled_addons
        target_addons = max(0, target_addons)

    addon_delta_preview = max(0, target_addons - current_addons)
    preview = _addon_proration_preview(sub, currency=currency.lower(), addon_delta=addon_delta_preview) if addon_delta_preview else None

    context.update({
        "organization": org,
        "addon_subscription": sub,
        "addon_existing_user_count": existing_user_count,
        "addon_current_count": current_addons,
        "addon_scheduled_count": scheduled_addons,
        "addon_target_count": target_addons,
        "addon_delta_preview": addon_delta_preview,
        "addon_currency": currency,
        "addon_pending_transfer": pending_addon,
        "addon_proration_preview": preview,
        "addon_temporary_extra_count": temporary_window["extra"],
        "addon_temporary_extra_until": temporary_window["until"],
        "show_billing_tab": True,
        "show_ticketing_tab": _is_org_admin_account(request, org, profile),
    })
    return render(request, "public/billing_addons.html", context)


@login_required
def account_view(request):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "products"
    verification_banner_text = request.session.pop("email_verification_banner_text", "")
    verification_banner_level = request.session.pop("email_verification_banner_level", "warning")
    if not verification_banner_text:
        verification_banner_text = (
            f"Verification pending for {request.user.email or ''}. "
            "Please check your inbox and spam folder."
        ).strip()
    if request.user.email and not request.user.email_verified:
        context.update(
            {
                "email_verification_required": True,
                "email_verification_address": request.user.email or "",
                "email_verification_banner_text": verification_banner_text,
                "email_verification_banner_level": verification_banner_level,
            }
        )
        return render(request, "public/account_verification_required.html", context)
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    show_ticketing_tab = _is_org_admin_account(request, org, profile)
    can_view_billing = _has_account_billing_access(request.user, org, profile)
    accessible_product_slugs = _accessible_account_product_slugs(request.user, org, profile)
    is_saas_admin = bool(
        request.user.is_superuser
        or (profile and profile.role in ("superadmin", "super_admin"))
    )
    is_agent = bool(profile and profile.role == "ai_chatbot_agent")
    subs = (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan", "plan__product")
        .order_by("-start_date")
    )
    subs = list(subs)
    if accessible_product_slugs:
        subs = [
            sub for sub in subs
            if _plan_product_slug(getattr(sub, "plan", None)) in accessible_product_slugs
        ]
    elif not can_view_billing and not is_agent:
        subs = []
    storage_subs = []
    try:
        from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
        storage_subs = (
            StorageOrgSubscription.objects
            .filter(organization=org)
            .select_related("plan", "product")
            .order_by("-updated_at")
        )
        storage_subs = list(storage_subs)
    except Exception:
        storage_subs = []
    if accessible_product_slugs:
        storage_subs = [
            sub for sub in storage_subs
            if "storage" in accessible_product_slugs
        ]
    elif not can_view_billing and not is_agent:
        storage_subs = []
    if is_agent:
        subs = [
            sub for sub in subs
            if getattr(getattr(sub.plan, "product", None), "slug", "") == "ai-chatbot"
        ]
        if not subs:
            subs.append(SimpleNamespace(
                plan=None,
                plan_id=None,
                status="active",
                billing_cycle="",
                start_date=None,
                end_date=None,
                invoice_url="",
                product_slug="ai-chatbot",
                product_name="AI Chatbot",
                plan_rank=0,
                can_upgrade=False,
            ))
    max_rank_by_slug = {}
    for plan in Plan.objects.select_related("product").all():
        product = plan.product if plan else None
        slug = product.slug if product and product.slug else "monitor"
        rank = _plan_rank(plan)
        if rank > max_rank_by_slug.get(slug, 0):
            max_rank_by_slug[slug] = rank
    if storage_subs:
        try:
            from apps.backend.storage.models import Plan as StoragePlan
            max_storage_rank = 0
            for plan in StoragePlan.objects.all():
                max_storage_rank = max(max_storage_rank, _storage_plan_rank(plan))
            if max_storage_rank:
                max_rank_by_slug["storage"] = max_storage_rank
        except Exception:
            pass
    existing_slugs = set()
    for sub in subs:
        plan = sub.plan
        product = plan.product if plan else None
        slug = product.slug if product and product.slug else "monitor"
        existing_slugs.add(slug)
        sub.product_slug = slug
        sub.product_name = _display_product_name(product=product, slug=slug)
        sub.plan_rank = _plan_rank(plan)
        sub.can_upgrade = sub.plan_rank < max_rank_by_slug.get(slug, sub.plan_rank)
        sub.is_free_plan = is_free_plan(plan)
    for storage_sub in storage_subs:
        plan = storage_sub.plan
        slug = "storage"
        if slug in existing_slugs:
            continue
        storage_entry = SimpleNamespace(
            plan=plan,
            plan_id=storage_sub.plan_id,
            status=storage_sub.status,
            billing_cycle="monthly",
            start_date=storage_sub.created_at,
            end_date=storage_sub.renewal_date,
            invoice_url="",
            product_slug="storage",
            product_name=storage_sub.product.name if storage_sub.product else "Online Storage",
            plan_rank=_storage_plan_rank(plan),
            can_upgrade=False,
            is_free_plan=bool(plan and (plan.name or "").strip().lower() == "free"),
        )
        storage_entry.can_upgrade = storage_entry.plan_rank < max_rank_by_slug.get(
            "storage",
            storage_entry.plan_rank,
        )
        subs.append(storage_entry)
        existing_slugs.add(slug)

    history_rows = []
    if not is_agent and can_view_billing:
        history_rows = (
            SubscriptionHistory.objects
            .filter(organization=org, plan__isnull=False)
            .select_related("plan", "plan__product")
            .order_by("-start_date")
        )
    history_by_slug = {}
    for row in history_rows:
        plan = row.plan
        product = plan.product if plan else None
        slug = product.slug if product and product.slug else "monitor"
        if slug not in history_by_slug:
            history_by_slug[slug] = row

    for slug, row in history_by_slug.items():
        if slug in existing_slugs:
            continue
        subs.append(SimpleNamespace(
            plan=row.plan,
            plan_id=row.plan_id,
            status=row.status,
            billing_cycle=row.billing_cycle,
            start_date=row.start_date,
            end_date=row.end_date,
            invoice_url="",
        ))
    for sub in subs:
        if hasattr(sub, "product_slug") and hasattr(sub, "product_name"):
            sub.dashboard_path = _dashboard_path_for_product(getattr(sub, "product_slug", None))
            continue
        plan = sub.plan
        product = plan.product if plan else None
        slug = product.slug if product and product.slug else "monitor"
        sub.product_slug = slug
        sub.product_name = _display_product_name(product=product, slug=slug)
        sub.dashboard_path = _dashboard_path_for_product(slug)
        sub.plan_rank = _plan_rank(plan)
        sub.can_upgrade = sub.plan_rank < max_rank_by_slug.get(slug, sub.plan_rank)
        sub.is_free_plan = is_free_plan(plan)
    pending_renewal_rows = []
    if not is_agent and can_view_billing:
        pending_renewals = (
            PendingTransfer.objects
            .filter(organization=org, status__in=["pending", "draft"], request_type="renew")
            .select_related("plan", "plan__product")
            .order_by("-created_at")
        )
        for transfer in pending_renewals:
            product = transfer.plan.product if transfer.plan else None
            slug = product.slug if product else "monitor"
            pending_renewal_rows.append({
                "product_name": _display_product_name(product=product, slug=slug),
                "product_slug": slug,
                "plan_name": _display_plan_name(transfer.plan),
                "billing_cycle": transfer.billing_cycle,
                "status": transfer.status,
                "created_at": transfer.created_at,
                "amount": transfer.amount,
                "currency": transfer.currency,
            })
    pending_payment_rows = []
    if not is_agent and can_view_billing:
        pending_payments = (
            PendingTransfer.objects
            .filter(organization=org, status__in=["pending", "draft"])
            .exclude(request_type="renew")
            .select_related("plan", "plan__product")
            .order_by("-created_at")
        )
        for transfer in pending_payments:
            product = transfer.plan.product if transfer.plan else None
            pending_payment_rows.append({
                "product_name": _display_product_name(product=product, slug=product.slug if product else "monitor"),
                "product_slug": product.slug if product else "monitor",
                "plan_name": _display_plan_name(transfer.plan),
                "billing_cycle": transfer.billing_cycle,
                "status": transfer.status,
                "created_at": transfer.created_at,
                "amount": transfer.amount,
                "currency": transfer.currency,
            })
    approved_transfers = []
    if can_view_billing:
        approved_transfers = (
            PendingTransfer.objects
            .filter(organization=org, status="approved")
            .select_related("plan", "plan__product")
            .order_by("-paid_on", "-updated_at", "-id")
        )
    base_by_slug = {}
    addon_by_slug = {}
    for transfer in approved_transfers:
        product = transfer.plan.product if transfer.plan else None
        slug = product.slug if product and product.slug else "monitor"
        if transfer.request_type == "addon":
            if slug not in addon_by_slug:
                addon_by_slug[slug] = transfer
        else:
            if slug not in base_by_slug:
                base_by_slug[slug] = transfer
    for sub in subs:
        slug = getattr(sub, "product_slug", None) or "monitor"
        base_transfer = base_by_slug.get(slug)
        addon_transfer = addon_by_slug.get(slug)
        sub.display_plan_name = _display_plan_name(sub.plan)
        sub.info_plan_name = sub.display_plan_name
        sub.info_billing_cycle = sub.billing_cycle
        sub.info_status = sub.status
        sub.info_start_date = getattr(sub, "start_date", None)
        sub.info_expire_date = sub.end_date
        sub.info_plan_paid_on = (base_transfer.paid_on or base_transfer.updated_at) if base_transfer else None
        sub.info_plan_amount = base_transfer.amount if base_transfer else None
        sub.info_plan_currency = base_transfer.currency if base_transfer else "INR"
        sub.info_addon_count = (
            addon_transfer.addon_count
            if addon_transfer and addon_transfer.addon_count is not None
            else (sub.addon_count if hasattr(sub, "addon_count") else 0)
        )
        sub.info_addon_amount = addon_transfer.amount if addon_transfer else None
        sub.info_addon_currency = addon_transfer.currency if addon_transfer else "INR"
        sub.info_addon_paid_on = (addon_transfer.paid_on or addon_transfer.updated_at) if addon_transfer else None
        sub.invoice_url = ""
    active_subs = []
    expired_subs = []
    for sub in subs:
        status = getattr(sub, "status", "") or ""
        if status == "expired":
            expired_subs.append(sub)
        elif status == "pending":
            continue
        else:
            active_subs.append(sub)
    # Keep only latest active subscription per product
    latest_by_slug = {}
    for sub in active_subs:
        slug = getattr(sub, "product_slug", None) or "monitor"
        current = latest_by_slug.get(slug)
        if not current:
            latest_by_slug[slug] = sub
            continue
        current_date = getattr(current, "start_date", None) or getattr(current, "end_date", None)
        sub_date = getattr(sub, "start_date", None) or getattr(sub, "end_date", None)
        if sub_date and (not current_date or sub_date > current_date):
            latest_by_slug[slug] = sub
    active_subs = list(latest_by_slug.values())
    active_slugs = {sub.product_slug for sub in active_subs if getattr(sub, "product_slug", None)}
    for row in pending_payment_rows:
        if row.get("product_slug"):
            active_slugs.add(row["product_slug"])
    for row in pending_renewal_rows:
        if row.get("product_slug"):
            active_slugs.add(row["product_slug"])
    expired_subs = [sub for sub in expired_subs if sub.product_slug not in active_slugs]
    context.update({
        "organization": org,
        "subscriptions": active_subs,
        "expired_subscriptions": expired_subs,
        "pending_payment_rows": pending_payment_rows,
        "is_saas_admin": is_saas_admin,
        "is_agent": is_agent,
        "show_billing_tab": can_view_billing and not is_agent,
        "show_account_billing_sections": can_view_billing and not is_agent,
        "show_ticketing_tab": show_ticketing_tab,
        "pending_renewal_rows": pending_renewal_rows,
        "email_verification_required": bool(request.user.email and not request.user.email_verified),
        "email_verification_address": request.user.email or "",
        "email_verification_banner_text": verification_banner_text,
        "email_verification_banner_level": verification_banner_level,
    })
    return render(request, "public/account.html", context)


@require_POST
@login_required(login_url="/auth/login/")
def account_resend_verification(request):
    if request.user.email_verified:
        request.session["email_verification_banner_level"] = "success"
        request.session["email_verification_banner_text"] = "Email already verified."
        return redirect("/my-account/")
    post_verify_next = str(request.session.get("post_verify_next") or "").strip()
    if not post_verify_next.startswith("/"):
        post_verify_next = None
    sent = send_email_verification(
        request.user,
        request=request,
        force=True,
        next_path=post_verify_next,
    )
    if sent:
        request.session["email_verification_banner_level"] = "success"
        request.session["email_verification_banner_text"] = (
            f"Verification email sent again to {request.user.email}. "
            "Please check your inbox and spam folder."
        )
    else:
        request.session["email_verification_banner_level"] = "warning"
        request.session["email_verification_banner_text"] = (
            f"Verification pending for {request.user.email}. "
            "Unable to send now. Please update your email and try again."
        )
    return redirect("/my-account/")


@require_POST
@login_required(login_url="/auth/login/")
def account_update_verification_email(request):
    email = (request.POST.get("verification_email") or "").strip().lower()
    if not email:
        request.session["email_verification_banner_level"] = "warning"
        request.session["email_verification_banner_text"] = "Email is required."
        return redirect("/my-account/")
    existing = User.objects.filter(email__iexact=email).exclude(id=request.user.id).exists()
    if existing:
        request.session["email_verification_banner_level"] = "warning"
        request.session["email_verification_banner_text"] = "This email is already in use."
        return redirect("/my-account/")
    request.user.email = email
    request.user.email_verified = False
    request.user.email_verified_at = None
    request.user.save(update_fields=["email", "email_verified", "email_verified_at"])
    post_verify_next = str(request.session.get("post_verify_next") or "").strip()
    if not post_verify_next.startswith("/"):
        post_verify_next = None
    sent = send_email_verification(
        request.user,
        request=request,
        force=True,
        next_path=post_verify_next,
    )
    if sent:
        request.session["email_verification_banner_level"] = "success"
        request.session["email_verification_banner_text"] = (
            f"Verification email sent now to {email}. "
            "Please check your inbox and spam folder."
        )
    else:
        request.session["email_verification_banner_level"] = "warning"
        request.session["email_verification_banner_text"] = (
            f"Verification pending for {email}. "
            "Email updated but verification mail failed to send."
        )
    return redirect("/my-account/")


@login_required
def billing_view(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    profile = UserProfile.objects.filter(user=request.user).first()
    if profile and profile.role == "ai_chatbot_agent":
        return redirect("/my-account/")
    org = _resolve_org_for_user(request.user)
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")
    show_ticketing_tab = _is_org_admin_account(request, org, profile)
    profile = BillingProfile.objects.filter(organization=org).first()
    product_slug = (request.GET.get("product") or "all").strip().lower()
    if product_slug == "worksuite":
        product_slug = "monitor"
    billing_products = _billing_products_for_org(org)
    allowed_slugs = {item["slug"] for item in billing_products}
    if product_slug != "all" and product_slug not in allowed_slugs:
        product_slug = "all"
    phone_value = ""
    if profile and profile.phone:
        phone_value = profile.phone
    else:
        user_profile = UserProfile.objects.filter(user=request.user).first()
        if user_profile and user_profile.phone_number:
            phone_value = user_profile.phone_number
    phone_country, phone_number = _split_phone_number(phone_value)

    if request.method == "POST":
        action = (request.POST.get("billing_action") or "").strip()
        if action == "save_profile":
            profile, _ = _save_billing_profile_from_request(request, org, profile)

    product_filter = Q()
    if product_slug and product_slug != "all":
        product_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter |= Q(plan__product__isnull=True)

    def _plan_product_slug(plan_obj):
        if not plan_obj:
            return ""
        product_obj = getattr(plan_obj, "product", None)
        if product_obj and getattr(product_obj, "slug", ""):
            return product_obj.slug
        return "monitor"

    def _base_user_limit_for_plan(plan_obj):
        if not plan_obj:
            return None
        product_obj = getattr(plan_obj, "product", None)
        product_slug_local = (getattr(product_obj, "slug", "") or "monitor").strip().lower()
        limits = getattr(plan_obj, "limits", {}) or {}
        if product_slug_local in ("storage", "online-storage"):
            value = limits.get("max_users", limits.get("user_limit", 0))
            return None if not value else int(value)
        if product_slug_local == "ai-chatbot":
            value = limits.get("included_agents", getattr(plan_obj, "included_agents", 0))
            return None if not value else int(value)
        employee_limit = getattr(plan_obj, "employee_limit", 0) or 0
        if employee_limit == 0:
            return None
        return int(employee_limit)

    def _user_count_label(plan_obj, addon_count_value=0):
        if not plan_obj:
            return "-"
        base_limit = _base_user_limit_for_plan(plan_obj)
        addon_count_value = int(addon_count_value or 0)
        if base_limit is None:
            if addon_count_value > 0:
                return f"Unlimited (+{addon_count_value} add-on)"
            return "Unlimited"
        total = max(base_limit, 0) + max(addon_count_value, 0)
        if addon_count_value > 0:
            return f"{total} ({base_limit} + {addon_count_value} add-on)"
        return str(base_limit)

    approved_transfers_qs = (
        PendingTransfer.objects
        .filter(organization=org, status="approved")
        .filter(product_filter)
        .select_related("plan", "plan__product")
        .order_by("-paid_on", "-id")
    )
    approved_transfers = list(approved_transfers_qs)
    approved_plan_ids = {transfer.plan_id for transfer in approved_transfers if transfer.plan_id}
    subscription_filter = Q()
    if product_slug and product_slug != "all":
        subscription_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            subscription_filter |= Q(plan__product__isnull=True)
    active_subs = (
        Subscription.objects
        .filter(organization=org, status__in=("active", "trialing"))
        .filter(subscription_filter)
        .select_related("plan", "plan__product")
        .order_by("-start_date")
    )
    active_sub_map = {}
    for sub in active_subs:
        slug_key = _plan_product_slug(sub.plan)
        if slug_key and slug_key not in active_sub_map:
            active_sub_map[slug_key] = sub
    for sub in active_subs:
        if sub.plan_id in approved_plan_ids:
            continue
        plan = sub.plan
        amount = None
        if plan:
            if sub.billing_cycle == "yearly":
                amount = plan.yearly_price if plan.yearly_price is not None else plan.price
            else:
                amount = plan.monthly_price if plan.monthly_price is not None else plan.price
        approved_transfers.append(SimpleNamespace(
            id=None,
            plan=plan,
            billing_cycle=sub.billing_cycle,
            amount=amount or 0,
            currency="INR",
            paid_on=sub.start_date,
            status="approved",
            request_type="base",
            addon_count=sub.addon_count or 0,
        ))
    def _billing_sort_dt(transfer):
        value = (
            transfer.paid_on
            or getattr(transfer, "updated_at", None)
            or getattr(transfer, "created_at", None)
            or timezone.now()
        )
        if isinstance(value, datetime):
            return value if timezone.is_aware(value) else timezone.make_aware(value, timezone.get_current_timezone())
        if isinstance(value, date):
            dt = datetime.combine(value, datetime.min.time())
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return timezone.now()

    approved_transfers.sort(key=_billing_sort_dt, reverse=True)

    for transfer in approved_transfers:
        slug_key = _plan_product_slug(getattr(transfer, "plan", None))
        active_sub_for_product = active_sub_map.get(slug_key)
        transfer.user_count_display = _user_count_label(
            getattr(transfer, "plan", None),
            getattr(active_sub_for_product, "addon_count", None),
        )
        transfer.show_addon_button = bool(
            getattr(getattr(transfer, "plan", None), "allow_addons", False) and slug_key
        )
        transfer.addon_manage_url = f"/my-account/billing/addons/?product={slug_key}" if slug_key else ""

    pending_transfers = (
        PendingTransfer.objects
        .filter(organization=org, status__in=["pending", "draft"])
        .filter(product_filter)
        .select_related("plan", "plan__product")
        .order_by("-created_at", "-id")
    )
    rejected_transfers = (
        PendingTransfer.objects
        .filter(organization=org, status="rejected")
        .filter(product_filter)
        .select_related("plan", "plan__product")
        .order_by("-updated_at", "-id")
    )
    history = (
        SubscriptionHistory.objects
        .filter(organization=org)
        .filter(product_filter if product_slug != "all" else Q())
        .select_related("plan", "plan__product")
        .order_by("-created_at")
    )

    billing_activity = []
    for entry in history:
        if entry.status and entry.status != "active":
            product = entry.plan.product if entry.plan else None
            billing_activity.append({
                "type": "Subscription",
                "product_name": _display_product_name(product=product, slug=product.slug if product else "monitor"),
                "plan": entry.plan.name if entry.plan else "-",
                "status": entry.status,
                "billing_cycle": entry.billing_cycle or "monthly",
                "date": entry.end_date or entry.created_at,
            })
    for transfer in rejected_transfers:
        product = transfer.plan.product if transfer.plan else None
        billing_activity.append({
            "type": "Payment",
            "product_name": _display_product_name(product=product, slug=product.slug if product else "monitor"),
            "plan": transfer.plan.name if transfer.plan else "-",
            "status": transfer.status,
            "billing_cycle": transfer.billing_cycle or "monthly",
            "date": transfer.updated_at or transfer.created_at,
        })

    context.update({
        "organization": org,
        "billing_profile": profile,
        "approved_transfers": approved_transfers,
        "pending_transfers": pending_transfers,
        "billing_activity": billing_activity,
        "billing_profile_email": (profile.email if profile and profile.email else request.user.email),
        "billing_profile_phone": phone_value,
        "billing_phone_country": phone_country,
        "billing_phone_number": phone_number,
        "billing_product_slug": product_slug,
        "billing_products": billing_products,
        "show_billing_tab": True,
        "show_ticketing_tab": show_ticketing_tab,
    })
    return render(request, "public/billing.html", context)


@login_required(login_url="/auth/login/")
def account_bank_transfer(request, transfer_id=None):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not org:
        messages.error(request, "Organization not found.")
        return redirect("/my-account/")
    if not _has_account_billing_access(request.user, org, profile):
        messages.error(request, "Billing access is available only for organization admins.")
        return redirect("/my-account/")

    transfer = None
    if transfer_id is not None:
        transfer = PendingTransfer.objects.filter(
            id=transfer_id,
            organization=org,
        ).select_related("plan").first()
    if not transfer:
        messages.error(request, "No pending payment request found.")
        return redirect("/my-account/billing/")

    if request.method == "POST":
        reference_no = (request.POST.get("reference_no") or "").strip()
        paid_on = request.POST.get("paid_on") or None
        notes = (request.POST.get("notes") or "").strip()
        receipt = request.FILES.get("receipt")
        if not reference_no:
            messages.error(request, "Reference / UTR number is required.")
            return redirect(request.get_full_path())
        transfer.reference_no = reference_no
        if paid_on:
            transfer.paid_on = paid_on
        if notes:
            transfer.notes = notes
        if receipt:
            transfer.receipt = receipt
        transfer.status = "pending"
        transfer.save()
        messages.success(request, "Payment submitted. We will verify and activate your account.")
        return redirect("/my-account/billing/")

    seller = InvoiceSellerProfile.objects.order_by("-updated_at").first()
    bank_account_details = seller.bank_account_details if seller else ""
    seller_upi_id = (seller.upi_id or "").strip() if seller else ""
    context.update({
        "org": org,
        "transfer": transfer,
        "bank_account_details": bank_account_details,
        "seller_upi_id": seller_upi_id,
        "transfer_description": (transfer.notes or "").strip() if transfer and transfer.request_type == "addon" else "",
        "show_billing_tab": True,
        "show_ticketing_tab": _is_org_admin_account(request, org, profile),
    })
    return render(request, "payments/bank_transfer.html", context)


@login_required
def profile_view(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "profile"
    profile = UserProfile.objects.filter(user=request.user).first()
    org = _resolve_org_for_user(request.user)

    if request.method == "POST":
        form_action = str(request.POST.get("form_action") or "profile").strip().lower()
        if form_action == "password":
            current_password = str(request.POST.get("current_password") or "").strip()
            new_password = str(request.POST.get("new_password") or "").strip()
            confirm_password = str(request.POST.get("confirm_password") or "").strip()
            if not current_password:
                messages.error(request, "Current password is required.")
            elif not new_password:
                messages.error(request, "New password is required.")
            elif not confirm_password:
                messages.error(request, "Confirm password is required.")
            elif new_password != confirm_password:
                messages.error(request, "New password and confirm password must match.")
            elif not request.user.check_password(current_password):
                messages.error(request, "Current password is incorrect.")
            else:
                try:
                    validate_password(new_password, user=request.user)
                    request.user.set_password(new_password)
                    request.user.save(update_fields=["password"])
                    update_session_auth_hash(request, request.user)
                    messages.success(request, "Password updated successfully.")
                except ValidationError as error:
                    messages.error(request, " ".join(error.messages))
            return redirect("/my-account/profile/")

        phone_number = (request.POST.get("phone_number") or "").strip()
        if not phone_number:
            messages.error(request, "Phone number is required.")
            return redirect("/my-account/profile/")

        request.user.first_name = (request.POST.get("first_name") or "").strip()
        request.user.last_name = (request.POST.get("last_name") or "").strip()
        new_username = (request.POST.get("username") or "").strip()
        old_username = (request.user.username or "").strip()
        if not new_username:
            messages.error(request, "Username is required.")
            return redirect("/my-account/profile/")
        if len(new_username) < 5:
            messages.error(request, "Username must be at least 5 characters.")
            return redirect("/my-account/profile/")
        if not re.match(r"^[A-Za-z0-9_.-]+$", new_username):
            messages.error(
                request,
                "Username can contain only letters, numbers, dot, underscore, and hyphen.",
            )
            return redirect("/my-account/profile/")
        if old_username.lower() != new_username.lower():
            if User.objects.filter(username__iexact=new_username).exclude(id=request.user.id).exists():
                messages.error(request, "This username is already in use. Please change your username.")
                return redirect("/my-account/profile/")
        request.user.username = new_username
        email = (request.POST.get("email") or "").strip()
        if email:
            old_email = (request.user.email or "").strip().lower()
            new_email = email.lower()
            if old_email != new_email:
                if User.objects.filter(email__iexact=new_email).exclude(id=request.user.id).exists():
                    messages.error(request, "Email already in use.")
                    return redirect("/my-account/profile/")
                request.user.email_verified = False
                request.user.email_verified_at = None
            request.user.email = email
        request.user.save()
        if email and old_email != new_email:
            send_email_verification(request.user, request=request, force=True)

        if not profile:
            profile = UserProfile(user=request.user)
        profile.phone_number = phone_number
        profile.save()
        messages.success(request, "Profile updated.")
        return redirect("/my-account/profile/")

    context.update({
        "profile": profile,
        "show_billing_tab": _has_account_billing_access(request.user, org, profile),
        "show_ticketing_tab": _is_org_admin_account(request, org, profile),
    })
    return render(request, "public/profile.html", context)


@login_required
@require_http_methods(["GET"])
def profile_check_username(request):
    username = (request.GET.get("username") or "").strip()
    if not username:
        return JsonResponse(
            {"ok": False, "available": False, "message": "Username is required."},
            status=400,
        )
    if len(username) < 5:
        return JsonResponse(
            {"ok": False, "available": False, "message": "Username must be at least 5 characters."},
            status=400,
        )
    if not re.match(r"^[A-Za-z0-9_.-]+$", username):
        return JsonResponse(
            {
                "ok": False,
                "available": False,
                "message": "Username can contain only letters, numbers, dot, underscore, and hyphen.",
            },
            status=400,
        )

    exists = User.objects.filter(username__iexact=username).exclude(id=request.user.id).exists()
    return JsonResponse(
        {
            "ok": True,
            "available": not exists,
            "message": (
                "This username is already in use. Please change your username."
                if exists else
                "Username is available."
            ),
        }
    )


@login_required
def account_ticketing_view(request):
    if request.user.email and not request.user.email_verified:
        messages.info(request, "Please verify your email to access My Account pages.")
        return redirect("/my-account/")
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "ticketing"
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    if not org:
        messages.error(request, "Organization not found.")
        return redirect("/my-account/")
    if not _is_org_admin_account(request, org, profile):
        messages.error(request, "Ticketing is available only for organization admins.")
        return redirect("/my-account/")

    _purge_closed_tickets(days=45)
    product_options = _ticket_product_options_for_org(org)
    allowed_product_slugs = {item["slug"] for item in product_options}
    selected_status = _normalize_ticket_status(request.GET.get("status"), default="")
    if str(request.GET.get("status") or "").strip() == "":
        selected_status = ""
    selected_category = _normalize_ticket_category(request.GET.get("category"), default="")
    if str(request.GET.get("category") or "").strip() == "":
        selected_category = ""
    requested_ticket_id = request.GET.get("ticket")
    selected_ticket_id = int(requested_ticket_id) if str(requested_ticket_id or "").isdigit() else None

    if request.method == "POST":
        action = str(request.POST.get("ticket_action") or "").strip().lower()
        redirect_ticket_id = selected_ticket_id

        if action == "create":
            category = _normalize_ticket_category(request.POST.get("category"), default="support")
            subject = str(request.POST.get("subject") or "").strip()
            message = str(request.POST.get("message") or "").strip()
            product_slug = _normalize_ticket_product_slug(request.POST.get("product_slug"), default="monitor")
            files = request.FILES.getlist("attachments")

            if not subject:
                messages.error(request, "Ticket subject is required.")
            elif not message:
                messages.error(request, "Ticket message is required.")
            elif product_slug not in allowed_product_slugs:
                messages.error(request, "Select a valid product.")
            else:
                file_error = _validate_ticket_attachments(files)
                if file_error:
                    messages.error(request, file_error)
                else:
                    with transaction.atomic():
                        ticket = OrgSupportTicket.objects.create(
                            organization=org,
                            created_by=request.user,
                            product_slug=product_slug,
                            category=category,
                            subject=subject,
                            status="open",
                            closed_at=None,
                        )
                        msg = OrgSupportTicketMessage.objects.create(
                            ticket=ticket,
                            author=request.user,
                            author_role="org_admin",
                            message=message,
                        )
                        for file_obj in files:
                            OrgSupportTicketAttachment.objects.create(
                                ticket=ticket,
                                message=msg,
                                file=file_obj,
                                uploaded_by=request.user,
                            )
                        now = timezone.now()
                        ticket.last_message_at = now
                        ticket.last_read_by_org_at = now
                        ticket.save(update_fields=["last_message_at", "last_read_by_org_at", "updated_at"])
                    messages.success(request, f"Ticket #{ticket.id} created.")
                    redirect_ticket_id = ticket.id
        elif action == "reply":
            ticket_id = request.POST.get("ticket_id")
            ticket = OrgSupportTicket.objects.filter(id=ticket_id, organization=org).first()
            message = str(request.POST.get("message") or "").strip()
            files = request.FILES.getlist("attachments")
            redirect_ticket_id = ticket.id if ticket else redirect_ticket_id
            if not ticket:
                messages.error(request, "Ticket not found.")
            elif not message:
                messages.error(request, "Reply message is required.")
            else:
                file_error = _validate_ticket_attachments(files)
                if file_error:
                    messages.error(request, file_error)
                else:
                    with transaction.atomic():
                        msg = OrgSupportTicketMessage.objects.create(
                            ticket=ticket,
                            author=request.user,
                            author_role="org_admin",
                            message=message,
                        )
                        for file_obj in files:
                            OrgSupportTicketAttachment.objects.create(
                                ticket=ticket,
                                message=msg,
                                file=file_obj,
                                uploaded_by=request.user,
                            )
                        now = timezone.now()
                        if ticket.status == "closed":
                            ticket.status = "open"
                            ticket.closed_at = None
                        ticket.last_message_at = now
                        ticket.last_read_by_org_at = now
                        ticket.save(update_fields=["status", "closed_at", "last_message_at", "last_read_by_org_at", "updated_at"])
                    messages.success(request, f"Reply added to ticket #{ticket.id}.")
        elif action == "status":
            ticket_id = request.POST.get("ticket_id")
            ticket = OrgSupportTicket.objects.filter(id=ticket_id, organization=org).first()
            next_status = _normalize_ticket_status(request.POST.get("status"), default="")
            redirect_ticket_id = ticket.id if ticket else redirect_ticket_id
            if not ticket:
                messages.error(request, "Ticket not found.")
            elif not next_status:
                messages.error(request, "Select a valid status.")
            elif ticket.status != next_status:
                ticket.status = next_status
                ticket.closed_at = timezone.now() if next_status == "closed" else None
                ticket.save(update_fields=["status", "closed_at", "updated_at"])
                OrgSupportTicketMessage.objects.create(
                    ticket=ticket,
                    author=request.user,
                    author_role="system",
                    message=f"Ticket status changed to {next_status.replace('_', ' ').title()}.",
                )
                messages.success(request, f"Ticket #{ticket.id} status updated.")

        redirect_url = "/my-account/ticketing/"
        params = []
        if selected_status:
            params.append(f"status={selected_status}")
        if selected_category:
            params.append(f"category={selected_category}")
        if redirect_ticket_id:
            params.append(f"ticket={redirect_ticket_id}")
        if params:
            redirect_url = f"{redirect_url}?{'&'.join(params)}"
        return redirect(redirect_url)

    tickets = (
        OrgSupportTicket.objects
        .filter(organization=org)
        .prefetch_related("messages")
        .order_by("-updated_at", "-id")
    )
    if selected_status:
        tickets = tickets.filter(status=selected_status)
    if selected_category:
        tickets = tickets.filter(category=selected_category)
    tickets = list(tickets)

    selected_ticket = None
    if selected_ticket_id:
        for ticket in tickets:
            if ticket.id == selected_ticket_id:
                selected_ticket = ticket
                break
    if not selected_ticket and tickets:
        selected_ticket = tickets[0]

    if selected_ticket:
        selected_ticket.last_read_by_org_at = timezone.now()
        selected_ticket.save(update_fields=["last_read_by_org_at"])
        selected_ticket = (
            OrgSupportTicket.objects
            .select_related("created_by")
            .prefetch_related("messages__author", "messages__attachments")
            .get(id=selected_ticket.id)
        )
        selected_ticket.product_name = _ticket_product_label(selected_ticket.product_slug)

    ticket_rows = []
    for ticket in tickets:
        unread_qs = ticket.messages.filter(author_role="saas_admin")
        if ticket.last_read_by_org_at:
            unread_qs = unread_qs.filter(created_at__gt=ticket.last_read_by_org_at)
        latest_message = ticket.messages.order_by("-created_at", "-id").first()
        ticket_rows.append({
            "id": ticket.id,
            "subject": ticket.subject,
            "category": ticket.category,
            "status": ticket.status,
            "product_slug": ticket.product_slug,
            "product_name": _ticket_product_label(ticket.product_slug),
            "updated_at": ticket.updated_at,
            "latest_message_preview": (latest_message.message[:120] + "...") if latest_message and len(latest_message.message or "") > 120 else (latest_message.message if latest_message else ""),
            "unread_replies": unread_qs.count(),
        })

    ticket_messages = []
    if selected_ticket:
        for msg in selected_ticket.messages.all():
            ticket_messages.append({
                "id": msg.id,
                "author_role": msg.author_role,
                "author_name": _ticket_author_name(msg),
                "message": msg.message,
                "created_at": msg.created_at,
                "attachments": [
                    {
                        "url": attachment.file.url,
                        "name": os.path.basename(attachment.file.name or ""),
                    }
                    for attachment in msg.attachments.all()
                    if attachment.file
                ],
            })

    context.update({
        "organization": org,
        "profile": profile,
        "show_billing_tab": True,
        "show_ticketing_tab": True,
        "ticket_product_options": product_options,
        "ticket_rows": ticket_rows,
        "ticket_messages": ticket_messages,
        "ticket_selected": selected_ticket,
        "ticket_selected_status": selected_status,
        "ticket_selected_category": selected_category,
        "ticket_status_options": [
            ("", "All Status"),
            ("open", "Open"),
            ("in_progress", "In Progress"),
            ("resolved", "Resolved"),
            ("closed", "Closed"),
        ],
        "ticket_category_options": [
            ("", "All Categories"),
            ("support", "Support"),
            ("sales", "Sales"),
        ],
    })
    return render(request, "public/ticketing.html", context)


def sitemap_view(request):
    base = request.build_absolute_uri("/").rstrip("/")
    routes = ProductRouteMapping.objects.select_related("product").order_by("public_slug")

    static_paths = [
        "/",
        "/pricing/",
        "/contact/",
        "/about/",
        "/privacy/",
        "/terms/",
    ]
    product_paths = [f"/products/{route.public_slug}/" for route in routes]
    paths = static_paths + product_paths

    xml_lines = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    ]
    for path in paths:
        xml_lines.append("  <url>")
        xml_lines.append(f"    <loc>{base}{path}</loc>")
        xml_lines.append("  </url>")
    xml_lines.append("</urlset>")
    return HttpResponse("\n".join(xml_lines), content_type="application/xml")


def page_not_found(request, exception):
    return render(request, "public/404.html", status=404)
