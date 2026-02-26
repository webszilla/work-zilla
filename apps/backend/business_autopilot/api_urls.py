from django.urls import path

from . import api_views


urlpatterns = [
    path("modules", api_views.org_enabled_modules, name="business_autopilot_modules"),
    path("users", api_views.org_users, name="business_autopilot_users"),
    path("users/<int:membership_id>", api_views.org_user_detail, name="business_autopilot_user_detail"),
    path("employee-roles", api_views.org_employee_roles, name="business_autopilot_employee_roles"),
    path("employee-roles/<int:role_id>", api_views.org_employee_role_detail, name="business_autopilot_employee_role_detail"),
    path("departments", api_views.org_departments, name="business_autopilot_departments"),
    path("departments/<int:department_id>", api_views.org_department_detail, name="business_autopilot_department_detail"),
    path("accounts/workspace", api_views.accounts_workspace, name="business_autopilot_accounts_workspace"),
    path(
        "accounts/documents/<slug:doc_type>/<str:doc_id>/print",
        api_views.accounts_document_print,
        name="business_autopilot_accounts_document_print",
    ),
]
