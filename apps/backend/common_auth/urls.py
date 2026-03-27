from django.urls import path

from .views import (
    login_view,
    logout_view,
    signup_view,
    signup_check_username_view,
    signup_check_email_view,
    agent_login_view,
    verify_email_view,
    forgot_password_view,
    reset_password_view,
)

app_name = "common_auth"

urlpatterns = [
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("signup/", signup_view, name="signup"),
    path("signup/check-username/", signup_check_username_view, name="signup_check_username"),
    path("signup/check-email/", signup_check_email_view, name="signup_check_email"),
    path("forgot-password/", forgot_password_view, name="forgot_password"),
    path("reset-password/<str:uidb64>/<str:token>/", reset_password_view, name="reset_password"),
    path("agent-login/", agent_login_view, name="agent_login"),
    path("verify-email/<int:user_id>/<str:token>/", verify_email_view, name="verify_email"),
]
