from django.shortcuts import render, redirect
from django.utils import timezone
import datetime
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib import messages
from django.utils.http import url_has_allowed_host_and_scheme

from core.models import Organization, Subscription, UserProfile, PendingTransfer, Plan, ThemeSettings, DealerAccount, ReferralSettings, SubscriptionHistory, OrganizationSettings
from core.models import BillingProfile
from core.device_policy import get_device_limit_for_org
from core.email_utils import send_templated_email
from core.referral_utils import ensure_referral_code, ensure_dealer_referral_code
from core.timezone_utils import normalize_timezone, resolve_default_timezone, is_valid_timezone
from core.subscription_utils import (
    get_effective_end_date,
    is_free_plan,
    is_subscription_active,
    maybe_expire_subscription,
    normalize_subscription_end_date,
)
from apps.backend.retention.models import RetentionStatus
from apps.backend.retention.utils.retention import evaluate_tenant_status, get_tenant_status


def company_signup(request):
    if request.method == "POST":
        name = request.POST.get("name") or request.POST.get("company")
        admin_name = request.POST.get("admin_name") or request.POST.get("name")
        email = (request.POST.get("email") or "").strip().lower()
        password = request.POST.get("password")
        phone_country = request.POST.get("phone_country", "").strip()
        phone_number = request.POST.get("phone_number", "").strip()
        referral_code = (request.POST.get("referral_code") or "").strip().upper()

        if not name or not email or not password:
            messages.error(request, "Please fill all required fields.")
            return redirect("/signup/")

        if not admin_name:
            admin_name = email.split("@")[0]

        # Prevent duplicate user
        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            messages.error(request, "This email is already registered. Please login or Register with New Email.")
            return redirect("/accounts/login/")

        # Create User
        user = User.objects.create_user(
            username=email,
            first_name=admin_name,
            email=email,
            password=password
        )

        # Create Organization
        org = Organization.objects.create(
            name=name,
            owner=user,
            company_key=name.replace(" ", "").upper() + "KEY"
        )
        if referral_code:
            referrer_dealer = DealerAccount.objects.filter(referral_code=referral_code).first()
            if referrer_dealer:
                org.referred_by_dealer = referrer_dealer
                org.referred_at = timezone.now()
                org.save(update_fields=["referred_by_dealer", "referred_at"])
            else:
                referrer = Organization.objects.filter(referral_code=referral_code).first()
                if referrer and referrer.id != org.id:
                    org.referred_by = referrer
                    org.referred_at = timezone.now()
                    org.save(update_fields=["referred_by", "referred_at"])
        ensure_referral_code(org)

        # Profile
        phone_value = ""
        if phone_number:
            phone_value = f"{phone_country} {phone_number}".strip()

        UserProfile.objects.create(
            user=user,
            role="company_admin",
            phone_number=phone_value
        )

        send_templated_email(
            user.email,
            "Welcome to Work Zilla Work Suite",
            "emails/welcome_signup.txt",
            {
                "name": user.first_name or user.username,
                "login_url": request.build_absolute_uri("/accounts/login/")
            }
        )
        messages.success(request, "Account Created Successfully. Please Login.")
        return redirect("/accounts/login/")

    return render(request, "sites/signup.html")


def agent_signup(request):
    settings_obj = ReferralSettings.get_active()
    if request.method == "POST":
        name = request.POST.get("name") or request.POST.get("agent_name")
        email = (request.POST.get("email") or "").strip().lower()
        password = request.POST.get("password")
        phone_country = request.POST.get("phone_country", "").strip()
        phone_number = request.POST.get("phone_number", "").strip()
        referral_code = (request.POST.get("referral_code") or "").strip().upper()

        if not name or not email or not password:
            messages.error(request, "Please fill all required fields.")
            return redirect("/agent-signup/")

        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            messages.error(request, "This email is already registered. Please login or Register with New Email.")
            return redirect("/accounts/login/")

        user = User.objects.create_user(
            username=email,
            first_name=name,
            email=email,
            password=password
        )

        phone_value = ""
        if phone_number:
            phone_value = f"{phone_country} {phone_number}".strip()
        UserProfile.objects.create(
            user=user,
            role="dealer",
            phone_number=phone_value
        )

        dealer = DealerAccount.objects.create(
            user=user,
            subscription_status="pending",
            subscription_amount=settings_obj.dealer_subscription_amount or 0,
        )
        if referral_code:
            referrer = DealerAccount.objects.filter(referral_code=referral_code).first()
            if referrer and referrer.id != dealer.id:
                dealer.referred_by = referrer
                dealer.referred_at = timezone.now()
                dealer.save(update_fields=["referred_by", "referred_at"])
        ensure_dealer_referral_code(dealer)

        send_templated_email(
            user.email,
            "Welcome to Work Zilla Work Suite",
            "emails/welcome_signup.txt",
            {
                "name": user.first_name or user.username,
                "login_url": request.build_absolute_uri("/accounts/login/")
            }
        )
        messages.success(request, "Agent account created. Please login.")
        return redirect("/accounts/login/")

    return render(request, "sites/agent_signup.html", {
        "subscription_amount": settings_obj.dealer_subscription_amount or 0,
    })


def company_login(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(request, username=username, password=password)

        if user:
            login(request, user)
            request.session.pop("pending_transfer_data", None)
            profile = UserProfile.objects.filter(user=user).first()
            if user.is_superuser or (profile and profile.role in ("superadmin", "super_admin")):
                return redirect("/app/saas-admin/")
            if profile and profile.role == "dealer":
                return redirect("/app/dealer-dashboard")
            return redirect("/app/")
        else:
            messages.error(request, "Invalid username or password")

    return render(request, "sites/login.html")


def hr_login(request):
    if request.method == "POST":
        company_key = (request.POST.get("company_key") or "").strip().upper()
        password = request.POST.get("password") or ""

        if not company_key or not password:
            messages.error(request, "Please fill all required fields.")
            return redirect("/hr-login/")

        org = Organization.objects.filter(company_key__iexact=company_key).first()
        if not org:
            messages.error(request, "Invalid company key.")
            return redirect("/hr-login/")

        sub = (
            Subscription.objects
            .filter(organization=org, status="active")
            .select_related("plan")
            .order_by("-start_date")
            .first()
        )
        if not sub or not is_subscription_active(sub) or not sub.plan or not sub.plan.allow_hr_view:
            messages.error(request, "HR view login is not enabled for this plan.")
            return redirect("/hr-login/")

        username = org.company_key or company_key
        default_password = f"{org.company_key}hrlog"

        user = User.objects.filter(username=username).first()
        if not user:
            user = User.objects.create_user(
                username=username,
                first_name=f"{org.name} HR",
                password=default_password
            )

        profile = UserProfile.objects.filter(user=user).first()
        if profile and profile.role not in ("hr_view",):
            messages.error(request, "HR login is not available for this account.")
            return redirect("/hr-login/")
        if not profile:
            profile = UserProfile.objects.create(
                user=user,
                role="hr_view",
                organization=org,
            )
        else:
            updates = []
            if profile.role != "hr_view":
                profile.role = "hr_view"
                updates.append("role")
            if profile.organization_id != org.id:
                profile.organization = org
                updates.append("organization")
            if updates:
                profile.save(update_fields=updates)

        user = authenticate(request, username=username, password=password)
        if not user:
            messages.error(request, "Invalid username or password.")
            return redirect("/hr-login/")

        login(request, user)
        request.session["active_org_id"] = org.id
        request.session.pop("pending_transfer_data", None)
        return redirect("/app/")

    return render(request, "sites/hr_login.html")


def custom_logout(request):
    logout(request)
    messages.success(request, "Logged out successfully")
    next_url = request.GET.get("next") or "/accounts/login/"
    if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        next_url = "/accounts/login/"
    return redirect(next_url)


@require_GET
def auth_me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False}, status=401)

    user = request.user
    profile = (
        UserProfile.objects
        .filter(user=user)
        .select_related("organization")
        .first()
    )
    org = None
    if user.is_superuser or (profile and profile.role in ("superadmin", "super_admin")):
        org_id = request.session.get("active_org_id")
        if org_id:
            org = Organization.objects.filter(id=org_id).first()
    if profile and profile.role == "dealer":
        org = None
    if not org and not (profile and profile.role == "dealer"):
        if profile and profile.organization:
            org = profile.organization
        else:
            org = Organization.objects.filter(owner=user).first()
            if org and profile and not profile.organization:
                profile.organization = org
                profile.save(update_fields=["organization"])

    org_payload = None
    org_timezone = "UTC"
    if org:
        org_settings, _ = OrganizationSettings.objects.get_or_create(organization=org)
        org_timezone = normalize_timezone(org_settings.org_timezone, fallback="UTC")
        if org_settings.org_timezone != org_timezone:
            org_settings.org_timezone = org_timezone
            org_settings.save(update_fields=["org_timezone"])

        if org_timezone == "UTC":
            billing_country = (
                BillingProfile.objects
                .filter(organization=org)
                .values_list("country", flat=True)
                .first()
            )
            browser_tz = (
                (request.headers.get("X-Browser-Timezone") or "").strip()
                if request.headers else ""
            )
            if not is_valid_timezone(browser_tz):
                browser_tz = ""
            auto_timezone = resolve_default_timezone(
                country=billing_country,
                browser_timezone=browser_tz,
                fallback=org_timezone,
            )
            if auto_timezone != org_timezone:
                org_timezone = auto_timezone
                org_settings.org_timezone = org_timezone
                org_settings.save(update_fields=["org_timezone"])

        org_payload = {
            "id": org.id,
            "name": org.name,
            "company_key": org.company_key,
        }

    profile_payload = None
    if profile:
        profile_payload = {
            "role": profile.role,
            "phone_number": profile.phone_number or "",
            "organization": org_payload,
        }

    dealer_payload = None
    dealer_onboarding = None
    if profile and profile.role == "dealer":
        dealer = DealerAccount.objects.filter(user=user).first()
        if not dealer:
            settings_obj = ReferralSettings.get_active()
            dealer = DealerAccount.objects.create(
                user=user,
                subscription_status="pending",
                subscription_amount=settings_obj.dealer_subscription_amount or 0,
            )
            ensure_dealer_referral_code(dealer)
        pending_transfer = PendingTransfer.objects.filter(
            user=user,
            request_type="dealer",
            status="pending",
        ).order_by("-created_at").first()
        draft_transfer = PendingTransfer.objects.filter(
            user=user,
            request_type="dealer",
            status="draft",
        ).order_by("-created_at").first()
        active = dealer.subscription_status == "active" and (
            not dealer.subscription_end or dealer.subscription_end >= timezone.now()
        )
        if active:
            dealer_onboarding = "active"
        elif pending_transfer:
            dealer_onboarding = "pending_payment"
        else:
            dealer_onboarding = "needs_payment"
        dealer_payload = {
            "subscription_status": dealer.subscription_status,
            "subscription_start": dealer.subscription_start.isoformat() if dealer.subscription_start else "",
            "subscription_end": dealer.subscription_end.isoformat() if dealer.subscription_end else "",
            "subscription_amount": float(dealer.subscription_amount or 0),
            "pending_transfer_id": (
                pending_transfer.id if pending_transfer else (draft_transfer.id if draft_transfer else None)
            ),
        }

    active_sub = (
        Subscription.objects.filter(organization=org, status__in=("active", "trialing"))
        .order_by("-start_date")
        .first()
        if org else None
    )
    if active_sub:
        normalize_subscription_end_date(active_sub)
        if not is_subscription_active(active_sub):
            maybe_expire_subscription(active_sub)
            active_sub = None

    allow_app_usage = bool(active_sub and active_sub.plan and active_sub.plan.allow_app_usage)
    allow_gaming_ott_usage = bool(active_sub and active_sub.plan and active_sub.plan.allow_gaming_ott_usage)
    free_plan_popup = False
    free_plan_expiry = None
    if active_sub and is_free_plan(active_sub.plan):
        free_plan_expiry = get_effective_end_date(active_sub)
        today = timezone.localdate()
        last_shown = request.session.get("free_plan_popup_date")
        if free_plan_expiry and last_shown != today.isoformat():
            free_plan_popup = True
            request.session["free_plan_popup_date"] = today.isoformat()

    onboarding_enabled = bool(
        profile
        and profile.role == "company_admin"
        and not user.is_superuser
    )
    pending_transfer = False
    transfer_intent = False
    if onboarding_enabled and org:
        pending_data = request.session.get("pending_transfer_data") or {}
        plan_id = pending_data.get("plan_id") if isinstance(pending_data, dict) else None
        created_at = pending_data.get("created_at") if isinstance(pending_data, dict) else None
        plan_ok = bool(plan_id and Plan.objects.filter(id=plan_id).exists())
        transfer_window_minutes = 120
        transfer_recent = False
        if created_at:
            try:
                if isinstance(created_at, (int, float)):
                    created_time = datetime.datetime.fromtimestamp(
                        float(created_at),
                        tz=timezone.get_current_timezone()
                    )
                else:
                    created_time = datetime.datetime.fromisoformat(str(created_at))
                    if timezone.is_naive(created_time):
                        created_time = timezone.make_aware(
                            created_time,
                            timezone.get_current_timezone()
                        )
                delta = timezone.now() - created_time
                transfer_recent = delta.total_seconds() <= transfer_window_minutes * 60
            except (ValueError, TypeError):
                transfer_recent = False
        if plan_ok and transfer_recent:
            transfer_intent = True
        else:
            if pending_data:
                request.session.pop("pending_transfer_data", None)
        pending_transfer = PendingTransfer.objects.filter(
            organization=org,
            status="pending",
            request_type__in=("new", "renew"),
        ).exists()

    if not onboarding_enabled or active_sub:
        onboarding_state = "active"
    elif pending_transfer:
        onboarding_state = "pending_payment"
    elif transfer_intent:
        onboarding_state = "needs_payment"
    else:
        onboarding_state = "needs_plan"

    theme = ThemeSettings.get_active()
    retention_status = None
    grace_until = None
    archive_until = None
    if org:
        retention = get_tenant_status(org)
        if retention.last_evaluated_at is None:
            retention = evaluate_tenant_status(org)
        retention_status = retention.status
        grace_until = retention.grace_until
        archive_until = retention.archive_until
    read_only = bool(profile and profile.role == "hr_view") or retention_status == RetentionStatus.GRACE_READONLY
    archived = retention_status in (
        RetentionStatus.ARCHIVED,
        RetentionStatus.PENDING_DELETE,
        RetentionStatus.DELETED,
    )

    return JsonResponse(
        {
            "authenticated": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_superuser": user.is_superuser,
            },
            "profile": profile_payload,
            "dealer": dealer_payload,
            "dealer_onboarding": dealer_onboarding,
            "allow_app_usage": allow_app_usage,
            "allow_gaming_ott_usage": allow_gaming_ott_usage,
            "free_plan_popup": free_plan_popup,
            "free_plan_expiry": (
                timezone.localtime(free_plan_expiry).strftime("%d %b %Y")
                if free_plan_expiry else ""
            ),
            "theme_primary": theme.primary_color,
            "theme_secondary": theme.secondary_color,
            "read_only": read_only,
            "retention_status": retention_status,
            "grace_until": grace_until.isoformat() if grace_until else "",
            "archive_until": archive_until.isoformat() if archive_until else "",
            "archived": archived,
            "org_timezone": org_timezone,
            "device_limit": get_device_limit_for_org(org),
            "onboarding": {
                "enabled": onboarding_enabled,
                "state": onboarding_state,
                "has_pending_transfer": pending_transfer,
                "has_transfer_intent": transfer_intent,
            },
        }
    )


@require_GET
def auth_subscriptions(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "subscriptions": []}, status=401)

    user = request.user
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    org = profile.organization if profile and profile.organization else None
    if not org:
        org = Organization.objects.filter(owner=user).first()

    if not org:
        return JsonResponse({"authenticated": True, "subscriptions": []})

    subs = (
        Subscription.objects
        .filter(organization=org)
        .select_related("plan", "plan__product")
        .order_by("-start_date")
    )

    def _status_rank(status):
        value = (status or "").lower()
        if value == "active":
            return 4
        if value == "trialing":
            return 3
        if value == "pending":
            return 2
        if value == "expired":
            return 1
        return 0

    best_by_slug = {}
    for sub in subs:
        product = sub.plan.product if sub.plan else None
        slug = product.slug if product else "monitor"
        rank = _status_rank(sub.status)
        current = best_by_slug.get(slug)
        if not current:
            best_by_slug[slug] = (sub, rank)
            continue
        current_sub, current_rank = current
        if rank > current_rank:
            best_by_slug[slug] = (sub, rank)
            continue
        if rank == current_rank:
            current_start = current_sub.start_date or timezone.make_aware(datetime.datetime.min)
            next_start = sub.start_date or timezone.make_aware(datetime.datetime.min)
            if next_start > current_start:
                best_by_slug[slug] = (sub, rank)

    payload = []
    seen_slugs = set()
    for slug, (sub, _) in best_by_slug.items():
        product = sub.plan.product if sub.plan else None
        seen_slugs.add(slug)
        payload.append({
            "product_slug": slug,
            "product_name": product.name if product else "Work Suite",
            "status": sub.status,
            "plan_id": sub.plan_id,
            "plan_name": sub.plan.name if sub.plan else "",
            "plan_is_free": is_free_plan(sub.plan),
            "starts_at": sub.start_date.isoformat() if sub.start_date else "",
            "ends_at": sub.end_date.isoformat() if sub.end_date else "",
            "trial_end": sub.trial_end.isoformat() if sub.trial_end else "",
        })

    history_rows = (
        SubscriptionHistory.objects
        .filter(organization=org, plan__isnull=False)
        .select_related("plan", "plan__product")
        .order_by("-start_date")
    )
    latest_by_slug = {}
    for row in history_rows:
        product = row.plan.product if row.plan else None
        slug = product.slug if product else "monitor"
        if slug in seen_slugs or slug in latest_by_slug:
            continue
        latest_by_slug[slug] = row
    for slug, row in latest_by_slug.items():
        product = row.plan.product if row.plan else None
        end_date = row.end_date
        status = row.status or "active"
        if end_date and end_date < timezone.now():
            status = "expired"
        payload.append({
            "product_slug": slug,
            "product_name": product.name if product else "Work Suite",
            "status": status,
            "plan_id": row.plan_id,
            "plan_name": row.plan.name if row.plan else "",
            "plan_is_free": is_free_plan(row.plan),
            "starts_at": row.start_date.isoformat() if row.start_date else "",
            "ends_at": row.end_date.isoformat() if row.end_date else "",
            "trial_end": "",
        })

    approved_transfers = (
        PendingTransfer.objects
        .filter(organization=org, status="approved", request_type__in=("new", "renew"))
        .select_related("plan", "plan__product")
        .order_by("-updated_at", "-created_at")
    )
    latest_transfer_by_slug = {}
    for transfer in approved_transfers:
        plan = transfer.plan
        product = plan.product if plan else None
        slug = product.slug if product else "monitor"
        if slug in seen_slugs or slug in latest_by_slug or slug in latest_transfer_by_slug:
            continue
        latest_transfer_by_slug[slug] = transfer

    for slug, transfer in latest_transfer_by_slug.items():
        plan = transfer.plan
        product = plan.product if plan else None
        start_date = transfer.updated_at or transfer.created_at
        months = 12 if transfer.billing_cycle == "yearly" else 1
        end_date = start_date + datetime.timedelta(days=30 * months) if start_date else None
        status = "active"
        if end_date and end_date < timezone.now():
            status = "expired"
        payload.append({
            "product_slug": slug,
            "product_name": product.name if product else "Work Suite",
            "status": status,
            "plan_id": plan.id if plan else None,
            "plan_name": plan.name if plan else "",
            "plan_is_free": is_free_plan(plan),
            "starts_at": start_date.isoformat() if start_date else "",
            "ends_at": end_date.isoformat() if end_date else "",
            "trial_end": "",
        })

    try:
        from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
        storage_sub = (
            StorageOrgSubscription.objects
            .filter(organization=org, status__in=("active", "trialing"))
            .select_related("plan", "product")
            .order_by("-updated_at")
            .first()
        )
        if storage_sub:
            plan = storage_sub.plan
            status = storage_sub.status or "active"
            renewal_date = storage_sub.renewal_date
            trial_end = renewal_date.isoformat() if status == "trialing" and renewal_date else ""
            payload.append({
                "product_slug": "storage",
                "product_name": storage_sub.product.name if storage_sub.product else "Online Storage",
                "status": status,
                "plan_id": plan.id if plan else None,
                "plan_name": plan.name if plan else "",
                "plan_is_free": bool(plan and (plan.name or "").strip().lower() == "free"),
                "starts_at": storage_sub.created_at.isoformat() if storage_sub.created_at else "",
                "ends_at": renewal_date.isoformat() if renewal_date else "",
                "trial_end": trial_end,
            })
    except Exception:
        pass

    return JsonResponse({"authenticated": True, "subscriptions": payload})
