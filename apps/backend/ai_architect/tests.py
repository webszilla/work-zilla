from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase

from .permissions import require_saas_admin
from .services.code_reader import safe_read_files
from .services.crypto import decrypt_text, encrypt_text, mask_api_key


class AiArchitectGuardTests(SimpleTestCase):
    def test_require_saas_admin_blocks_when_not_admin(self):
        rf = RequestFactory()

        @require_saas_admin
        def sample_view(request):
            return HttpResponse("ok")

        request = rf.get("/api/saas-admin/ai-architect/status")
        request.user = type("U", (), {"is_authenticated": True})()

        with patch.dict(sample_view.__globals__, {"is_saas_admin_user": lambda _user: False}):
            response = sample_view(request)
        self.assertEqual(response.status_code, 403)


class AiArchitectCryptoTests(SimpleTestCase):
    def test_encrypt_decrypt_and_mask(self):
        token = encrypt_text("sk-test-1234")
        self.assertTrue(token)
        self.assertEqual(decrypt_text(token), "sk-test-1234")
        self.assertEqual(mask_api_key("sk-test-1234"), "sk-****1234")


class AiArchitectCodeReaderTests(SimpleTestCase):
    def test_blocks_env_and_path_traversal_and_env_dir(self):
        results = safe_read_files([".env", "../project_working_details.txt", "env/bin/activate"])
        self.assertEqual(results, [])

    def test_allows_whitelisted_source_file(self):
        results = safe_read_files(["apps/backend/core_platform/settings.py"])
        self.assertTrue(results)
        self.assertEqual(results[0]["path"], "apps/backend/core_platform/settings.py")
        self.assertIn("INSTALLED_APPS", results[0]["content"])
