from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.backend.business_autopilot.models import OrganizationUser
from apps.backend.products.models import Product
from core.models import Organization, OrganizationProduct, Plan, Subscription, UserProductAccess, UserProfile


User = get_user_model()


class BusinessAutopilotUserAccessTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin@workzilla.test",
            email="admin@workzilla.test",
            password="pw123456",
        )
        self.org = Organization.objects.create(
            name="Acme Corp",
            company_key="ACMEKEY",
            owner=self.admin,
        )
        UserProfile.objects.create(
            user=self.admin,
            organization=self.org,
            role="company_admin",
        )

        self.ba_product, _ = Product.objects.get_or_create(
            slug="business-autopilot-erp",
            defaults={"name": "Business Autopilot"},
        )
        self.wa_product, _ = Product.objects.get_or_create(
            slug="whatsapp-automation",
            defaults={"name": "Whatsapp Automation"},
        )
        self.ba_plan = Plan.objects.create(name="Pro ERP", product=self.ba_product)
        self.wa_plan = Plan.objects.create(name="Professional", product=self.wa_product)
        Subscription.objects.create(
            user=self.admin,
            organization=self.org,
            plan=self.ba_plan,
            status="active",
        )
        Subscription.objects.create(
            user=self.admin,
            organization=self.org,
            plan=self.wa_plan,
            status="active",
        )
        OrganizationProduct.objects.create(
            organization=self.org,
            product=self.ba_product,
            subscription_status="active",
        )
        OrganizationProduct.objects.create(
            organization=self.org,
            product=self.wa_product,
            subscription_status="active",
        )

    def test_existing_org_user_requires_confirmation_and_keeps_password(self):
        existing_user = User.objects.create_user(
            username="pr@gmail.com",
            email="pr@gmail.com",
            password="samepass123",
            first_name="Pradeep",
            last_name="PR",
        )
        UserProfile.objects.create(
            user=existing_user,
            organization=self.org,
            role="org_user",
        )
        UserProductAccess.objects.create(
            user=existing_user,
            product=self.wa_product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=self.admin,
        )

        self.client.force_login(self.admin)
        initial_response = self.client.post(
            "/api/business-autopilot/users",
            data={
                "first_name": "Pradeep",
                "last_name": "PR",
                "email": "pr@gmail.com",
                "password": "newpass456",
                "role": "org_user",
            },
            content_type="application/json",
        )

        self.assertEqual(initial_response.status_code, 409)
        initial_payload = initial_response.json()
        self.assertEqual(initial_payload["detail"], "existing_org_user_requires_confirmation")
        self.assertTrue(initial_payload["same_password_allowed"])
        self.assertEqual(initial_payload["existing_products"][0]["slug"], "whatsapp-automation")
        existing_user.refresh_from_db()
        self.assertTrue(existing_user.check_password("samepass123"))
        self.assertFalse(
            UserProductAccess.objects.filter(user=existing_user, product=self.ba_product).exists()
        )

        confirmed_response = self.client.post(
            "/api/business-autopilot/users",
            data={
                "first_name": "Pradeep",
                "last_name": "PR",
                "email": "pr@gmail.com",
                "password": "newpass456",
                "role": "org_user",
                "confirm_existing_user": True,
            },
            content_type="application/json",
        )

        self.assertEqual(confirmed_response.status_code, 200)
        existing_user.refresh_from_db()
        self.assertTrue(existing_user.check_password("samepass123"))
        self.assertTrue(
            UserProductAccess.objects.filter(
                user=existing_user,
                product=self.ba_product,
                permission=UserProductAccess.PERMISSION_EDIT,
            ).exists()
        )
        self.assertTrue(
            OrganizationUser.objects.filter(organization=self.org, user=existing_user).exists()
        )

    def test_deleting_business_autopilot_user_only_revokes_that_product_access(self):
        product_user = User.objects.create_user(
            username="user@gmail.com",
            email="user@gmail.com",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=product_user,
            organization=self.org,
            role="org_user",
        )
        membership = OrganizationUser.objects.create(
            organization=self.org,
            user=product_user,
            role="org_user",
            is_active=True,
        )
        UserProductAccess.objects.create(
            user=product_user,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_EDIT,
            granted_by=self.admin,
        )
        UserProductAccess.objects.create(
            user=product_user,
            product=self.wa_product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/business-autopilot/users/{membership.id}")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(
            UserProductAccess.objects.filter(user=product_user, product=self.ba_product).exists()
        )
        self.assertTrue(
            UserProductAccess.objects.filter(user=product_user, product=self.wa_product).exists()
        )
        self.assertFalse(
            OrganizationUser.objects.filter(id=membership.id).exists()
        )

    def test_user_list_includes_org_memberships_even_without_product_access_rows(self):
        listed_user = User.objects.create_user(
            username="listed@gmail.com",
            email="listed@gmail.com",
            password="pw123456",
            first_name="Listed",
            last_name="User",
        )
        UserProfile.objects.create(
            user=listed_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=listed_user,
            role="org_user",
            is_active=True,
            department="Design",
            employee_role="Graphic Designer",
        )
        UserProductAccess.objects.filter(user=listed_user, product=self.ba_product).delete()

        self.client.force_login(self.admin)
        response = self.client.get("/api/business-autopilot/users")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        user_emails = {row.get("email") for row in payload.get("users", [])}
        self.assertIn("listed@gmail.com", user_emails)
