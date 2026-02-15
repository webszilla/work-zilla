from django.urls import path

from .views import login_view, logout_view, signup_view, agent_login_view, verify_email_view

app_name = "common_auth"

urlpatterns = [
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
    path("signup/", signup_view, name="signup"),
    path("agent-login/", agent_login_view, name="agent_login"),
    path("verify-email/<int:user_id>/<str:token>/", verify_email_view, name="verify_email"),
]
