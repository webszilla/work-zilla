from rest_framework.permissions import BasePermission

from core.subscription_utils import has_active_subscription


class HasActiveProductSubscription(BasePermission):
    message = "subscription_required"

    def has_permission(self, request, view):
        slug = getattr(view, "product_slug", None) or request.query_params.get("product")
        if not slug:
            return False
        return has_active_subscription(request.user, slug)
