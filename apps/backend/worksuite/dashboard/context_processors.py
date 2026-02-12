from django.utils import timezone
from core.models import Organization, Subscription, UserProfile, ThemeSettings
from core.subscription_utils import (
    get_effective_end_date,
    is_free_plan,
    is_subscription_active,
    maybe_expire_subscription,
    normalize_subscription_end_date,
)


def subscription_context(request):
    if not request.user.is_authenticated:
        return {}
    profile, _ = UserProfile.objects.get_or_create(
        user=request.user,
        defaults={"role": "company_admin"}
    )
    org = None
    if request.user.is_superuser or profile.role in ("superadmin", "super_admin"):
        org_id = request.session.get("active_org_id")
        if org_id:
            org = Organization.objects.filter(id=org_id).first()
    else:
        org = Organization.objects.filter(owner=request.user).first()
    active_sub = (
        Subscription.objects.filter(organization=org, status="active")
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
    return {
        "active_sub": active_sub,
        "allow_app_usage": allow_app_usage,
        "allow_gaming_ott_usage": allow_gaming_ott_usage,
        "free_plan_popup": free_plan_popup,
        "free_plan_expiry": free_plan_expiry,
    }


def theme_context(request):
    theme = ThemeSettings.get_active()
    return {
        "theme_primary": theme.primary_color,
        "theme_secondary": theme.secondary_color,
    }


def site_nav_context(request):
    if not request.user.is_authenticated:
        return {"site_nav": {"is_authenticated": False}}
    profile = UserProfile.objects.filter(user=request.user).first()
    dashboard_label = "Dashboard"
    dashboard_url = "/app/"
    if profile:
        if profile.role == "dealer":
            dashboard_label = "Dealer Dashboard"
            dashboard_url = "/app/dealer-dashboard"
        elif profile.role == "hr_view":
            dashboard_label = "HR Dashboard"
            dashboard_url = "/app/"
        elif profile.role in ("superadmin", "super_admin"):
            dashboard_label = "Admin Dashboard"
            dashboard_url = "/admin/"
    elif request.user.is_superuser:
        dashboard_label = "Admin Dashboard"
        dashboard_url = "/admin/"
    return {
        "site_nav": {
            "is_authenticated": True,
            "dashboard_label": dashboard_label,
            "dashboard_url": dashboard_url,
        }
    }
