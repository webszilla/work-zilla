from django.urls import path

from . import views


urlpatterns = [
    path("status", views.ai_status, name="ai_architect_status"),
    path("settings", views.ai_settings, name="ai_architect_settings"),
    path("test", views.ai_test, name="ai_architect_test"),
    path("usage", views.ai_usage, name="ai_architect_usage"),
    path("chat", views.ai_chat, name="ai_architect_chat"),
    path("history", views.ai_history, name="ai_architect_history"),
]
