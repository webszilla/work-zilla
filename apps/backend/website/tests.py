from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.backend.business_autopilot.models import OrganizationUser
from apps.backend.products.models import Product
from core.models import Organization, OrganizationProduct, Plan, Subscription, UserProductAccess, UserProfile


User = get_user_model()


class AccountAccessScopeTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner@workzilla.test",
            email="owner@workzilla.test",
            password="pw123456",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create(
            name="Acme Corp",
            company_key="ACMEKEY",
            owner=self.owner,
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
            user=self.owner,
            organization=self.org,
            plan=self.ba_plan,
            status="active",
            billing_cycle="monthly",
        )
        Subscription.objects.create(
            user=self.owner,
            organization=self.org,
            plan=self.wa_plan,
            status="active",
            billing_cycle="monthly",
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

        self.employee = User.objects.create_user(
            username="user@workzilla.test",
            email="user@workzilla.test",
            password="pw123456",
        )
        self.employee.email_verified = True
        self.employee.save(update_fields=["email_verified"])
        UserProfile.objects.create(user=self.employee, organization=self.org, role="org_user")
        UserProductAccess.objects.create(
            user=self.employee,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=self.owner,
        )

    def test_product_user_account_page_shows_only_granted_product(self):
        self.client.force_login(self.employee)

        response = self.client.get("/my-account/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Business Autopilot")
        self.assertEqual(
            [row.product_slug for row in response.context["subscriptions"]],
            ["business-autopilot-erp"],
        )
        self.assertFalse(response.context["show_billing_tab"])
        self.assertFalse(response.context["show_account_billing_sections"])
        self.assertNotContains(response, "Bank Transfer Pending")
        self.assertNotContains(response, 'href="/my-account/billing/"', html=False)

    def test_product_user_cannot_open_billing_page(self):
        self.client.force_login(self.employee)

        response = self.client.get("/my-account/billing/")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/my-account/")

    def test_business_autopilot_membership_backfills_access_without_showing_other_products(self):
        employee = User.objects.create_user(
            username="membership@workzilla.test",
            email="membership@workzilla.test",
            password="pw123456",
        )
        employee.email_verified = True
        employee.save(update_fields=["email_verified"])
        UserProfile.objects.create(user=employee, organization=self.org, role="org_user")
        OrganizationUser.objects.create(
            organization=self.org,
            user=employee,
            role="org_user",
            is_active=True,
        )

        self.client.force_login(employee)
        response = self.client.get("/my-account/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row.product_slug for row in response.context["subscriptions"]],
            ["business-autopilot-erp"],
        )
        self.assertFalse(
            UserProductAccess.objects.filter(user=employee, product=self.wa_product).exists()
        )
        self.assertTrue(
            UserProductAccess.objects.filter(user=employee, product=self.ba_product).exists()
        )

    def test_unverified_user_sees_email_verification_gate_on_my_account(self):
        unverified = User.objects.create_user(
            username="unverified@workzilla.test",
            email="unverified@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(user=unverified, organization=self.org, role="org_user")
        UserProductAccess.objects.create(
            user=unverified,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=self.owner,
        )
        self.client.force_login(unverified)

        response = self.client.get("/my-account/")

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "public/account_verification_required.html")
        self.assertContains(response, "Email Verification Required")
