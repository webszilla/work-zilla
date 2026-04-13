from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.backend.imposition.models import ImpositionOrgSubscription
from apps.backend.products.models import Product
from apps.backend.storage.models import OrgSubscription as StorageOrgSubscription
from core.models import Organization, OrganizationProduct, Subscription, UserProductAccess, UserProfile


User = get_user_model()

APP_PRODUCT_PREFIXES = {
    "/app/work-suite": "monitor",
    "/app/worksuite": "monitor",
    "/app/monitor": "monitor",
    "/app/ai-chatbot": "ai-chatbot",
    "/app/storage": "storage",
    "/app/imposition": "imposition-software",
    "/app/business-autopilot": "business-autopilot-erp",
    "/app/whatsapp-automation": "whatsapp-automation",
    "/app/digital-automation": "digital-automation",
}

API_PRODUCT_PREFIXES = {
    "/api/activity/": "monitor",
    "/api/screenshot/": "monitor",
    "/api/monitor/": "monitor",
    "/api/worksuite/": "monitor",
    "/api/org/settings": "monitor",
    "/api/org/agents": "ai-chatbot",
    "/api/org/ai-chatbot/": "ai-chatbot",
    "/api/org/ai-chatbox/": "ai-chatbot",
    "/api/digital-automation/": "digital-automation",
}

EXEMPT_PREFIXES = (
    "/app/",
    "/app/plans",
    "/app/billing",
    "/app/bank-transfer",
    "/app/profile",
    "/app/saas-admin",
    "/app/dealer-",
    "/app/dealer-dashboard",
)

PERMISSION_RANK = {
    UserProductAccess.PERMISSION_VIEW: 1,
    UserProductAccess.PERMISSION_EDIT: 2,
    UserProductAccess.PERMISSION_FULL: 3,
}


def _normalize_profile_role(value: str | None) -> str:
    raw_value = str(value or "").strip().lower()
    compact_value = "".join(ch for ch in raw_value if ch.isalnum())
    alias_map = {
        "companyadmin": "ORG_ADMIN",
        "orgadmin": "ORG_ADMIN",
        "organizationadmin": "ORG_ADMIN",
        "owner": "ORG_ADMIN",
        "superadmin": "SYSTEM_ADMIN",
        "superuser": "SYSTEM_ADMIN",
        "super_admin": "SYSTEM_ADMIN",
        "dealer": "DEALER",
        "orguser": "EMPLOYEE",
        "employee": "EMPLOYEE",
        "hrview": "EMPLOYEE",
        "aichatbotagent": "EMPLOYEE",
    }
    normalized = alias_map.get(compact_value)
    if normalized:
        return normalized
    return raw_value.upper() if raw_value else ""


def normalize_product_slug(product_slug: str | None) -> str:
    slug = str(product_slug or "").strip().lower()
    if slug in {"work-suite", "worksuite"}:
        return "monitor"
    return slug


def get_request_product_slug(path: str | None) -> str:
    candidate = str(path or "").strip()
    for prefix, product_slug in APP_PRODUCT_PREFIXES.items():
        if candidate == prefix or candidate.startswith(f"{prefix}/"):
            return product_slug
    for prefix, product_slug in API_PRODUCT_PREFIXES.items():
        if candidate == prefix or candidate.startswith(prefix):
            return product_slug
    return ""


def is_exempt_product_path(path: str | None) -> bool:
    candidate = str(path or "").strip()
    return any(candidate == prefix or candidate.startswith(f"{prefix}/") for prefix in EXEMPT_PREFIXES)


def get_user_profile(user) -> Optional[UserProfile]:
    if not user or not getattr(user, "is_authenticated", False):
        return None
    return UserProfile.objects.filter(user=user).select_related("organization").first()


def get_user_organization(user, profile: Optional[UserProfile] = None) -> Optional[Organization]:
    if not user or not getattr(user, "is_authenticated", False):
        return None
    profile = profile or get_user_profile(user)
    profile_role = _normalize_profile_role(getattr(profile, "role", ""))
    if profile_role == "DEALER":
        return None
    if user.is_superuser or profile_role == "SYSTEM_ADMIN":
        return None
    if profile and profile.organization_id:
        return profile.organization
    return Organization.objects.filter(owner=user).first()


def get_access_role(user, profile: Optional[UserProfile] = None) -> str:
    if not user or not getattr(user, "is_authenticated", False):
        return ""
    if user.is_superuser:
        return "SYSTEM_ADMIN"
    profile = profile or get_user_profile(user)
    if profile:
        normalized_role = _normalize_profile_role(profile.role)
        if normalized_role:
            return normalized_role
    if Organization.objects.filter(owner=user).exists():
        return "ORG_ADMIN"
    return ""


def get_required_permission_rank(permission: str) -> int:
    return PERMISSION_RANK.get(str(permission or "").strip().lower(), PERMISSION_RANK[UserProductAccess.PERMISSION_VIEW])


def org_has_product_subscription(org: Optional[Organization], product_slug: str | None) -> bool:
    org_id = getattr(org, "id", None)
    slug = normalize_product_slug(product_slug)
    if not org_id or not slug:
        return False

    org_product_filter = Q(product__slug=slug)
    subscription_filter = Q(plan__product__slug=slug)

    # Work Suite is still stored in some places under the legacy "worksuite" slug.
    if slug == "monitor":
        org_product_filter |= Q(product__slug="worksuite")
        subscription_filter |= Q(plan__product__slug="worksuite") | Q(plan__product__isnull=True)

    if OrganizationProduct.objects.filter(
        organization_id=org_id,
        subscription_status__in=("active", "trialing"),
    ).filter(org_product_filter).exists():
        return True

    if Subscription.objects.filter(
        organization_id=org_id,
        status__in=("active", "trialing"),
    ).filter(subscription_filter).exists():
        return True

    if slug == "storage":
        return StorageOrgSubscription.objects.filter(
            organization_id=org_id,
            status__in=("active", "trialing"),
        ).exists()

    if slug == "imposition-software":
        return ImpositionOrgSubscription.objects.filter(
            organization_id=org_id,
            status__in=("active", "trialing"),
        ).exists()

    return False


def get_user_product_permission(user, product_slug: str | None) -> str:
    slug = normalize_product_slug(product_slug)
    if not getattr(user, "is_authenticated", False) or not slug:
        return ""
    entry = (
        UserProductAccess.objects
        .filter(user=user, product__slug=slug)
        .values_list("permission", flat=True)
        .first()
    )
    return entry or ""


@dataclass
class ProductAccessDecision:
    allowed: bool
    status_code: int
    detail: str
    role: str = ""
    permission: str = ""
    product_slug: str = ""
    org_id: Optional[int] = None

    @property
    def is_authenticated(self) -> bool:
        return self.status_code != 401


def check_product_access(user, product_slug: str | None, permission: str = "view") -> ProductAccessDecision:
    slug = normalize_product_slug(product_slug)
    if not getattr(user, "is_authenticated", False):
        return ProductAccessDecision(
            allowed=False,
            status_code=401,
            detail="login_required",
            product_slug=slug,
        )

    profile = get_user_profile(user)
    role = get_access_role(user, profile)
    org = get_user_organization(user, profile)

    if role in {"SYSTEM_ADMIN", "DEALER"}:
        return ProductAccessDecision(
            allowed=True,
            status_code=200,
            detail="ok",
            role=role,
            permission=UserProductAccess.PERMISSION_FULL,
            product_slug=slug,
            org_id=getattr(org, "id", None),
        )

    if not org:
        return ProductAccessDecision(
            allowed=False,
            status_code=403,
            detail="organization_required",
            role=role,
            product_slug=slug,
        )

    if not org_has_product_subscription(org, slug):
        return ProductAccessDecision(
            allowed=False,
            status_code=403,
            detail="product_not_subscribed",
            role=role,
            product_slug=slug,
            org_id=org.id,
        )

    if role == "ORG_ADMIN":
        return ProductAccessDecision(
            allowed=True,
            status_code=200,
            detail="ok",
            role=role,
            permission=UserProductAccess.PERMISSION_FULL,
            product_slug=slug,
            org_id=org.id,
        )

    if role != "EMPLOYEE":
        return ProductAccessDecision(
            allowed=False,
            status_code=403,
            detail="unsupported_role",
            role=role,
            product_slug=slug,
            org_id=org.id,
        )

    granted_permission = get_user_product_permission(user, slug)
    if not granted_permission:
        return ProductAccessDecision(
            allowed=False,
            status_code=403,
            detail="product_access_not_granted",
            role=role,
            product_slug=slug,
            org_id=org.id,
        )

    if get_required_permission_rank(granted_permission) < get_required_permission_rank(permission):
        return ProductAccessDecision(
            allowed=False,
            status_code=403,
            detail="insufficient_permission",
            role=role,
            permission=granted_permission,
            product_slug=slug,
            org_id=org.id,
        )

    return ProductAccessDecision(
        allowed=True,
        status_code=200,
        detail="ok",
        role=role,
        permission=granted_permission,
        product_slug=slug,
        org_id=org.id,
    )


def build_login_redirect(path: str, query_string: str = "") -> str:
    suffix = f"{path}?{query_string}" if query_string else path
    return f"/auth/login/?next={quote(suffix, safe='/?=&:%#')}"


def iter_accessible_product_slugs(user):
    profile = get_user_profile(user)
    role = get_access_role(user, profile)
    org = get_user_organization(user, profile)

    if role in {"SYSTEM_ADMIN", "DEALER"}:
        for slug in Product.objects.order_by("sort_order", "name").values_list("slug", flat=True):
            yield normalize_product_slug(slug)
        return

    if not org:
        return

    subscribed_slugs = set(
        OrganizationProduct.objects.filter(
            organization=org,
            subscription_status__in=("active", "trialing"),
        ).values_list("product__slug", flat=True)
    )

    if not subscribed_slugs:
        subscribed_slugs.update(
            Subscription.objects.filter(
                organization=org,
                status__in=("active", "trialing"),
                plan__product__isnull=False,
            ).values_list("plan__product__slug", flat=True)
        )
        if StorageOrgSubscription.objects.filter(organization=org, status__in=("active", "trialing")).exists():
            subscribed_slugs.add("storage")
        if ImpositionOrgSubscription.objects.filter(organization=org, status__in=("active", "trialing")).exists():
            subscribed_slugs.add("imposition-software")

    if role == "ORG_ADMIN":
        for slug in sorted({normalize_product_slug(item) for item in subscribed_slugs if item}):
            yield slug
        return

    access_map = dict(
        UserProductAccess.objects.filter(
            user=user,
            product__slug__in=subscribed_slugs,
        ).values_list("product__slug", "permission")
    )
    for slug in sorted({normalize_product_slug(item) for item in access_map if item}):
        yield slug
