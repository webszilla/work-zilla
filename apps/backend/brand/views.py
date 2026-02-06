from django.conf import settings
from django.http import HttpResponse

from .models import SiteBrandSettings


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
