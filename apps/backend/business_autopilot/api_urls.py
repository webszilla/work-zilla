from django.urls import path

from . import api_views


urlpatterns = [
    path("modules", api_views.org_enabled_modules, name="business_autopilot_modules"),
    path("users", api_views.org_users, name="business_autopilot_users"),
    path("users/addon-checkout", api_views.org_users_addon_checkout, name="business_autopilot_users_addon_checkout"),
    path("users/<int:membership_id>", api_views.org_user_detail, name="business_autopilot_user_detail"),
    path("employee-roles", api_views.org_employee_roles, name="business_autopilot_employee_roles"),
    path("departments", api_views.org_departments, name="business_autopilot_departments"),
    path(
        "employee-roles/<int:role_id>",
        api_views.org_employee_role_detail,
        name="business_autopilot_employee_role_detail",
    ),
    path(
        "departments/<int:department_id>",
        api_views.org_department_detail,
        name="business_autopilot_department_detail",
    ),
]
