import json
from django.contrib.auth import get_user_model
from django.test import TestCase
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.backend.business_autopilot.models import OrganizationUser
from apps.backend.products.models import Product
from core.models import BillingProfile, Organization, OrganizationProduct, PendingTransfer, Plan, Subscription, UserProductAccess, UserProfile


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


class CheckoutRenewalSeatGuardTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="billing@workzilla.test",
            email="billing@workzilla.test",
            password="pw123456",
        )
        self.owner.email_verified = True
        self.owner.save(update_fields=["email_verified"])
        self.org = Organization.objects.create(
            name="Acme Corp",
            company_key="ACMEKEY2",
            owner=self.owner,
        )
        self.product, _ = Product.objects.get_or_create(
            slug="business-autopilot-erp",
            defaults={"name": "Business Autopilot"},
        )
        self.plan = Plan.objects.create(
            name="Pro ERP",
            product=self.product,
            monthly_price=1000,
            yearly_price=12000,
            addon_monthly_price=200,
            addon_yearly_price=2400,
            employee_limit=5,
            allow_addons=True,
        )
        Subscription.objects.create(
            user=self.owner,
            organization=self.org,
            plan=self.plan,
            status="active",
            billing_cycle="yearly",
            addon_count=7,
            addon_next_cycle_count=7,
        )
        BillingProfile.objects.create(
            organization=self.org,
            contact_name="Owner",
            company_name="Acme Corp",
            email="billing@workzilla.test",
            phone="+91 9000000000",
            address_line1="Street 1",
            city="Chennai",
            country="India",
            state="Tamil Nadu",
            postal_code="600001",
        )

    def test_checkout_view_enforces_min_addons_from_existing_subscription(self):
        self.client.force_login(self.owner)
        session = self.client.session
        session["selected_product_slug"] = "business-autopilot-erp"
        session["selected_plan_id"] = self.plan.id
        session["selected_currency"] = "inr"
        session["selected_billing"] = "yearly"
        session["selected_addon_count"] = 0
        session.save()

        response = self.client.get("/checkout/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["existing_total_users"], 12)
        self.assertEqual(response.context["min_addon_count"], 7)
        self.assertEqual(response.context["selected_addon_count"], 7)

    def test_checkout_confirm_clamps_addons_to_minimum(self):
        self.client.force_login(self.owner)
        session = self.client.session
        session["selected_product_slug"] = "business-autopilot-erp"
        session["selected_plan_id"] = self.plan.id
        session["selected_currency"] = "inr"
        session["selected_billing"] = "yearly"
        session["selected_addon_count"] = 0
        session.save()

        receipt = SimpleUploadedFile("receipt.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", content_type="image/png")
        response = self.client.post(
            "/checkout/confirm/",
            data={
                "billing": "yearly",
                "addon_count": 0,
                "utr_number": "UTR123",
                "paid_on": "02-05-2026",
                "notes": "",
                "receipt": receipt,
            },
        )
        self.assertEqual(response.status_code, 302)
        pending = PendingTransfer.objects.filter(organization=self.org, request_type="new").order_by("-id").first()
        self.assertIsNotNone(pending)
        self.assertEqual(pending.addon_count, 7)

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

    @patch("apps.backend.website.views.send_email_verification")
    def test_unverified_user_can_update_email_and_reverify(self, mock_send_email_verification):
        mock_send_email_verification.return_value = True
        unverified = User.objects.create_user(
            username="change-email@workzilla.test",
            email="wrong@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(user=unverified, organization=self.org, role="org_user")
        self.client.force_login(unverified)

        response = self.client.post(
            "/my-account/verification/update-email/",
            {"verification_email": "correct@workzilla.test"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/my-account/")
        unverified.refresh_from_db()
        self.assertEqual(unverified.email, "correct@workzilla.test")
        self.assertFalse(unverified.email_verified)
        self.assertIsNone(unverified.email_verified_at)
        self.assertEqual(mock_send_email_verification.call_count, 1)
        _, call_kwargs = mock_send_email_verification.call_args
        self.assertEqual(call_kwargs.get("force"), True)


class SubscriptionStartAliasTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="trial-alias@workzilla.test",
            email="trial-alias@workzilla.test",
            password="pw123456",
        )
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        self.org = Organization.objects.create(
            name="Trial Alias Org",
            company_key="TRIALALIAS",
            owner=self.user,
        )
        UserProfile.objects.create(user=self.user, organization=self.org, role="org_admin")
        self.product = Product.objects.create(
            slug="business-autopilot-erp",
            name="Business Autopilot",
        )
        self.plan = Plan.objects.create(
            name="Starter ERP",
            product=self.product,
            monthly_price=0,
            yearly_price=0,
        )

    def test_business_autopilot_public_slug_accepts_erp_plan(self):
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/subscription/start",
            data=json.dumps(
                {
                    "product": "business-autopilot",
                    "plan_id": self.plan.id,
                    "interval": "monthly",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload.get("status"), "trialing")
        self.assertIn("/app/business-autopilot/", payload.get("redirect", ""))
