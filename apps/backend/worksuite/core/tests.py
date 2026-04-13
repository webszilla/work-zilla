from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
import os
import tempfile

from apps.backend.products.models import Product
from core.models import Organization, OrganizationProduct, Plan, Subscription, UserProductAccess, UserProfile


User = get_user_model()


class LegacyMonitorRedirectTests(TestCase):
    def test_monitor_redirects_to_worksuite(self):
        response = self.client.get("/monitor/")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/worksuite/")

    def test_app_monitor_redirects_to_worksuite(self):
        response = self.client.get("/app/monitor/dashboard")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/app/work-suite/dashboard")


class ProductAuthorizationMiddlewareTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Acme", company_key="ACMEKEY")
        self.product, _ = Product.objects.get_or_create(
            slug="ai-chatbot",
            defaults={"name": "AI Chatbot"},
        )
        self.plan = Plan.objects.create(name="Enterprise", product=self.product)
        self.ba_product, _ = Product.objects.get_or_create(
            slug="business-autopilot-erp",
            defaults={"name": "Business Autopilot"},
        )
        self.ba_plan = Plan.objects.create(name="Pro ERP", product=self.ba_product)

    def _create_subscription(self):
        owner = User.objects.create_user(username="owner@example.com", email="owner@example.com", password="pw123456")
        Subscription.objects.create(
            user=owner,
            organization=self.org,
            plan=self.plan,
            status="active",
        )
        OrganizationProduct.objects.update_or_create(
            organization=self.org,
            product=self.product,
            defaults={"subscription_status": "active", "source": "test"},
        )
        Subscription.objects.create(
            user=owner,
            organization=self.org,
            plan=self.ba_plan,
            status="active",
        )
        OrganizationProduct.objects.update_or_create(
            organization=self.org,
            product=self.ba_product,
            defaults={"subscription_status": "active", "source": "test"},
        )

    def test_org_admin_gets_full_access_to_subscribed_product(self):
        self._create_subscription()
        user = User.objects.create_user(username="admin@example.com", email="admin@example.com", password="pw123456")
        UserProfile.objects.create(user=user, organization=self.org, role="org_admin")

        self.client.force_login(user)
        response = self.client.get("/app/ai-chatbot/")

        self.assertEqual(response.status_code, 200)

    def test_company_admin_label_gets_full_access_to_business_autopilot(self):
        self._create_subscription()
        user = User.objects.create_user(username="legacy-admin@example.com", email="legacy-admin@example.com", password="pw123456")
        UserProfile.objects.create(user=user, organization=self.org, role="Company Admin")

        self.client.force_login(user)
        response = self.client.get("/app/business-autopilot/crm")

        self.assertEqual(response.status_code, 200)

    def test_employee_without_product_access_is_denied(self):
        self._create_subscription()
        user = User.objects.create_user(username="employee@example.com", email="employee@example.com", password="pw123456")
        UserProfile.objects.create(user=user, organization=self.org, role="employee")

        self.client.force_login(user)
        response = self.client.get("/app/ai-chatbot/")

        self.assertEqual(response.status_code, 403)
        self.assertIn("product_access_not_granted", response.content.decode("utf-8"))

    def test_employee_with_product_access_is_allowed(self):
        self._create_subscription()
        grantor = User.objects.create_user(username="admin2@example.com", email="admin2@example.com", password="pw123456")
        UserProfile.objects.create(user=grantor, organization=self.org, role="org_admin")
        user = User.objects.create_user(username="employee2@example.com", email="employee2@example.com", password="pw123456")
        UserProfile.objects.create(user=user, organization=self.org, role="employee")
        UserProductAccess.objects.create(
            user=user,
            product=self.product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=grantor,
        )

        self.client.force_login(user)
        response = self.client.get("/app/ai-chatbot/")

        self.assertEqual(response.status_code, 200)

    def test_auth_subscriptions_only_returns_employee_grants(self):
        self._create_subscription()
        admin_user = User.objects.create_user(username="admin3@example.com", email="admin3@example.com", password="pw123456")
        UserProfile.objects.create(user=admin_user, organization=self.org, role="org_admin")
        employee = User.objects.create_user(username="employee3@example.com", email="employee3@example.com", password="pw123456")
        UserProfile.objects.create(user=employee, organization=self.org, role="employee")

        self.client.force_login(employee)
        denied_payload = self.client.get("/api/auth/subscriptions").json()
        self.assertEqual(denied_payload["subscriptions"], [])

        UserProductAccess.objects.create(
            user=employee,
            product=self.product,
            permission=UserProductAccess.PERMISSION_EDIT,
            granted_by=admin_user,
        )
        allowed_payload = self.client.get("/api/auth/subscriptions").json()
        self.assertEqual(len(allowed_payload["subscriptions"]), 1)
        self.assertEqual(allowed_payload["subscriptions"][0]["product_slug"], "ai-chatbot")
        self.assertEqual(allowed_payload["subscriptions"][0]["permission"], "edit")

    def test_auth_subscriptions_returns_multiple_products_for_same_login(self):
        self._create_subscription()
        digital_product, _ = Product.objects.get_or_create(
            slug="digital-automation",
            defaults={"name": "Digital Automation"},
        )
        digital_plan = Plan.objects.create(name="DA Starter", product=digital_product)
        owner = User.objects.create_user(username="owner-multi@example.com", email="owner-multi@example.com", password="pw123456")
        UserProfile.objects.create(user=owner, organization=self.org, role="org_admin")
        Subscription.objects.create(
            user=owner,
            organization=self.org,
            plan=digital_plan,
            status="active",
        )
        OrganizationProduct.objects.update_or_create(
            organization=self.org,
            product=digital_product,
            defaults={"subscription_status": "active", "source": "test"},
        )

        self.client.force_login(owner)
        payload = self.client.get("/api/auth/subscriptions").json()
        product_slugs = sorted([row.get("product_slug") for row in payload.get("subscriptions", [])])
        self.assertEqual(product_slugs, ["ai-chatbot", "digital-automation"])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="wz-profile-photo-tests-"))
class UserProfilePhotoCleanupTests(TestCase):
    def test_replacing_profile_photo_deletes_old_file(self):
        user = User.objects.create_user(username="photo-user@example.com", email="photo-user@example.com", password="pw123456")
        profile = UserProfile.objects.create(user=user, role="org_user")
        first = SimpleUploadedFile("first.jpg", b"first-image-bytes", content_type="image/jpeg")
        second = SimpleUploadedFile("second.jpg", b"second-image-bytes", content_type="image/jpeg")

        profile.profile_photo = first
        profile.save()
        first_path = profile.profile_photo.path
        self.assertTrue(os.path.exists(first_path))

        profile.profile_photo = second
        profile.save()
        second_path = profile.profile_photo.path

        self.assertFalse(os.path.exists(first_path))
        self.assertTrue(os.path.exists(second_path))

    def test_deleting_user_deletes_profile_photo_file(self):
        user = User.objects.create_user(username="delete-user@example.com", email="delete-user@example.com", password="pw123456")
        profile = UserProfile.objects.create(
            user=user,
            role="org_user",
            profile_photo=SimpleUploadedFile("avatar.jpg", b"avatar-bytes", content_type="image/jpeg"),
        )
        file_path = profile.profile_photo.path
        self.assertTrue(os.path.exists(file_path))

        user.delete()

        self.assertFalse(os.path.exists(file_path))
