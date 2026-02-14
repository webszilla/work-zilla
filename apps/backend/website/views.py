from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import redirect_to_login
from django.db import transaction
from django.db.models import Q
from django.shortcuts import render, redirect
from types import SimpleNamespace
from django.http import JsonResponse, HttpResponse, FileResponse, Http404
from django.utils import timezone
from django.views.decorators.http import require_POST
from django.views.decorators.http import require_http_methods
from django.db.utils import OperationalError
import json
from datetime import timedelta
import os
from types import SimpleNamespace

from apps.backend.enquiries.views import build_enquiry_context
from apps.backend.brand.models import ProductRouteMapping
from apps.backend.products.models import Product
from core.observability import log_event
from core.subscription_utils import is_free_plan, is_subscription_active
from core.models import (
    Organization,
    Plan,
    Subscription,
    PendingTransfer,
    UserProfile,
    BillingProfile,
    SubscriptionHistory,
    InvoiceSellerProfile,
)


def _resolve_download_path(*candidates):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    downloads_dir = os.path.join(base_dir, "static", "downloads")
    for filename in candidates:
        if not filename:
            continue
        file_path = os.path.join(downloads_dir, filename)
        if os.path.exists(file_path):
            return file_path, filename
    raise Http404("Installer not found.")


def download_windows_agent(request):
    file_path, filename = _resolve_download_path(
        "Work Zilla Installer-win-x64-0.1.0.exe",
        "WorkZillaInstallerSetup.exe",
        "WorkZillaAgentSetup.exe",
    )
    return FileResponse(open(file_path, "rb"), as_attachment=True, filename=filename)


def download_mac_agent(request):
    user_agent = (request.META.get("HTTP_USER_AGENT") or "").lower()
    prefer_arm = any(token in user_agent for token in ("arm64", "aarch64", "apple"))
    arm_file = "Work Zilla Installer-mac-arm64-0.1.0.dmg"
    x64_file = "Work Zilla Installer-mac-x64-0.1.0.dmg"
    arm_zip = "Work Zilla Installer-mac-arm64-0.1.0.zip"
    x64_zip = "Work Zilla Installer-mac-x64-0.1.0.zip"
    if prefer_arm:
        file_path, filename = _resolve_download_path(
            arm_zip,
            arm_file,
            x64_zip,
            x64_file,
            "WorkZillaInstaller.dmg",
            "WorkZillaAgent.dmg",
        )
    else:
        file_path, filename = _resolve_download_path(
            x64_zip,
            x64_file,
            arm_zip,
            arm_file,
            "WorkZillaInstaller.dmg",
            "WorkZillaAgent.dmg",
        )
    return FileResponse(open(file_path, "rb"), as_attachment=True, filename=filename)


def bootstrap_products_config(request):
    windows_url = request.build_absolute_uri("/downloads/windows-agent/")
    mac_url = request.build_absolute_uri("/downloads/mac-agent/")
    return JsonResponse(
        {
            "monitor": {
                "windows": windows_url,
                "mac": mac_url,
            },
            "storage": {
                "windows": windows_url,
                "mac": mac_url,
            },
        }
    )


def _normalize_product_slug(value, default="monitor"):
    slug = (value or "").strip().lower()
    if slug == "worksuite":
        return "monitor"
    return slug or default


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


def _org_has_used_free_trial(org):
    if not org:
        return False
    subs = (
        Subscription.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    for sub in subs:
        if sub.plan and is_free_plan(sub.plan):
            return True
    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan")
    )
    for row in history_rows:
        if row.plan and is_free_plan(row.plan):
            return True
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
    context["products"] = Product.objects.filter(is_active=True).order_by("sort_order", "name")
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


def contact_view(request):
    return render(request, "public/contact.html", _base_context(request))


def about_view(request):
    return render(request, "public/about.html", _base_context(request))


def privacy_view(request):
    return render(request, "public/privacy.html", _base_context(request))


def terms_view(request):
    return render(request, "public/terms.html", _base_context(request))


@require_POST
def checkout_select(request):
    plan_id = request.POST.get("plan_id")
    product_slug = _normalize_product_slug(request.POST.get("product_slug"))
    currency = (request.POST.get("currency") or "inr").lower()
    billing = (request.POST.get("billing") or "monthly").lower()

    request.session["selected_product_slug"] = product_slug
    request.session["selected_plan_id"] = plan_id
    request.session["selected_currency"] = currency
    request.session["selected_billing"] = billing

    if not request.user.is_authenticated:
        return redirect("/auth/signup/?next=/checkout/")
    return redirect("/checkout/")


@login_required(login_url="/auth/login/")
def checkout_view(request):
    context = _base_context(request)
    plan_id = request.session.get("selected_plan_id")
    product_slug = _normalize_product_slug(request.session.get("selected_product_slug"))
    currency = request.session.get("selected_currency") or "inr"
    billing = request.session.get("selected_billing") or "monthly"
    plan = Plan.objects.filter(id=plan_id).first() if plan_id else None
    selected_product_name = product_slug.title() if product_slug else ""
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
        return plan.addon_usd_monthly_price if billing == "monthly" else plan.addon_usd_yearly_price
    return plan.addon_monthly_price if billing == "monthly" else plan.addon_yearly_price


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
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "authentication_required"}, status=401)
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
        if plan_product_slug != product_slug:
            return JsonResponse({"detail": "product_mismatch"}, status=400)

    org = _resolve_org_for_user(request.user)
    if not org:
        return JsonResponse({"detail": "organization_required"}, status=403)

    if product_slug in ("storage", "online-storage"):
        storage_slug = "storage"
        has_history = SubscriptionHistory.objects.filter(
            organization=org,
            plan__product__slug=storage_slug
        ).exists()
        has_subscription = Subscription.objects.filter(
            organization=org,
            plan__product__slug=storage_slug
        ).exists()
        has_storage_sub = StorageOrgSubscription.objects.filter(organization=org).exists()
    else:
        product_filter = Q(plan__product__slug=product_slug)
        if product_slug == "monitor":
            product_filter |= Q(plan__product__isnull=True)
        has_history = SubscriptionHistory.objects.filter(
            organization=org
        ).filter(product_filter).exists()
        has_subscription = Subscription.objects.filter(
            organization=org
        ).filter(product_filter).exists()
        has_storage_sub = False

    trial_days = 7
    trial_available = (
        trial_days > 0
        and not has_history
        and not has_subscription
        and not has_storage_sub
        and not _org_has_used_free_trial(org)
    )
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
                "redirect": f"/app/{product_slug}/",
                "subscription_id": subscription.id,
            })

    return JsonResponse({"detail": "trial_not_available"}, status=409)


@require_POST
@login_required(login_url="/auth/login/")
def checkout_confirm(request):
    plan_id = request.session.get("selected_plan_id")
    product_slug = _normalize_product_slug(request.session.get("selected_product_slug"))
    currency = request.session.get("selected_currency") or "inr"
    billing = request.session.get("selected_billing") or "monthly"
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

    org = _resolve_org_for_user(request.user)
    profile = BillingProfile.objects.filter(organization=org).first()
    if not _billing_profile_complete(profile):
        messages.error(request, "Please complete company billing details before checkout.")
        return redirect("/checkout/")

    utr_number = (request.POST.get("utr_number") or "").strip()
    paid_on = request.POST.get("paid_on") or None
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
        )
        if storage_plan:
            if currency.lower() == "usd":
                amount = storage_plan.usd_monthly_price if billing == "monthly" else storage_plan.usd_yearly_price
            else:
                amount = storage_plan.monthly_price_inr if billing == "monthly" else storage_plan.yearly_price_inr
        else:
            amount = _plan_price(plan, currency, billing) or 0
        PendingTransfer.objects.create(
            organization=org,
            user=request.user,
            plan=plan,
            request_type="new",
            billing_cycle=billing,
            retention_days=plan.retention_days or 30,
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
    ):
        request.session.pop(key, None)

    messages.success(request, "Payment request submitted. We will activate your plan soon.")
    return redirect("/my-account/")


@login_required(login_url="/auth/login/")
def billing_renew_start(request):
    product_slug = _normalize_product_slug(request.GET.get("product"))
    org = _resolve_org_for_user(request.user)
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
    request.session["renew_addon_count"] = int(latest.addon_count or 0)
    request.session.modified = True
    return redirect("/my-account/billing/renew/")


@login_required(login_url="/auth/login/")
def billing_renew_view(request):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    org = _resolve_org_for_user(request.user)

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
        "selected_product_slug": product_slug,
        "selected_currency": currency,
        "selected_billing": billing,
        "addon_count": addon_count,
        "base_price": base_price,
        "addon_price": addon_price,
        "total_price": total_price,
        "has_pending_renewal": pending_renewal,
    })
    return render(request, "public/billing_renew.html", context)


@require_POST
@login_required(login_url="/auth/login/")
def billing_renew_confirm(request):
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

    org = _resolve_org_for_user(request.user)
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


@login_required
def account_view(request):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "products"
    org = _resolve_org_for_user(request.user)
    profile = UserProfile.objects.filter(user=request.user).first()
    is_saas_admin = bool(
        request.user.is_superuser
        or (profile and profile.role in ("superadmin", "super_admin"))
    )
    is_agent = bool(profile and profile.role == "ai_chatbot_agent")
    subs = (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan")
        .order_by("-start_date")
    )
    subs = list(subs)
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
        sub.product_name = product.name if product else "Work Suite"
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
    if not is_agent:
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
            continue
        plan = sub.plan
        product = plan.product if plan else None
        slug = product.slug if product and product.slug else "monitor"
        sub.product_slug = slug
        sub.product_name = product.name if product else "Work Suite"
        sub.plan_rank = _plan_rank(plan)
        sub.can_upgrade = sub.plan_rank < max_rank_by_slug.get(slug, sub.plan_rank)
        sub.is_free_plan = is_free_plan(plan)
    pending_renewal_rows = []
    if not is_agent:
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
                "product_name": product.name if product else "Work Suite",
                "product_slug": slug,
                "plan_name": transfer.plan.name if transfer.plan else "-",
                "billing_cycle": transfer.billing_cycle,
                "status": transfer.status,
                "created_at": transfer.created_at,
                "amount": transfer.amount,
                "currency": transfer.currency,
            })
    pending_payment_rows = []
    if not is_agent:
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
                "product_name": product.name if product else "Work Suite",
                "product_slug": product.slug if product else "monitor",
                "plan_name": transfer.plan.name if transfer.plan else "-",
                "billing_cycle": transfer.billing_cycle,
                "status": transfer.status,
                "created_at": transfer.created_at,
                "amount": transfer.amount,
                "currency": transfer.currency,
            })
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
        sub.info_plan_name = sub.plan.name if sub.plan else "-"
        sub.info_billing_cycle = sub.billing_cycle
        sub.info_status = sub.status
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
        "pending_renewal_rows": pending_renewal_rows,
    })
    return render(request, "public/account.html", context)


@login_required
def billing_view(request):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    profile = UserProfile.objects.filter(user=request.user).first()
    if profile and profile.role == "ai_chatbot_agent":
        return redirect("/my-account/")
    org = _resolve_org_for_user(request.user)
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
            status="approved"
        ))
    approved_transfers.sort(
        key=lambda transfer: transfer.paid_on or getattr(transfer, "updated_at", None) or getattr(transfer, "created_at", None) or timezone.now(),
        reverse=True,
    )
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
                "product_name": product.name if product else "Work Suite",
                "plan": entry.plan.name if entry.plan else "-",
                "status": entry.status,
                "billing_cycle": entry.billing_cycle or "monthly",
                "date": entry.end_date or entry.created_at,
            })
    for transfer in rejected_transfers:
        product = transfer.plan.product if transfer.plan else None
        billing_activity.append({
            "type": "Payment",
            "product_name": product.name if product else "Work Suite",
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
    })
    return render(request, "public/billing.html", context)


@login_required(login_url="/auth/login/")
def account_bank_transfer(request, transfer_id=None):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "billing"
    org = _resolve_org_for_user(request.user)
    if not org:
        messages.error(request, "Organization not found.")
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
    })
    return render(request, "payments/bank_transfer.html", context)


@login_required
def profile_view(request):
    context = _base_context(request)
    context["is_logged_in"] = True
    context["account_section"] = "profile"
    profile = UserProfile.objects.filter(user=request.user).first()

    if request.method == "POST":
        phone_number = (request.POST.get("phone_number") or "").strip()
        if not phone_number:
            messages.error(request, "Phone number is required.")
        else:
            request.user.first_name = (request.POST.get("first_name") or "").strip()
            request.user.last_name = (request.POST.get("last_name") or "").strip()
            email = (request.POST.get("email") or "").strip()
            if email:
                request.user.email = email
            request.user.save()

            if not profile:
                profile = UserProfile(user=request.user)
            profile.phone_number = phone_number
            profile.save()
            messages.success(request, "Profile updated.")

    context.update({
        "profile": profile,
    })
    return render(request, "public/profile.html", context)


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
