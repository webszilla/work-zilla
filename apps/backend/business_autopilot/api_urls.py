from django.urls import path

from . import api_views


urlpatterns = [
    path("modules", api_views.org_enabled_modules, name="business_autopilot_modules"),
    path("users", api_views.org_users, name="business_autopilot_users"),
    path("users/<int:membership_id>", api_views.org_user_detail, name="business_autopilot_user_detail"),
    path("users/<int:membership_id>/toggle-status", api_views.org_user_toggle_status, name="business_autopilot_user_toggle_status"),
    path("users/<int:membership_id>/verify-email", api_views.org_user_verify_email, name="business_autopilot_user_verify_email"),
    path(
        "users/<int:membership_id>/resend-credentials",
        api_views.org_user_resend_credentials,
        name="business_autopilot_user_resend_credentials",
    ),
    path("role-access", api_views.org_role_access, name="business_autopilot_role_access"),
    path("openai/settings", api_views.org_openai_settings, name="business_autopilot_openai_settings"),
    path("openai/test", api_views.org_openai_test, name="business_autopilot_openai_test"),
    path("openai/chat", api_views.org_openai_chat, name="business_autopilot_openai_chat"),
    path("employee-roles", api_views.org_employee_roles, name="business_autopilot_employee_roles"),
    path("employee-roles/<int:role_id>", api_views.org_employee_role_detail, name="business_autopilot_employee_role_detail"),
    path("departments", api_views.org_departments, name="business_autopilot_departments"),
    path("departments/<int:department_id>", api_views.org_department_detail, name="business_autopilot_department_detail"),
    path("payroll/workspace", api_views.payroll_workspace, name="business_autopilot_payroll_workspace"),
    path("payroll/payslips/<int:payslip_id>/pdf", api_views.payroll_payslip_pdf, name="business_autopilot_payroll_payslip_pdf"),
    path("accounts/workspace", api_views.accounts_workspace, name="business_autopilot_accounts_workspace"),
    path("accounts/subscription-categories", api_views.accounts_subscription_categories, name="business_autopilot_accounts_subscription_categories"),
    path(
        "accounts/subscription-categories/<int:category_id>",
        api_views.accounts_subscription_category_detail,
        name="business_autopilot_accounts_subscription_category_detail",
    ),
    path("accounts/sub-categories", api_views.accounts_subscription_sub_categories, name="business_autopilot_accounts_subscription_sub_categories"),
    path(
        "accounts/sub-categories/<int:sub_category_id>",
        api_views.accounts_subscription_sub_category_detail,
        name="business_autopilot_accounts_subscription_sub_category_detail",
    ),
    path("accounts/subscriptions", api_views.accounts_subscriptions, name="business_autopilot_accounts_subscriptions"),
    path(
        "accounts/subscriptions/<int:subscription_id>",
        api_views.accounts_subscription_detail,
        name="business_autopilot_accounts_subscription_detail",
    ),
    path(
        "accounts/documents/<slug:doc_type>/<str:doc_id>/print",
        api_views.accounts_document_print,
        name="business_autopilot_accounts_document_print",
    ),
]
