from .models import SiteBrandSettings


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
