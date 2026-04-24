from django.contrib.auth import get_user_model
from django.test import TestCase
import json

from apps.backend.business_autopilot.models import AccountsWorkspace, CrmDeal, CrmLead, OrganizationDepartment, OrganizationUser
from apps.backend.products.models import Product
from core.models import Organization, OrganizationProduct, OrganizationSettings, Plan, Subscription, UserProductAccess, UserProfile


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

    def test_user_email_check_returns_existing_product_context(self):
        existing_user = User.objects.create_user(
            username="context@gmail.com",
            email="context@gmail.com",
            password="samepass123",
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
        response = self.client.get("/api/business-autopilot/users/check-email?email=context@gmail.com")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["available"])
        self.assertTrue(payload["existing_user"])
        self.assertTrue(payload["same_password_allowed"])
        self.assertFalse(payload["password_required"])
        self.assertEqual(payload["existing_products"][0]["slug"], "whatsapp-automation")

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
        membership.refresh_from_db()
        self.assertTrue(membership.is_deleted)
        self.assertFalse(membership.is_active)

    def test_org_admin_account_cannot_be_deleted_from_users(self):
        OrganizationUser.objects.create(
            organization=self.org,
            user=self.admin,
            role="company_admin",
            is_active=True,
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/business-autopilot/users")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        admin_row = next(
            (row for row in payload.get("users", []) if str(row.get("email", "")).lower() == self.admin.email.lower()),
            None,
        )
        self.assertIsNotNone(admin_row)
        self.assertTrue(admin_row.get("is_org_admin_account"))
        self.assertFalse(admin_row.get("can_delete"))

        delete_response = self.client.delete(f"/api/business-autopilot/users/{admin_row['membership_id']}")
        self.assertEqual(delete_response.status_code, 403)
        self.assertEqual(delete_response.json().get("detail"), "org_admin_delete_forbidden")
        self.assertTrue(
            OrganizationUser.objects.filter(
                organization=self.org,
                user=self.admin,
                is_deleted=False,
            ).exists()
        )

    def test_org_admin_account_cannot_be_deactivated_from_users(self):
        membership = OrganizationUser.objects.create(
            organization=self.org,
            user=self.admin,
            role="company_admin",
            is_active=True,
        )

        self.client.force_login(self.admin)
        response = self.client.post(
            f"/api/business-autopilot/users/{membership.id}/toggle-status",
            data={"enabled": False},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json().get("detail"), "org_admin_deactivate_forbidden")
        membership.refresh_from_db()
        self.assertTrue(membership.is_active)

    def test_crm_deal_patch_allows_company_admin_role_alias(self):
        self.admin.userprofile.role = "Company Admin"
        self.admin.userprofile.save(update_fields=["role"])
        sales_rep = User.objects.create_user(
            username="sales.rep@workzilla.test",
            email="sales.rep@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=sales_rep,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=sales_rep,
            role="org_user",
            is_active=True,
        )
        deal = CrmDeal.objects.create(
            organization=self.org,
            deal_name="New Deal",
            company="Acme",
            phone="9999999999",
            deal_value="5000",
            stage="Qualified",
            status="Open",
            created_by=sales_rep,
            updated_by=sales_rep,
        )

        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/business-autopilot/deals/{deal.id}",
            data=json.dumps({"deal_value": "7500", "status": "Won", "stage": "Won"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["deal"]["deal_value"], 7500.0)
        deal.refresh_from_db()
        self.assertEqual(float(deal.deal_value), 7500.0)

    def test_crm_lead_get_detail_allows_company_admin_role_alias(self):
        self.admin.userprofile.role = "Company Admin"
        self.admin.userprofile.save(update_fields=["role"])
        sales_rep = User.objects.create_user(
            username="sales.rep.detail@workzilla.test",
            email="sales.rep.detail@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=sales_rep,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=sales_rep,
            role="org_user",
            is_active=True,
        )
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Detail Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=sales_rep,
            assigned_user_ids=[sales_rep.id],
            stage="New",
            status="Open",
            created_by=sales_rep,
            updated_by=sales_rep,
        )

        self.client.force_login(self.admin)
        response = self.client.get(f"/api/business-autopilot/leads/{lead.id}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["id"], lead.id)
        self.assertEqual(payload["lead"]["lead_name"], "Detail Lead")

    def test_crm_lead_detail_includes_priority(self):
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Priority Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            priority="High",
            stage="New",
            status="Open",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.get(f"/api/business-autopilot/leads/{lead.id}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["priority"], "High")

    def test_crm_deal_get_detail_allows_business_autopilot_product_edit_permission(self):
        crm_user = User.objects.create_user(
            username="product-edit-detail@workzilla.test",
            email="product-edit-detail@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            is_active=True,
        )
        UserProductAccess.objects.create(
            user=crm_user,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_EDIT,
            granted_by=self.admin,
        )
        deal_owner = User.objects.create_user(
            username="deal-owner-detail@workzilla.test",
            email="deal-owner-detail@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=deal_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=deal_owner,
            role="org_user",
            is_active=True,
        )
        deal = CrmDeal.objects.create(
            organization=self.org,
            deal_name="Detail Deal",
            company="Acme",
            phone="9999999999",
            deal_value="5000",
            stage="Qualified",
            status="Open",
            created_by=deal_owner,
            updated_by=deal_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.get(f"/api/business-autopilot/deals/{deal.id}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["deal"]["id"], deal.id)
        self.assertEqual(payload["deal"]["deal_name"], "Detail Deal")

    def test_crm_lead_patch_allows_role_access_map_full_access(self):
        crm_user = User.objects.create_user(
            username="crm-user@workzilla.test",
            email="crm-user@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            employee_role="Sales Manager",
            is_active=True,
        )
        OrganizationSettings.objects.create(
            organization=self.org,
            business_autopilot_role_access_map={
                "employee_role:Sales Manager": {
                    "sections": {"crm": "Full Access"},
                    "user_sub_sections": {},
                    "can_export": False,
                    "can_delete": False,
                    "attendance_self_service": False,
                    "remarks": "",
                }
            },
        )
        lead_owner = User.objects.create_user(
            username="lead-owner@workzilla.test",
            email="lead-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=lead_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=lead_owner,
            role="org_user",
            is_active=True,
        )
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Live Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=lead_owner,
            assigned_user_ids=[lead_owner.id],
            stage="New",
            status="Open",
            created_by=lead_owner,
            updated_by=lead_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps({"lead_amount": "7500", "status": "Closed", "stage": "Qualified"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["lead_amount"], 7500.0)
        lead.refresh_from_db()
        self.assertEqual(float(lead.lead_amount), 7500.0)

    def test_crm_deal_patch_allows_role_access_map_full_access(self):
        crm_user = User.objects.create_user(
            username="crm-user2@workzilla.test",
            email="crm-user2@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            employee_role="Sales Manager",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Manager": {
                "sections": {"crm": "Full Access"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])
        deal_owner = User.objects.create_user(
            username="deal-owner@workzilla.test",
            email="deal-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=deal_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=deal_owner,
            role="org_user",
            is_active=True,
        )
        deal = CrmDeal.objects.create(
            organization=self.org,
            deal_name="Live Deal",
            company="Acme",
            phone="9999999999",
            deal_value="5000",
            stage="Qualified",
            status="Open",
            created_by=deal_owner,
            updated_by=deal_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/deals/{deal.id}",
            data=json.dumps({"deal_value": "7500", "status": "Won", "stage": "Won"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["deal"]["deal_value"], 7500.0)
        deal.refresh_from_db()
        self.assertEqual(float(deal.deal_value), 7500.0)

    def test_crm_lead_patch_allows_business_autopilot_product_edit_permission(self):
        crm_user = User.objects.create_user(
            username="product-edit@workzilla.test",
            email="product-edit@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            is_active=True,
        )
        UserProductAccess.objects.create(
            user=crm_user,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_EDIT,
            granted_by=self.admin,
        )
        lead_owner = User.objects.create_user(
            username="lead-owner-product@workzilla.test",
            email="lead-owner-product@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=lead_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=lead_owner,
            role="org_user",
            is_active=True,
        )
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Product Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=lead_owner,
            assigned_user_ids=[lead_owner.id],
            stage="New",
            status="Open",
            created_by=lead_owner,
            updated_by=lead_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps({"lead_amount": "6500", "status": "Closed", "stage": "Qualified"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["lead_amount"], 6500.0)
        lead.refresh_from_db()
        self.assertEqual(float(lead.lead_amount), 6500.0)

    def test_crm_lead_patch_allows_business_autopilot_product_view_permission(self):
        crm_user = User.objects.create_user(
            username="product-view@workzilla.test",
            email="product-view@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            is_active=True,
        )
        UserProductAccess.objects.create(
            user=crm_user,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_VIEW,
            granted_by=self.admin,
        )
        lead_owner = User.objects.create_user(
            username="lead-owner-view@workzilla.test",
            email="lead-owner-view@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=lead_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=lead_owner,
            role="org_user",
            is_active=True,
        )
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="View Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=lead_owner,
            assigned_user_ids=[lead_owner.id],
            stage="New",
            status="Open",
            created_by=lead_owner,
            updated_by=lead_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps({"lead_amount": "6800", "status": "Closed", "stage": "Qualified"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["lead_amount"], 6800.0)
        lead.refresh_from_db()
        self.assertEqual(float(lead.lead_amount), 6800.0)

    def test_crm_deal_patch_allows_business_autopilot_product_edit_permission(self):
        crm_user = User.objects.create_user(
            username="product-edit-2@workzilla.test",
            email="product-edit-2@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=crm_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=crm_user,
            role="org_user",
            is_active=True,
        )
        UserProductAccess.objects.create(
            user=crm_user,
            product=self.ba_product,
            permission=UserProductAccess.PERMISSION_EDIT,
            granted_by=self.admin,
        )
        deal_owner = User.objects.create_user(
            username="deal-owner-product@workzilla.test",
            email="deal-owner-product@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=deal_owner,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=deal_owner,
            role="org_user",
            is_active=True,
        )
        deal = CrmDeal.objects.create(
            organization=self.org,
            deal_name="Product Deal",
            company="Acme",
            phone="9999999999",
            deal_value="5000",
            stage="Qualified",
            status="Open",
            created_by=deal_owner,
            updated_by=deal_owner,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/deals/{deal.id}",
            data=json.dumps({"deal_value": "6500", "status": "Won", "stage": "Won"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["deal"]["deal_value"], 6500.0)
        deal.refresh_from_db()
        self.assertEqual(float(deal.deal_value), 6500.0)

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

    def test_accounts_workspace_put_allows_common_admin_role_aliases(self):
        alias_admin = User.objects.create_user(
            username="alias-admin@workzilla.test",
            email="alias-admin@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=alias_admin,
            organization=self.org,
            role="Company Admin",
        )

        self.client.force_login(alias_admin)
        response = self.client.put(
            "/api/business-autopilot/accounts/workspace",
            data='{"data":{"invoices":[],"estimates":[],"gstTemplates":[],"billingTemplates":[],"items":[],"customers":[],"vendors":[]}}',
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["organization"]["id"], self.org.id)

    def test_accounts_workspace_get_repairs_legacy_india_gst_template(self):
        from core.models import BillingProfile

        BillingProfile.objects.create(
            organization=self.org,
            contact_name="GP Prakash",
            company_name="GP Prakash",
            email="gp.prakash@example.com",
            mobile_phone="+91 9999999999",
            phone="+91 8888888888",
            address_line1="Line 1",
            city="Chennai",
            state="Tamil Nadu",
            postal_code="600001",
            country="India",
        )
        AccountsWorkspace.objects.create(
            organization=self.org,
            data={
                "customers": [],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [
                    {
                        "id": "gst_legacy_india_001",
                        "name": "India GST",
                        "taxScope": "Intra State",
                        "cgst": "9",
                        "sgst": "9",
                        "igst": "18",
                        "cess": "0",
                        "status": "Active",
                        "notes": "",
                    }
                ],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [],
            },
        )

        self.client.force_login(self.admin)
        response = self.client.get("/api/business-autopilot/accounts/workspace")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        gst_templates = payload["data"]["gstTemplates"]
        self.assertEqual(len(gst_templates), 2)
        self.assertEqual(gst_templates[0]["id"], "gst_default_india_igst")
        self.assertEqual(gst_templates[1]["id"], "gst_default_india_cgst_sgst")

    def test_accounts_workspace_prefers_session_active_org_when_user_has_access(self):
        secondary_org = Organization.objects.create(
            name="Beta Corp",
            company_key="BETAKEY",
        )
        OrganizationUser.objects.create(
            organization=secondary_org,
            user=self.admin,
            role="company_admin",
            is_active=True,
            is_deleted=False,
        )
        AccountsWorkspace.objects.create(
            organization=self.org,
            data={
                "customers": [],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [{"id": "inv_acme_1", "docNo": "INV-ACME-001"}],
            },
        )
        AccountsWorkspace.objects.create(
            organization=secondary_org,
            data={
                "customers": [],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [{"id": "inv_beta_1", "docNo": "INV-BETA-001"}],
            },
        )

        self.client.force_login(self.admin)
        session = self.client.session
        session["active_org_id"] = secondary_org.id
        session.save()

        response = self.client.get("/api/business-autopilot/accounts/workspace")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["organization"]["id"], secondary_org.id)
        self.assertEqual(payload["data"]["invoices"][0]["docNo"], "INV-BETA-001")

    def test_accounts_workspace_ignores_session_active_org_without_access(self):
        inaccessible_org = Organization.objects.create(
            name="Gamma Corp",
            company_key="GAMMAKEY",
        )
        AccountsWorkspace.objects.create(
            organization=self.org,
            data={
                "customers": [],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [{"id": "inv_acme_2", "docNo": "INV-ACME-002"}],
            },
        )
        AccountsWorkspace.objects.create(
            organization=inaccessible_org,
            data={
                "customers": [],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [{"id": "inv_gamma_1", "docNo": "INV-GAMMA-001"}],
            },
        )

        self.client.force_login(self.admin)
        session = self.client.session
        session["active_org_id"] = inaccessible_org.id
        session.save()

        response = self.client.get("/api/business-autopilot/accounts/workspace")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["organization"]["id"], self.org.id)
        self.assertEqual(payload["data"]["invoices"][0]["docNo"], "INV-ACME-002")

    def test_user_update_supports_post_action_update(self):
        product_user = User.objects.create_user(
            username="user-update@gmail.com",
            email="user-update@gmail.com",
            password="pw123456",
            first_name="Old",
            last_name="Name",
        )
        UserProfile.objects.create(
            user=product_user,
            organization=self.org,
            role="org_user",
            phone_number="+919900000001",
        )
        membership = OrganizationUser.objects.create(
            organization=self.org,
            user=product_user,
            role="org_user",
            is_active=True,
            department="Sales",
            employee_role="Executive",
        )

        self.client.force_login(self.admin)
        response = self.client.post(
            f"/api/business-autopilot/users/{membership.id}",
            data={
                "action": "update",
                "first_name": "New",
                "last_name": "Name",
                "email": "user-updated@gmail.com",
                "password": "",
                "phone_number": "+919900000009",
                "role": "org_user",
                "department": "Marketing",
                "employee_role": "Lead",
                "is_active": True,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        product_user.refresh_from_db()
        membership.refresh_from_db()
        profile = UserProfile.objects.get(user=product_user)
        self.assertEqual(product_user.email, "user-updated@gmail.com")
        self.assertEqual(product_user.username, "user-updated@gmail.com")
        self.assertEqual(product_user.first_name, "New")
        self.assertEqual(product_user.last_name, "Name")
        self.assertEqual(profile.phone_number, "+919900000009")
        self.assertEqual(membership.department, "Marketing")
        self.assertEqual(membership.employee_role, "Lead")

    def test_department_update_updates_assigned_users_department_text(self):
        department = OrganizationDepartment.objects.create(
            organization=self.org,
            name="Design Team",
            is_active=True,
        )
        assigned_user = User.objects.create_user(
            username="assigned@gmail.com",
            email="assigned@gmail.com",
            password="pw123456",
            first_name="Assigned",
            last_name="User",
        )
        UserProfile.objects.create(
            user=assigned_user,
            organization=self.org,
            role="org_user",
        )
        membership = OrganizationUser.objects.create(
            organization=self.org,
            user=assigned_user,
            role="org_user",
            is_active=True,
            department="Design Team",
            employee_role="Graphic Designer",
        )

        self.client.force_login(self.admin)
        response = self.client.post(
            f"/api/business-autopilot/departments/{department.id}",
            data={"action": "update", "name": "Creative Team"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        department.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(department.name, "Creative Team")
        self.assertEqual(membership.department, "Creative Team")
