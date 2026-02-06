from datetime import timedelta

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.utils import timezone

from core.models import Organization, UserProfile

from apps.backend.retention.middleware import RetentionEnforcementMiddleware
from apps.backend.retention.models import (
    EffectiveRetentionPolicy,
    RetentionStatus,
    TenantRetentionOverride,
    TenantRetentionStatus,
    compute_retention_status,
    resolve_effective_policy,
)


class RetentionPolicyTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Acme", company_key="acme")

    def test_compute_transitions(self):
        now = timezone.now()
        policy = EffectiveRetentionPolicy(
            grace_days=30,
            archive_days=60,
            hard_delete_days=10,
            allowed_actions_during_grace=["view", "export"],
        )
        expires_at = now - timedelta(days=1)
        status, grace_until, archive_until, delete_at = compute_retention_status(
            expires_at, policy, now=now
        )
        self.assertEqual(status, RetentionStatus.GRACE_READONLY)
        self.assertTrue(grace_until > expires_at)
        self.assertTrue(archive_until > grace_until)
        self.assertTrue(delete_at > archive_until)

        later = now + timedelta(days=200)
        status, *_ = compute_retention_status(expires_at, policy, now=later)
        self.assertEqual(status, RetentionStatus.PENDING_DELETE)

    def test_override_precedence(self):
        TenantRetentionOverride.objects.create(
            organization=self.org,
            grace_days=5,
        )
        policy = resolve_effective_policy(self.org)
        self.assertEqual(policy.grace_days, 5)


class RetentionMiddlewareTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = get_user_model().objects.create_user(
            username="user1",
            email="user1@example.com",
            password="pass1234",
        )
        self.org = Organization.objects.create(name="Globex", company_key="globex")
        UserProfile.objects.create(user=self.user, organization=self.org)

    def _middleware(self):
        return RetentionEnforcementMiddleware(lambda request: HttpResponse("ok"))

    def test_grace_readonly_blocks_write(self):
        TenantRetentionStatus.objects.create(
            organization=self.org,
            status=RetentionStatus.GRACE_READONLY,
        )
        request = self.factory.post("/api/some-endpoint")
        request.user = self.user
        response = self._middleware()(request)
        self.assertEqual(response.status_code, 403)

    def test_archived_blocks_all(self):
        TenantRetentionStatus.objects.create(
            organization=self.org,
            status=RetentionStatus.ARCHIVED,
        )
        request = self.factory.get("/app/")
        request.user = self.user
        response = self._middleware()(request)
        self.assertEqual(response.status_code, 403)
