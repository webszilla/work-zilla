from django.urls import path
from . import views
from . import views_auth
from . import views_public
from . import oauth_views
from dashboard import views as dashboard_views
from ai_chatbot import api_views as ai_chatbot_api

urlpatterns = [
    # API
    path('org/register', views.register_org),
    path('employee/register', views.register_employee),
    path('api/employee/register', views.register_employee),
    path('api/monitor/heartbeat', views.monitor_heartbeat),
    path('activity/upload', views.upload_activity),
    path('screenshot/upload', views.upload_screenshot),
    path('api/activity/upload', views.upload_activity),
    path('api/screenshot/upload', views.upload_screenshot),
    path('api/monitor/stop', views.monitor_stop_event),
    path('api/worksuite/stop', views.monitor_stop_event),
    path('api/org/settings', views.org_settings),
    path("api/org/agents", ai_chatbot_api.org_agents_manage),
    path("api/org/agents/<int:agent_id>", ai_chatbot_api.org_agents_detail),
    path("api/org/ai-chatbot/agents", ai_chatbot_api.org_agents_manage),
    path("api/org/ai-chatbot/agents/<int:agent_id>", ai_chatbot_api.org_agents_detail),
    path("api/org/ai-chatbox/public-link", ai_chatbot_api.org_public_chat_link),
    path("api/org/ai-chatbox/qr.png", ai_chatbot_api.org_public_chat_qr_png),
    path("api/org/ai-chatbox/qr.svg", ai_chatbot_api.org_public_chat_qr_svg),
    path('report/<str:device_id>', views.employee_report),
    path("api/auth/me", views_auth.auth_me),
    path("oauth/userinfo/", oauth_views.userinfo),
    path("accounts/login/", views_auth.company_login, name="login"),
    path("accounts/logout/", views_auth.custom_logout, name="logout"),
    path("hr-login/", views_auth.hr_login, name="hr_login"),

    # Signup
    path("signup/", views_auth.company_signup, name="company_signup"),
    path("agent-signup/", views_auth.agent_signup, name="agent_signup"),

    # Public
    path("", views_public.home),
    path("pricing/", views_public.pricing),
    path("about/", views_public.about),
    path("contact/", views_public.contact),
    path("ai-chatbox/<slug:slug>-<str:code>/", views_public.public_chatbox, name="public_chatbox"),

    # Exports
    path("dashboard/export/csv/", dashboard_views.export_employees_csv),
    path("dashboard/export/pdf/", dashboard_views.export_employees_pdf),
    path("dashboard/bank-transfer/", dashboard_views.bank_transfer),
    path("dashboard/bank-transfer/<int:transfer_id>/", dashboard_views.bank_transfer),

    path(
        "dashboard/screenshot/delete-all/",
        views.delete_all_screenshots,
        name="delete_all_screenshots"
    ),
]
