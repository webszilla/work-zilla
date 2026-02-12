from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from dashboard.views import select_organization, SuperAdminUserDashboardAccessView, super_admin_open_company_dashboard, protected_screenshot_media
from core.views_auth import company_login, custom_logout
from core.views_spa import react_dashboard

urlpatterns = [
    path('admin/', admin.site.urls),
    path("oauth/", include("oauth2_provider.urls", namespace="oauth2_provider")),
    re_path(r"^app/(?P<path>.*)$", react_dashboard, name="react_dashboard"),
    path("api/dashboard/", include("dashboard.api_urls")),
    path("api/saas-admin/", include("saas_admin.api_urls")),
    path("api/ai-chatbot/", include("ai_chatbot.api_urls")),
    # Core
    path('', include("core.urls")),

    # Dashboard
    path('super-admin/user-dashboard-access/', SuperAdminUserDashboardAccessView.as_view(), name='super_admin_user_dashboard_access'),
    path('super-admin/user-dashboard-access/<int:org_id>/open/', super_admin_open_company_dashboard, name='super_admin_open_company_dashboard'),
    path('select-organization/', select_organization, name='select__org_root'),
    path('media/screenshots/<path:file_path>', protected_screenshot_media, name='protected_screenshot_media'),
    path("accounts/login/", company_login, name="login"),
    path("accounts/logout/", custom_logout, name="logout"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += staticfiles_urlpatterns()
