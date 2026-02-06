from django.test import TestCase
from rest_framework.test import APITestCase
from unittest.mock import patch

from django.urls import reverse
from django.contrib.auth import get_user_model
from core.models import Organization, UserProfile


User = get_user_model()


class MediaLibraryPermissionTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Org", company_key="org-key")
        self.user = User.objects.create_user(username="orgadmin", email="org@example.com", password="pass")
        UserProfile.objects.create(user=self.user, role="company_admin", organization=self.org)
        self.admin = User.objects.create_user(username="admin", email="admin@example.com", password="pass", is_staff=True)

    @patch("apps.backend.media_library.api_views.list_folders")
    @patch("apps.backend.media_library.api_views.get_storage_context")
    def test_org_admin_can_list_folders(self, mock_context, mock_list):
        mock_context.return_value = type(
            "ctx",
            (),
            {
                "base_prefix": "screenshots/1/",
                "settings_obj": type("settings", (), {"storage_mode": "object"})(),
            },
        )
        mock_list.return_value = [{"name": "test", "prefix": "screenshots/1/test/"}]
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/storage/media/folders")
        self.assertEqual(response.status_code, 200)

    @patch("apps.backend.media_library.api_views.list_folders")
    @patch("apps.backend.media_library.api_views.get_storage_context")
    def test_non_admin_forbidden(self, mock_context, mock_list):
        user = User.objects.create_user(username="user", email="user@example.com", password="pass")
        self.client.force_authenticate(user)
        response = self.client.get("/api/storage/media/folders")
        self.assertEqual(response.status_code, 403)

    @patch("apps.backend.media_library.api_views.list_folders")
    @patch("apps.backend.media_library.api_views.get_storage_context")
    def test_saas_admin_can_list_folders(self, mock_context, mock_list):
        mock_context.return_value = type(
            "ctx",
            (),
            {
                "base_prefix": "screenshots/",
                "settings_obj": type("settings", (), {"storage_mode": "object"})(),
            },
        )
        mock_list.return_value = []
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/storage/media/folders")
        self.assertEqual(response.status_code, 200)
