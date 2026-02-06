from django.urls import path

from . import api_views


urlpatterns = [
    path("ingest/metrics", api_views.IngestMetricsView.as_view()),
    path("ingest/heartbeat", api_views.IngestHeartbeatView.as_view()),
    path("servers", api_views.ServerListView.as_view()),
    path("servers/<uuid:server_id>", api_views.ServerDetailView.as_view()),
    path("servers/<uuid:server_id>/metrics", api_views.ServerMetricsView.as_view()),
    path("settings", api_views.MonitoringSettingsView.as_view()),
    path("servers/<uuid:server_id>/token", api_views.ServerTokenView.as_view()),
    path("alerts", api_views.AlertListView.as_view()),
]
