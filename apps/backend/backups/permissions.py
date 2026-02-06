from core.models import Organization, UserProfile
from rest_framework.permissions import BasePermission

from .models import FeatureToggle
from dashboard.views import get_active_org

ADMIN_ROLES = {"company_admin", "superadmin", "super_admin", "owner"}


def is_org_admin(user, organization_id: int) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    org = Organization.objects.filter(id=organization_id).first()
    if not org:
        return False
    if org.owner_id == user.id:
        return True
    profile = UserProfile.objects.filter(user=user).first()
    if not profile:
        return False
    if profile.organization_id == organization_id and profile.role in ADMIN_ROLES:
        return True
    return False


class IsSaaSAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        profile = UserProfile.objects.filter(user=user).first()
        return bool(profile and profile.role in ("superadmin", "super_admin"))


class IsOrgAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        org_id = (
            request.data.get("organization_id")
            or request.query_params.get("organization_id")
            or view.kwargs.get("org_id")
        )
        if not org_id:
            org = get_active_org(request)
            if not org:
                return False
            org_id = org.id
        if user.is_superuser:
            return True
        org = Organization.objects.filter(id=org_id).first()
        if not org:
            return False
        if org.owner_id == user.id:
            return True
        profile = UserProfile.objects.filter(user=user).first()
        return bool(profile and profile.organization_id == org.id and profile.role in ADMIN_ROLES)


class IsFeatureEnabled(BasePermission):
    def has_permission(self, request, view):
        key = getattr(view, "feature_key", None)
        if not key:
            return True
        toggle = FeatureToggle.objects.filter(key=key, enabled=True).first()
        return bool(toggle)
