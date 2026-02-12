from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse, HttpResponseNotModified, JsonResponse

from .models import SiteBrandSettings
from .branding import compute_etag
from .serializers import serialize_branding


def theme_css(request):
    theme = SiteBrandSettings.get_active()
    primary = theme.primary_color or "#1f6f8b"
    secondary = theme.secondary_color or "#0f172a"
    primary_button = theme.primary_button_color or primary
    primary_button_hover = theme.primary_button_hover_color or primary
    secondary_button = theme.secondary_button_color or primary
    secondary_button_hover = theme.secondary_button_hover_color or secondary
    accent = theme.accent_color or primary

    css = (
        ":root{\n"
        f"  --color-primary:{primary};\n"
        f"  --color-secondary:{secondary};\n"
        f"  --color-primary-button:{primary_button};\n"
        f"  --color-primary-button-hover:{primary_button_hover};\n"
        f"  --color-secondary-button:{secondary_button};\n"
        f"  --color-secondary-button-hover:{secondary_button_hover};\n"
        f"  --color-accent:{accent};\n"
        "}\n"
    )
    response = HttpResponse(css, content_type="text/css")
    if settings.DEBUG:
        response["Cache-Control"] = "no-cache"
    else:
        response["Cache-Control"] = "public, max-age=300"
    return response


def public_branding(request):
    product_key = request.GET.get("product", "").strip()
    cache_key = f"branding:public:{product_key or 'default'}"
    cached = cache.get(cache_key)
    if cached:
        payload, etag = cached
    else:
        payload = serialize_branding(product_key, request=request)
        etag = compute_etag(payload)
        cache.set(cache_key, (payload, etag), 900)

    if request.headers.get("If-None-Match") == f"\"{etag}\"":
        return HttpResponseNotModified()

    response = JsonResponse(payload)
    response["ETag"] = f"\"{etag}\""
    response["Cache-Control"] = "public, max-age=900"
    return response
