from .models import SiteBrandSettings
from .branding import build_branding_payload


def brand_defaults(request):
    brand = SiteBrandSettings.get_active()
    og_image_url = ""
    if brand.og_image:
        og_image_url = brand.og_image.url
        if request is not None and og_image_url.startswith("/"):
            og_image_url = request.build_absolute_uri(og_image_url)
    return {
        "brand_settings": brand,
        "brand_site_name": brand.site_name or "Work Zilla",
        "brand_meta_title": brand.default_meta_title or brand.site_name or "Work Zilla",
        "brand_meta_description": brand.default_meta_description or "",
        "brand_og_image_url": og_image_url,
    }


def product_branding(request):
    product_key = ""
    if request is not None:
        product_key = request.GET.get("product", "")
        if not product_key and request.path.startswith("/products/"):
            product_key = request.path[len("/products/"):].strip("/")
    branding = build_branding_payload(product_key, request=request)
    branding["display_name"] = branding.get("displayName", "")
    branding["primary_color"] = branding.get("primaryColor", "")
    branding["public_slug"] = branding.get("publicSlug", "")
    branding["legacy_slugs"] = branding.get("legacySlugs", [])
    branding["logo_url"] = branding.get("logoUrl", "")
    return {"branding": branding}
