from django.http import JsonResponse
from django.urls import path, include

from apps.backend.common_auth import api_views as common_auth_api_views
from core import views as monitor_core_views
from core import views_auth as monitor_auth_views


def health_check(request):
    return JsonResponse({"status": "ok", "service": "backend"})


urlpatterns = [
    path("health", health_check),
    path("auth/csrf", common_auth_api_views.csrf_token),
    path("auth/login", common_auth_api_views.api_login),
    path("auth/logout", common_auth_api_views.api_logout),
    path("auth/me", monitor_auth_views.auth_me),
    path("auth/subscriptions", monitor_auth_views.auth_subscriptions),
    path("dashboard/", include("dashboard.api_urls")),
    path("saas-admin/", include("saas_admin.api_urls")),
    path("activity/upload", monitor_core_views.upload_activity),
    path("org/settings", monitor_core_views.org_settings),
    path("screenshot/upload", monitor_core_views.upload_screenshot),
    path("monitor/stop", monitor_core_views.monitor_stop_event),
    path("worksuite/stop", monitor_core_views.monitor_stop_event),
]
