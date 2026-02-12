from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import UserProfile
from saas_admin.monitoring.models import ServerNode, MetricSample, MonitoringSettings
from saas_admin.monitoring.utils import hash_token


class ObservabilityApiTests(APITestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.admin_user = self.user_model.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass1234",
        )
        UserProfile.objects.create(user=self.admin_user, role="superadmin")
        self.normal_user = self.user_model.objects.create_user(
            username="user",
            email="user@example.com",
            password="pass1234",
        )
        UserProfile.objects.create(user=self.normal_user, role="employee")
        self.server = ServerNode.objects.create(
            name="prod-app-1",
            role="app",
            region="us",
            hostname="host1",
            token_hash=hash_token("secret-token"),
        )

    def test_invalid_token_rejected(self):
        resp = self.client.post("/api/monitoring/ingest/metrics", {"cpu_percent": 10}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_metric_upsert(self):
        headers = {"HTTP_AUTHORIZATION": "Bearer secret-token"}
        ts = timezone.now().replace(second=0, microsecond=0).isoformat()
        resp1 = self.client.post(
            "/api/monitoring/ingest/metrics",
            {"cpu_percent": 10, "ts": ts},
            format="json",
            **headers,
        )
        resp2 = self.client.post(
            "/api/monitoring/ingest/metrics",
            {"cpu_percent": 20, "ts": ts},
            format="json",
            **headers,
        )
        self.assertEqual(resp1.status_code, 201)
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(MetricSample.objects.filter(server=self.server).count(), 1)
        sample = MetricSample.objects.filter(server=self.server).first()
        self.assertEqual(sample.cpu_percent, 20)

    def test_heartbeat_updates_last_seen(self):
        headers = {"HTTP_AUTHORIZATION": "Bearer secret-token"}
        resp = self.client.post("/api/monitoring/ingest/heartbeat", {}, format="json", **headers)
        self.assertEqual(resp.status_code, 200)
        self.server.refresh_from_db()
        self.assertIsNotNone(self.server.last_seen_at)

    def test_settings_requires_saas_admin(self):
        self.client.force_login(self.normal_user)
        resp = self.client.get("/api/monitoring/settings")
        self.assertEqual(resp.status_code, 403)
        self.client.logout()
        self.client.force_login(self.admin_user)
        resp = self.client.get("/api/monitoring/settings")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        data["cpu_threshold"] = 77
        resp2 = self.client.post("/api/monitoring/settings", data, format="json")
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(MonitoringSettings.get_solo().cpu_threshold, 77)
