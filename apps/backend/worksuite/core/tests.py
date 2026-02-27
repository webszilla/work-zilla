from django.test import TestCase


class LegacyMonitorRedirectTests(TestCase):
    def test_monitor_redirects_to_worksuite(self):
        response = self.client.get("/monitor/")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/worksuite/")

    def test_app_monitor_redirects_to_worksuite(self):
        response = self.client.get("/app/monitor/dashboard")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/app/work-suite/dashboard")
