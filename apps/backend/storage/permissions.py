from django.contrib.auth import get_user_model

from dashboard import views as dashboard_views
from core.models import Organization, UserProfile


User = get_user_model()


def get_active_org(request):
    return dashboard_views.get_active_org(request)


def get_profile(user):
    return dashboard_views.get_profile(user)


def is_saas_admin(user):
    return dashboard_views.is_super_admin_user(user)


def is_org_admin(user):
    profile = get_profile(user)
    if not profile:
        return False
    return profile.role in ("company_admin",)


def resolve_org_for_user(user, request=None):
    if request is not None:
        org = get_active_org(request)
        if org:
            return org
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    if profile and profile.organization:
        return profile.organization
    return Organization.objects.filter(owner=user).first()


def can_access_owner(user, owner_id, org_admin=False):
    if org_admin:
        return True
    return str(user.id) == str(owner_id)


def resolve_owner_target(request, org, allow_override=False):
    owner_id = request.GET.get("owner_id") or request.POST.get("owner_id")
    if allow_override and owner_id:
        return User.objects.filter(id=owner_id).first()
    return request.user
