from django.shortcuts import render
from django.http import Http404
from django.db import models
from django.db.utils import OperationalError, ProgrammingError
from django.http import JsonResponse
from django.utils.text import slugify
from django.views.decorators.http import require_http_methods
from .models import Plan, ChatWidget
from apps.backend.products.models import Product
from saas_admin.models import Product as SaaSAdminProduct
from core.subscription_utils import is_free_plan
from dashboard.views import get_active_org
from core.models import Subscription, SubscriptionHistory
from apps.backend.storage.models import Product as StorageProduct, Plan as StoragePlan, AddOn as StorageAddOn, OrgSubscription as StorageOrgSubscription
from apps.backend.enquiries.views import build_enquiry_context


def _normalize_product_slug(value):
    slug = (value or "").strip().lower()
    if slug == "worksuite":
        return "monitor"
    if slug == "online-storage":
        return "storage"
    return slug

def _public_product_slug(value):
    slug = (value or "").strip().lower()
    if slug == "monitor":
        return "worksuite"
    return slug

def _public_product_name(value, slug):
    if slug == "monitor":
        return "Work Suite"
    if slug == "whatsapp-automation":
        return "WhatsApp Automation"
    return value


def _normalize_saas_admin_public_slug(value):
    slug = (value or "").strip().lower()
    if slug == "work-suite":
        return "worksuite"
    if slug == "online-storage":
        return "storage"
    return slug


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


def _org_used_free_trial(org, product_slug):
    if not org:
        return False
    product_slug = _normalize_product_slug(product_slug)
    subs = (
        Subscription.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    if product_slug == "monitor":
        subs = subs.filter(models.Q(plan__product__slug="monitor") | models.Q(plan__product__isnull=True))
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
        history_rows = history_rows.filter(models.Q(plan__product__slug="monitor") | models.Q(plan__product__isnull=True))
    else:
        history_rows = history_rows.filter(plan__product__slug=product_slug)
    for row in history_rows:
        if row.plan and is_free_plan(row.plan):
            return True
    if product_slug == "storage":
        try:
            storage_subs = (
                StorageOrgSubscription.objects
                .filter(organization=org)
                .select_related("plan")
            )
            for sub in storage_subs:
                if sub.plan is None or _storage_is_free_plan(sub.plan):
                    return True
        except Exception:
            return False
    return False
def home(request):
    context = build_enquiry_context(request)
    return render(request, "sites/home.html", context)

def pricing(request):
    plans = Plan.objects.all().order_by("price")
    context = build_enquiry_context(request)
    context["plans"] = plans
    return render(request, "sites/pricing.html", context)


def about(request):
    context = build_enquiry_context(request)
    return render(request, "sites/about.html", context)

def contact(request):
    context = build_enquiry_context(request)
    return render(request, "sites/contact.html", context)


def public_chatbox(request, slug, code):
    widget = (
        ChatWidget.objects
        .filter(public_chat_code=code, is_active=True)
        .select_related("organization")
        .first()
    )
    if not widget:
        raise Http404("Chat not found")
    org_slug = slugify(widget.organization.name)
    if org_slug != slug:
        raise Http404("Chat not found")
    return render(request, "ai_chatbot/public_chat_page.html", {
        "organization_name": widget.organization.name,
        "widget_key": widget.widget_key,
        "company_slug": org_slug,
        "public_code": code,
        "api_base": request.build_absolute_uri("/api/ai-chatbot").rstrip("/"),
    })


@require_http_methods(["GET"])
def public_products(request):
    products = list(
        Product.objects
        .filter(is_active=True)
        .exclude(slug="ai-chat-widget")
        .order_by("sort_order", "name")
    )
    public_order_map = {}
    try:
        saas_order_rows = (
            SaaSAdminProduct.objects
            .filter(status="active")
            .order_by("sort_order", "name")
            .values("slug", "sort_order")
        )
        public_order_map = {
            _normalize_saas_admin_public_slug(row["slug"]): index
            for index, row in enumerate(saas_order_rows, start=1)
        }
    except (OperationalError, ProgrammingError):
        public_order_map = {}
    products.sort(
        key=lambda product: (
            public_order_map.get(_public_product_slug(product.slug), 10_000),
            product.sort_order or 0,
            (product.name or "").lower(),
        )
    )
    return JsonResponse({
        "products": [
            {
                "id": product.id,
                "slug": _public_product_slug(product.slug),
                "name": _public_product_name(product.name, product.slug),
            }
            for product in products
        ]
    })


@require_http_methods(["GET"])
def public_plans(request):
    product_slug = request.GET.get("product", "").strip()
    if not product_slug:
        return JsonResponse({"detail": "product_required"}, status=400)
    normalized_slug = _normalize_product_slug(product_slug)
    product = Product.objects.filter(slug=normalized_slug, is_active=True).first()
    if not product and normalized_slug not in ("storage",):
        return JsonResponse({"detail": "product_not_found"}, status=404)
    if product_slug in ("storage", "online-storage"):
        storage_product = StorageProduct.objects.filter(name__iexact="Online Storage").first()
        plans = StoragePlan.objects.all()
        addons_qs = StorageAddOn.objects.all()
        if storage_product:
            plans = plans.filter(product=storage_product)
            addons_qs = addons_qs.filter(product=storage_product)
        plans = plans.order_by("name")
        if not plans.exists():
            plans = (
                Plan.objects
                .filter(product__slug="storage")
                .order_by("price", "monthly_price", "yearly_price", "name")
            )
    else:
        plans = Plan.objects.filter(product=product)
        if normalized_slug == "monitor":
            explicit_monitor = Plan.objects.filter(product=product)
            plans = explicit_monitor if explicit_monitor.exists() else Plan.objects.filter(product__isnull=True)
        plans = plans.order_by("price", "monthly_price", "yearly_price", "name")
    org = None
    if request.user.is_authenticated:
        try:
            org = get_active_org(request)
        except Exception:
            org = None
    free_eligible = True
    if org:
        free_eligible = not _org_used_free_trial(org, normalized_slug)

    response_plans = []
    response_addons = []
    for plan in plans:
        if normalized_slug == "storage":
            if hasattr(plan, "monthly_price_inr"):
                limits = {
                    "storage_gb": plan.storage_limit_gb,
                    "max_users": plan.max_users,
                    "bandwidth_limit_gb_monthly": plan.bandwidth_limit_gb_monthly,
                    "is_bandwidth_limited": plan.is_bandwidth_limited,
                    "device_limit_per_user": plan.device_limit_per_user,
                }
                response_plans.append({
                    "id": plan.id,
                    "code": slugify(plan.name),
                    "name": plan.name,
                    "price_inr_month": float(plan.monthly_price_inr or 0),
                    "price_usdt_month": float(plan.monthly_price_usd or 0),
                    "price_inr_year": float(plan.yearly_price_inr or 0),
                    "price_usdt_year": float(plan.yearly_price_usd or 0),
                    "allow_addons": False,
                    "addon_monthly_price": 0,
                    "addon_yearly_price": 0,
                    "addon_usd_monthly_price": 0,
                    "addon_usd_yearly_price": 0,
                    "limits": limits,
                    "features": {},
                    "addons": {},
                    "is_popular": False,
                    "currency": "INR",
                })
            else:
                limits = plan.limits or {}
                response_plans.append({
                    "id": plan.id,
                    "code": slugify(plan.name),
                    "name": plan.name,
                    "price_inr_month": float(plan.monthly_price or plan.price or 0),
                    "price_usdt_month": float(plan.usd_monthly_price or 0),
                    "price_inr_year": float(plan.yearly_price or 0),
                    "price_usdt_year": float(plan.usd_yearly_price or 0),
                    "allow_addons": bool(plan.allow_addons),
                    "addon_monthly_price": float(plan.addon_monthly_price or 0),
                    "addon_yearly_price": float(plan.addon_yearly_price or 0),
                    "addon_usd_monthly_price": float(plan.addon_usd_monthly_price or 0),
                    "addon_usd_yearly_price": float(plan.addon_usd_yearly_price or 0),
                    "limits": {
                        "storage_gb": limits.get("storage_gb", 0),
                        "max_users": limits.get("max_users", plan.employee_limit or 0),
                        "bandwidth_limit_gb_monthly": limits.get("bandwidth_limit_gb_monthly", 0),
                        "is_bandwidth_limited": limits.get("is_bandwidth_limited", True),
                        "device_limit_per_user": limits.get("device_limit_per_user", plan.device_limit or 1),
                    },
                    "features": dict(plan.features or {}),
                    "addons": plan.addons or {},
                    "is_popular": False,
                    "currency": "INR",
                })
            continue
        limits = plan.limits or {}
        if normalized_slug == "ai-chatbot":
            limits = {
                "widgets": limits.get("widgets"),
                "included_agents": limits.get("included_agents", plan.included_agents or 0),
                "conversations_per_month": limits.get("conversations_per_month"),
                "ai_replies_per_month": limits.get("ai_replies_per_month"),
                "ai_max_messages_per_conversation": limits.get("ai_max_messages_per_conversation", limits.get("max_messages_per_conversation")),
                "ai_max_chars_per_message": limits.get("ai_max_chars_per_message", limits.get("max_chars_per_message")),
                "chat_history_days": limits.get("chat_history_days"),
                "max_messages_per_conversation": limits.get("max_messages_per_conversation"),
                "max_chars_per_message": limits.get("max_chars_per_message"),
            }
        elif normalized_slug == "storage":
            limits = {
                "storage_gb": limits.get("storage_gb"),
                "max_users": limits.get("max_users"),
                "device_limit_per_user": limits.get("device_limit_per_user"),
            }
        elif normalized_slug == "business-autopilot-erp":
            limits = {
                "base_price_inr_month": limits.get("base_price_inr_month", plan.monthly_price or 0),
                "base_price_inr_year": limits.get("base_price_inr_year", plan.yearly_price or 0),
                "base_price_usdt_month": limits.get("base_price_usdt_month", plan.usd_monthly_price or 0),
                "base_price_usdt_year": limits.get("base_price_usdt_year", plan.usd_yearly_price or 0),
                "user_price_inr_month": limits.get("user_price_inr_month", 0),
                "user_price_inr_year": limits.get("user_price_inr_year", 0),
                "user_price_usdt_month": limits.get("user_price_usdt_month", 0),
                "user_price_usdt_year": limits.get("user_price_usdt_year", 0),
            }
        else:
            limits = {
                "employee_limit": limits.get("employee_limit", plan.employee_limit),
                "retention_days": limits.get("retention_days", plan.retention_days),
                "screenshot_min_minutes": limits.get("screenshot_min_minutes", plan.screenshot_min_minutes),
            }
        addons = dict(plan.addons or {})
        if normalized_slug == "storage" and "extra_storage_slot_gb" not in addons:
            addons["extra_storage_slot_gb"] = 250
        if normalized_slug == "storage" and "extra_storage_slot_name" not in addons:
            addons["extra_storage_slot_name"] = "Extra Storage Slot"
        if "extra_agent_inr" not in addons:
            addons["extra_agent_inr"] = plan.addon_agent_monthly_price
        if "extra_agent_usdt" not in addons:
            addons["extra_agent_usdt"] = plan.addon_usd_monthly_price
        if "extra_conv_pack_small_inr" not in addons:
            addons["extra_conv_pack_small_inr"] = addons.get("extra_conv_pack_small_inr")
        if "extra_conv_pack_small_usdt" not in addons:
            addons["extra_conv_pack_small_usdt"] = addons.get("extra_conv_pack_small_usdt")
        response_plans.append({
            "id": plan.id,
            "code": slugify(plan.name),
            "name": plan.name,
            "price_inr_month": plan.monthly_price or plan.price or 0,
            "price_usdt_month": plan.usd_monthly_price or 0,
            "price_inr_year": plan.yearly_price or 0,
            "price_usdt_year": plan.usd_yearly_price or 0,
            "allow_addons": bool(plan.allow_addons),
            "addon_monthly_price": plan.addon_monthly_price or 0,
            "addon_yearly_price": plan.addon_yearly_price or 0,
            "addon_usd_monthly_price": plan.addon_usd_monthly_price or 0,
            "addon_usd_yearly_price": plan.addon_usd_yearly_price or 0,
            "limits": limits,
            "features": dict(plan.features or {}),
            "addons": addons,
            "is_popular": False,
        })
        if normalized_slug == "storage" and not response_addons:
            response_addons = [{
                "slug": "extra-storage-slot",
                "name": "Extra Storage Slot",
                "storage_gb": 250,
                "price_inr_month": plan.addon_monthly_price or 0,
                "price_inr_year": plan.addon_yearly_price or 0,
                "price_usdt_month": plan.addon_usd_monthly_price or 0,
                "price_usdt_year": plan.addon_usd_yearly_price or 0,
            }]
        if normalized_slug == "monitor":
            monitor_flag_overrides = {
                "free": {
                    "allow_app_usage": True,
                    "allow_hr_view": True,
                    "allow_gaming_ott_usage": True,
                },
                "basic": {
                    "allow_app_usage": False,
                    "allow_hr_view": False,
                    "allow_gaming_ott_usage": False,
                },
                "plus": {
                    "allow_app_usage": True,
                    "allow_hr_view": False,
                    "allow_gaming_ott_usage": False,
                },
                "professional": {
                    "allow_app_usage": True,
                    "allow_hr_view": True,
                    "allow_gaming_ott_usage": True,
                },
            }
            response_flags = {
                "allow_addons": plan.allow_addons,
                "allow_app_usage": plan.allow_app_usage,
                "allow_gaming_ott_usage": plan.allow_gaming_ott_usage,
                "allow_hr_view": plan.allow_hr_view,
            }
            plan_key = (plan.name or "").strip().lower()
            override = monitor_flag_overrides.get(plan_key)
            if override:
                response_flags.update(override)
            response_plans[-1]["flags"] = response_flags
            response_plans[-1]["features"] = dict(plan.features or {})
        if normalized_slug == "ai-chatbot":
            features = plan.features or {}
            response_plans[-1]["flags"] = {
                "allow_addons": plan.allow_addons,
                "remove_branding": bool(features.get("remove_branding")),
                "analytics_basic": bool(features.get("analytics_basic")),
                "csv_export": bool(features.get("csv_export")),
                "agent_inbox": bool(features.get("agent_inbox")),
            }
            response_plans[-1]["features"] = {
                "ai_enabled": bool(features.get("ai_enabled", False)),
            }
    if normalized_slug == "storage":
        if not response_addons:
            addon = addons_qs.first() if "addons_qs" in locals() else None
            if addon:
                response_addons = [{
                    "slug": "extra-storage-slot",
                    "name": addon.name,
                    "storage_gb": addon.storage_gb,
                    "price_inr_month": float(addon.price_monthly or 0),
                    "price_inr_year": float((addon.price_monthly or 0) * 12),
                    "price_usdt_month": 0,
                    "price_usdt_year": 0,
                }]
    response_product_slug = product.slug if product else normalized_slug
    response_product_name = _public_product_name(product.name if product else "Online Storage", response_product_slug)
    return JsonResponse({
        "product": {"slug": response_product_slug, "name": response_product_name},
        "trial_days": 7,
        "free_eligible": free_eligible,
        "plans": response_plans,
        "addons": response_addons,
    })
