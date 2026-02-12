import hashlib
import json

from django.db import connection
from django.db.models import Q

from .models import Product, ProductAlias, ProductRouteMapping


DEFAULT_ALIAS_KEYS = {
    "ui": ["monitorLabel"],
}


def _normalize_slug(value):
    return str(value or "").strip("/").strip()


def _build_aliases(product):
    aliases = {"ui": {}, "marketing": {}, "email": {}}
    if not product or not getattr(product, "id", None):
        return aliases
    for alias in ProductAlias.objects.filter(product=product, is_active=True):
        aliases.setdefault(alias.context, {})[alias.alias_key] = alias.alias_text
    if product.key in ("monitor", "worksuite"):
        aliases["ui"].setdefault("monitorLabel", product.display_name)
    return aliases


def resolve_product(product_key):
    slug = _normalize_slug(product_key)
    route = None
    product = None

    if slug:
        route = (
            ProductRouteMapping.objects.select_related("product")
            .filter(public_slug=slug)
            .first()
        )
        if not route:
            if connection.vendor == "sqlite":
                for candidate in (
                    ProductRouteMapping.objects.select_related("product")
                ):
                    legacy = candidate.legacy_slugs or []
                    if slug in legacy:
                        route = candidate
                        break
            else:
                route = (
                    ProductRouteMapping.objects.select_related("product")
                    .filter(legacy_slugs__contains=[slug])
                    .first()
                )
        if route:
            product = route.product

    if not product and slug:
        lookup_slugs = [slug]
        if slug == "worksuite":
            lookup_slugs.append("monitor")
        product = (
            Product.objects.filter(
                Q(key__in=lookup_slugs) | Q(internal_code_name__in=lookup_slugs)
            )
            .filter(is_active=True)
            .first()
        )

    if not product:
        product = Product.get_default()
        route = (
            ProductRouteMapping.objects.select_related("product")
            .filter(product=product)
            .first()
        )

    return product, route


def build_branding_payload(product_key, request=None):
    product, route = resolve_product(product_key)
    logo_url = ""
    if product and product.logo:
        logo_url = product.logo.url
        if request is not None and logo_url.startswith("/"):
            logo_url = request.build_absolute_uri(logo_url)

    public_slug = route.public_slug if route else (product.key if product else "")
    legacy_slugs = route.legacy_slugs if route else []

    payload_key = public_slug or (product.key if product else "")

    payload = {
        "key": payload_key,
        "displayName": product.display_name if product else "",
        "tagline": product.tagline if product else "",
        "description": product.description if product else "",
        "logoUrl": logo_url,
        "primaryColor": product.primary_color if product else "",
        "publicSlug": public_slug,
        "legacySlugs": legacy_slugs,
        "aliases": _build_aliases(product),
    }

    return payload


def compute_etag(payload):
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(serialized.encode("utf-8")).hexdigest()
