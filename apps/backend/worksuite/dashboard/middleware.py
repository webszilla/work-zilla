from django.shortcuts import redirect
from django.contrib import messages
from django.contrib.messages import get_messages
from django.utils import timezone
from datetime import timedelta
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
