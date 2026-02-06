from pathlib import Path

from core.models import ThemeSettings

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def react_dashboard(request, path=""):
    index_path = Path(settings.BASE_DIR) / "frontend" / "app" / "dist" / "index.html"
    if not index_path.exists():
        return HttpResponseNotFound(
            "React app not built. Run npm install and npm run build in frontend/app."
        )
    html = index_path.read_text(encoding="utf-8")
    theme = ThemeSettings.get_active()
    primary = theme.primary_color or "#38bdf8"
    secondary = theme.secondary_color or primary

    def _hex_to_rgb(value):
        hex_value = (value or "").lstrip("#")
        if len(hex_value) == 3:
            hex_value = "".join([c * 2 for c in hex_value])
        if len(hex_value) != 6:
            return "56, 189, 248"
        r = int(hex_value[0:2], 16)
        g = int(hex_value[2:4], 16)
        b = int(hex_value[4:6], 16)
        return f"{r}, {g}, {b}"

    primary_rgb = _hex_to_rgb(primary)
    secondary_rgb = _hex_to_rgb(secondary)
    theme_style = (
        "<style id=\"wz-brand-colors\">"
        ":root{"
        f"--color-primary:{primary};"
        f"--color-primary-hover:{primary};"
        f"--color-accent:{secondary};"
        f"--color-highlight:{secondary};"
        f"--color-primary-rgb:{primary_rgb};"
        f"--color-accent-rgb:{secondary_rgb};"
        "}"
        "</style>"
    )
    if "</head>" in html:
        html = html.replace("</head>", f"{theme_style}</head>", 1)
    return HttpResponse(html, content_type="text/html")
