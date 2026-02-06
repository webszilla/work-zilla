from django.contrib.auth import get_user_model
from rest_framework.permissions import BasePermission

from core.models import UserProfile


def get_profile(user):
    if not user or not user.is_authenticated:
        return None
    return UserProfile.objects.filter(user=user).first()


def is_saas_admin(user, profile=None):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    if profile is None:
        profile = get_profile(user)
    return bool(profile and profile.role in ("superadmin", "super_admin"))


def is_org_admin(user, profile=None):
    if not user or not user.is_authenticated:
        return False
    if profile is None:
        profile = get_profile(user)
    return bool(profile and profile.role == "company_admin" and profile.organization_id)


class IsSaasAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_saas_admin(request.user)


class IsOrgAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_org_admin(request.user)
