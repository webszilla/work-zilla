from pathlib import Path
import sys

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.http import JsonResponse
from django.urls import path, include, re_path
from django.views.generic import RedirectView

# Temporary compatibility for legacy worksuite imports (e.g. "from dashboard ...").
WORKSUITE_ROOT = Path(settings.BASE_DIR) / "worksuite"
if WORKSUITE_ROOT.is_dir() and str(WORKSUITE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSUITE_ROOT))

from core import views as monitor_core_views
from core import views_auth as monitor_auth_views
from core import views_public as monitor_public_views
from dashboard import views as dashboard_views
from apps.backend.worksuite.admin_views import monitor_products_hub, monitor_product_features
from apps.backend.brand import views as brand_views
from apps.backend.core_platform.views_spa import spa_serve
from apps.backend.website import urls as website_urls
from apps.backend.website import views as website_views
from saas_admin.views_reports import observability_report

from apps.backend.common_auth import api_views as common_auth_api_views

admin.site.site_header = "Work Zilla Administration"
admin.site.site_title = "Work Zilla Administration"


def health_check(request):
    return JsonResponse({"status": "ok", "service": "backend"})


urlpatterns = [
    path("", include(website_urls)),
    path("theme.css", brand_views.theme_css, name="theme_css"),
    path("auth/", include("apps.backend.common_auth.urls")),
    path("enquiries/", include("apps.backend.enquiries.urls")),
    path("admin/monitor-product/", monitor_product_features, name="monitor_product_features"),
    path("admin/monitor-products/", monitor_products_hub),
    path("admin/worksuite-product/", monitor_product_features, name="worksuite_product_features"),
    path("admin/worksuite-products/", monitor_products_hub),
    path("admin/", admin.site.urls),
    path("saas-admin/reports/observability/", observability_report, name="saas_admin_observability"),
    path("my/account/", RedirectView.as_view(url="/my-account/", permanent=False)),
    path("accounts/login/", RedirectView.as_view(url="/auth/login/", permanent=False)),
    path("accounts/logout/", RedirectView.as_view(url="/auth/logout/", permanent=False)),
    path("signup/", RedirectView.as_view(url="/auth/signup/", permanent=False)),
    path("products/", include("apps.backend.products.urls")),
    path("ai-chatbox/<slug:slug>-<str:code>/", monitor_public_views.public_chatbox, name="public_chatbox"),
    path("agent-signup/", monitor_auth_views.agent_signup),
    path("hr-login/", monitor_auth_views.hr_login),
    path("select-organization/", dashboard_views.select_organization),
    path("api/health", health_check),
    path("api/public/products", monitor_public_views.public_products),
    path("api/public/plans", monitor_public_views.public_plans),
    path("api/public/branding/", brand_views.public_branding),
    path("api/subscription/start", website_views.subscription_start),
    path("api/employee/register", monitor_core_views.register_employee),
    path("api/org/register", monitor_core_views.register_org),
    path("api/auth/csrf", common_auth_api_views.csrf_token),
    path("api/auth/login", common_auth_api_views.api_login),
    path("api/auth/logout", common_auth_api_views.api_logout),
    path("api/auth/me", monitor_auth_views.auth_me),
    path("api/auth/subscriptions", monitor_auth_views.auth_subscriptions),
    path("api/v2/", include("apps.backend.core_platform.api_v2_urls")),
    path("api/dashboard/", include("dashboard.api_urls")),
    path("api/ai-chatbot/", include("ai_chatbot.api_urls")),
    path("api/saas-admin/", include("saas_admin.api_urls")),
    path("api/backup/", include("apps.backend.backups.api_urls")),
    path("api/monitoring/", include("saas_admin.monitoring.api_urls")),
    path("api/storage/media/", include("apps.backend.media_library.api_urls")),
    path("api/storage/", include("apps.backend.storage.api_urls")),
    path("api/storage/files/", include("apps.backend.storage.api_urls")),
    path("api/storage/explorer/", include("apps.backend.storage.api_explorer_urls")),
    path("api/business-autopilot/", include("apps.backend.business_autopilot.api_urls")),
    path("api/activity/upload", monitor_core_views.upload_activity),
    path("api/org/settings", monitor_core_views.org_settings),
    path("api/screenshot/upload", monitor_core_views.upload_screenshot),
    path("api/monitor/heartbeat", monitor_core_views.monitor_heartbeat),
    path("api/monitor/stop", monitor_core_views.monitor_stop_event),
    path("api/worksuite/stop", monitor_core_views.monitor_stop_event),
    re_path(r"^app/(?P<path>.*)$", spa_serve, name="spa"),
]

if settings.DEBUG:
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
