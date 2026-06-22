from unittest.mock import patch

from django.test import Client, TestCase
from django.urls import reverse

from .models import Organization, User


class SignupFlowTests(TestCase):
    def setUp(self):
        self.client = Client()

    def _signup_payload(self, **overrides):
        payload = {
            "first_name": "Test",
            "last_name": "User",
            "username": "testuser123",
            "email": "test@example.com",
            "company_name": "Acme Labs",
            "phone_number": "9876543210",
            "password1": "StrongPass@123",
            "password2": "StrongPass@123",
        }
        payload.update(overrides)
        return payload

    @patch("apps.backend.common_auth.api_views.user_registration_success.send")
    @patch("apps.backend.common_auth.api_views.send_email_verification", return_value=False)
    @patch("apps.backend.common_auth.api_views.send_templated_email", return_value=False)
    def test_api_signup_rejects_duplicate_company_name(
        self,
        _mock_email,
        _mock_verification,
        _mock_signal,
    ):
        Organization.objects.create(name="Acme Labs")

        response = self.client.post(
            reverse("common_auth:signup").replace("/auth/signup/", "/api/auth/signup"),
            data=self._signup_payload(),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "validation_failed")
        self.assertIn("company_name", response.json()["field_errors"])
        self.assertEqual(User.objects.count(), 0)

    def test_signup_page_rejects_duplicate_company_name(self):
        Organization.objects.create(name="Acme Labs")

        session = self.client.session
        session["signup_captcha_answer"] = "4"
        session.save()

        response = self.client.post(
            reverse("common_auth:signup"),
            data={
                **self._signup_payload(),
                "captcha_answer": "4",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "An account with this company name already exists.")
        self.assertEqual(User.objects.count(), 0)
