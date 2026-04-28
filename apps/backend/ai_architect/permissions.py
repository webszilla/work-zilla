from django.http import HttpResponseForbidden

from core.models import UserProfile


def is_saas_admin_user(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True
    profile = UserProfile.objects.filter(user=user).only("role").first()
    role = str(getattr(profile, "role", "") or "").strip().lower().replace("-", "_").replace(" ", "_")
    return bool(profile and role in ("superadmin", "super_admin", "saas_admin", "saasadmin"))


def require_saas_admin(view_fn):
    def wrapped(request, *args, **kwargs):
        if not is_saas_admin_user(request.user):
            return HttpResponseForbidden("Access denied.")
        return view_fn(request, *args, **kwargs)

    wrapped.__name__ = getattr(view_fn, "__name__", "wrapped")
    wrapped.__doc__ = getattr(view_fn, "__doc__", "")
    return wrapped

