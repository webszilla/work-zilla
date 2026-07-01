import base64
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
import json

from apps.backend.business_autopilot.models import (
    AccountsWorkspace,
    CrmContact,
    CrmDeal,
    CrmLead,
    OrganizationEmployeeRole,
    PayrollEntry,
    Payslip,
    QuickEstimate,
    QuickEstimateHistory,
    CrmSalesOrder,
    OrganizationDepartment,
    OrganizationUser,
    SiteAdminChatState,
)
from apps.backend.business_autopilot.site_admin_ai import build_site_admin_instruction_context, get_site_admin_module
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
        self.department = OrganizationDepartment.objects.create(
            organization=self.org,
            name="Sales",
            is_active=True,
        )
        self.employee_role = OrganizationEmployeeRole.objects.create(
            organization=self.org,
            name="Executive",
            is_active=True,
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
                "phone_number": "+91 9999999999",
                "department": self.department.name,
                "employee_role": self.employee_role.name,
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
                "phone_number": "+91 9999999999",
                "department": self.department.name,
                "employee_role": self.employee_role.name,
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

    def test_bulk_user_import_accepts_excel_password_column_payload(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/business-autopilot/users",
            data={
                "bulk_import": True,
                "rows": [
                    {
                        "first_name": "Asha",
                        "last_name": "Devi",
                        "email": "asha@example.com",
                        "phone_number": "+91 9876543210",
                        "password": "excelpass123",
                        "department": "Operations",
                        "employee_role": "Manager",
                        "role": "org_user",
                    }
                ],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["import_summary"]["imported_count"], 1)
        imported_user = User.objects.get(email="asha@example.com")
        self.assertTrue(imported_user.check_password("excelpass123"))
        membership = OrganizationUser.objects.get(organization=self.org, user=imported_user)
        self.assertEqual(membership.department, "Operations")
        self.assertEqual(membership.employee_role, "Manager")
        self.assertTrue(
            OrganizationDepartment.objects.filter(organization=self.org, name="Operations", is_active=True).exists()
        )
        self.assertTrue(
            OrganizationEmployeeRole.objects.filter(organization=self.org, name="Manager", is_active=True).exists()
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
        membership.refresh_from_db()
        self.assertTrue(membership.is_deleted)
        self.assertFalse(membership.is_active)

    def test_delete_user_with_reassign_handles_multi_user_leads_without_primary_fk(self):
        source_user = User.objects.create_user(
            username="source@workzilla.test",
            email="source@workzilla.test",
            password="pw123456",
            first_name="Source",
            last_name="User",
        )
        UserProfile.objects.create(
            user=source_user,
            organization=self.org,
            role="org_user",
        )
        source_membership = OrganizationUser.objects.create(
            organization=self.org,
            user=source_user,
            role="org_user",
            is_active=True,
        )

        target_user = User.objects.create_user(
            username="target@workzilla.test",
            email="target@workzilla.test",
            password="pw123456",
            first_name="Target",
            last_name="User",
        )
        UserProfile.objects.create(
            user=target_user,
            organization=self.org,
            role="org_user",
        )
        target_membership = OrganizationUser.objects.create(
            organization=self.org,
            user=target_user,
            role="org_user",
            is_active=True,
        )

        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Multi user lead",
            company="Acme",
            assign_type="Users",
            assigned_user=None,
            assigned_user_ids=[source_user.id],
            created_by=self.admin,
            updated_by=self.admin,
        )
        self.assertIsNone(lead.assigned_user_id)
        self.assertEqual(lead.assigned_user_ids, [source_user.id])

        self.client.force_login(self.admin)
        response = self.client.post(
            f"/api/business-autopilot/users/{source_membership.id}",
            data={
                "action": "delete",
                "reassign_to_membership_ids": [target_membership.id],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.assigned_user_id, target_user.id)
        self.assertEqual(lead.assigned_user_ids, [target_user.id])

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

    def test_users_list_auto_includes_owner_admin_without_membership(self):
        self.assertFalse(
            OrganizationUser.objects.filter(
                organization=self.org,
                user=self.admin,
            ).exists()
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
        self.assertEqual(admin_row.get("role"), "company_admin")
        self.assertTrue(admin_row.get("is_org_admin_account"))
        self.assertFalse(admin_row.get("can_delete"))
        self.assertFalse(admin_row.get("can_toggle_status"))
        self.assertTrue(
            OrganizationUser.objects.filter(
                organization=self.org,
                user=self.admin,
                role="company_admin",
                is_active=True,
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

    def test_hr_full_access_role_can_manage_payroll_workspace(self):
        hr_user = User.objects.create_user(
            username="hr.full@workzilla.test",
            email="hr.full@workzilla.test",
            password="pw123456",
            first_name="HR",
            last_name="Full",
        )
        UserProfile.objects.create(
            user=hr_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=hr_user,
            role="org_user",
            employee_role="Sales",
            is_active=True,
        )
        payroll_entry = PayrollEntry.objects.create(
            organization=self.org,
            employee_name="HR Full",
            source_user_id=hr_user.id,
            payroll_month="2026-05",
            currency="INR",
            gross_salary="50000",
            total_deductions="0",
            net_salary="50000",
            status="processed",
        )
        Payslip.objects.create(
            organization=self.org,
            payroll_entry=payroll_entry,
            slip_number="SLIP-HR-FULL",
            generated_for_month="2026-05",
            employee_name="HR Full",
            source_user_id=hr_user.id,
            currency="INR",
        )

        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "system:org_user": {
                "sections": {"hr": "Full Access"},
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        self.client.force_login(hr_user)
        response = self.client.get("/api/business-autopilot/payroll/workspace")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["permissions"]["can_manage_payroll"])
        self.assertTrue(payload["permissions"]["can_view_salary_history"])
        self.assertEqual(len(payload["payroll_entries"]), 1)
        self.assertEqual(len(payload["payslips"]), 1)
        self.assertEqual(payload["payslips"][0]["source_user_id"], hr_user.id)

    def test_hr_view_role_only_sees_own_payslips(self):
        viewer = User.objects.create_user(
            username="hr.viewer@workzilla.test",
            email="hr.viewer@workzilla.test",
            password="pw123456",
            first_name="HR",
            last_name="Viewer",
        )
        peer = User.objects.create_user(
            username="hr.peer@workzilla.test",
            email="hr.peer@workzilla.test",
            password="pw123456",
            first_name="HR",
            last_name="Peer",
        )
        UserProfile.objects.create(
            user=viewer,
            organization=self.org,
            role="org_user",
        )
        UserProfile.objects.create(
            user=peer,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=viewer,
            role="org_user",
            employee_role="Sales",
            is_active=True,
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=peer,
            role="org_user",
            employee_role="Sales",
            is_active=True,
        )
        viewer_entry = PayrollEntry.objects.create(
            organization=self.org,
            employee_name="HR Viewer",
            source_user_id=viewer.id,
            payroll_month="2026-05",
            currency="INR",
            gross_salary="50000",
            total_deductions="0",
            net_salary="50000",
            status="processed",
        )
        peer_entry = PayrollEntry.objects.create(
            organization=self.org,
            employee_name="HR Peer",
            source_user_id=peer.id,
            payroll_month="2026-05",
            currency="INR",
            gross_salary="62000",
            total_deductions="0",
            net_salary="62000",
            status="processed",
        )
        Payslip.objects.create(
            organization=self.org,
            payroll_entry=viewer_entry,
            slip_number="SLIP-HR-VIEWER",
            generated_for_month="2026-05",
            employee_name="HR Viewer",
            source_user_id=viewer.id,
            currency="INR",
        )
        Payslip.objects.create(
            organization=self.org,
            payroll_entry=peer_entry,
            slip_number="SLIP-HR-PEER",
            generated_for_month="2026-05",
            employee_name="HR Peer",
            source_user_id=peer.id,
            currency="INR",
        )

        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "system:org_user": {
                "sections": {"hr": "View"},
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        self.client.force_login(viewer)
        response = self.client.get("/api/business-autopilot/payroll/workspace")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["permissions"]["can_manage_payroll"])
        self.assertEqual(len(payload["payroll_entries"]), 1)
        self.assertEqual(len(payload["payslips"]), 1)
        self.assertEqual(payload["payslips"][0]["source_user_id"], viewer.id)

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

    def test_crm_deal_delete_restore_and_permanent_delete_persist(self):
        sales_rep = User.objects.create_user(
            username="sales.rep.delete@workzilla.test",
            email="sales.rep.delete@workzilla.test",
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
            deal_name="Delete Deal",
            company="Acme",
            phone="9999999999",
            deal_value="5000",
            stage="Qualified",
            status="Open",
            created_by=sales_rep,
            updated_by=sales_rep,
        )

        self.client.force_login(self.admin)
        delete_response = self.client.post(
            "/api/business-autopilot/deals",
            data=json.dumps({"__crm_action": "delete", "deal_id": deal.id}),
            content_type="application/json",
        )
        self.assertEqual(delete_response.status_code, 200)
        deal.refresh_from_db()
        self.assertTrue(deal.is_deleted)

        list_response = self.client.get("/api/business-autopilot/deals")
        self.assertEqual(list_response.status_code, 200)
        rows = list_response.json().get("deals") or []
        self.assertTrue(any(int(row.get("id")) == deal.id and bool(row.get("is_deleted")) for row in rows))

        restore_response = self.client.post(
            "/api/business-autopilot/deals",
            data=json.dumps({"__crm_action": "patch", "deal_id": deal.id, "is_deleted": False}),
            content_type="application/json",
        )
        self.assertEqual(restore_response.status_code, 200)
        deal.refresh_from_db()
        self.assertFalse(deal.is_deleted)

        permanent_response = self.client.post(
            "/api/business-autopilot/deals?permanent=1",
            data=json.dumps({"__crm_action": "delete", "deal_id": deal.id, "__crm_permanent": True}),
            content_type="application/json",
        )
        self.assertEqual(permanent_response.status_code, 200)
        self.assertFalse(CrmDeal.objects.filter(id=deal.id).exists())

    def test_crm_sales_order_delete_restore_and_permanent_delete_persist(self):
        order = CrmSalesOrder.objects.create(
            organization=self.org,
            order_id="SO-001",
            customer_name="Customer",
            company="Acme",
            phone="9999999999",
            amount="1000",
            total_amount="1180",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        delete_response = self.client.post(
            "/api/business-autopilot/sales-orders",
            data=json.dumps({"__crm_action": "delete", "sales_order_id": order.id}),
            content_type="application/json",
        )
        self.assertEqual(delete_response.status_code, 200)
        order.refresh_from_db()
        self.assertTrue(order.is_deleted)

        list_response = self.client.get("/api/business-autopilot/sales-orders")
        self.assertEqual(list_response.status_code, 200)
        rows = list_response.json().get("sales_orders") or []
        self.assertTrue(any(int(row.get("id")) == order.id and bool(row.get("is_deleted")) for row in rows))

        restore_response = self.client.post(
            "/api/business-autopilot/sales-orders",
            data=json.dumps({"__crm_action": "patch", "sales_order_id": order.id, "is_deleted": False}),
            content_type="application/json",
        )
        self.assertEqual(restore_response.status_code, 200)
        order.refresh_from_db()
        self.assertFalse(order.is_deleted)

        permanent_response = self.client.post(
            "/api/business-autopilot/sales-orders?permanent=1",
            data=json.dumps({"__crm_action": "delete", "sales_order_id": order.id, "__crm_permanent": True}),
            content_type="application/json",
        )
        self.assertEqual(permanent_response.status_code, 200)
        self.assertFalse(CrmSalesOrder.objects.filter(id=order.id).exists())

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

    def test_crm_lead_detail_includes_all_assigned_user_names(self):
        first_assignee = User.objects.create_user(
            username="lead.multi.one@workzilla.test",
            email="lead.multi.one@workzilla.test",
            password="pw123456",
            first_name="Lead",
            last_name="One",
        )
        second_assignee = User.objects.create_user(
            username="lead.multi.two@workzilla.test",
            email="lead.multi.two@workzilla.test",
            password="pw123456",
            first_name="Lead",
            last_name="Two",
        )
        UserProfile.objects.create(
            user=first_assignee,
            organization=self.org,
            role="org_user",
        )
        UserProfile.objects.create(
            user=second_assignee,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=first_assignee,
            role="org_user",
            is_active=True,
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=second_assignee,
            role="org_user",
            is_active=True,
        )
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Multi Assigned Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=first_assignee,
            assigned_user_ids=[first_assignee.id, second_assignee.id],
            stage="New",
            status="Open",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.get(f"/api/business-autopilot/leads/{lead.id}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["assigned_user_ids"], [first_assignee.id, second_assignee.id])
        self.assertEqual(payload["lead"]["assigned_user_names"], ["Lead One", "Lead Two"])

    def test_crm_lead_patch_merges_assigned_user_ids_from_names(self):
        first_assignee = User.objects.create_user(
            username="lead.patch.one@workzilla.test",
            email="lead.patch.one@workzilla.test",
            password="pw123456",
            first_name="Patch",
            last_name="One",
        )
        second_assignee = User.objects.create_user(
            username="lead.patch.two@workzilla.test",
            email="lead.patch.two@workzilla.test",
            password="pw123456",
            first_name="Patch",
            last_name="Two",
        )
        UserProfile.objects.create(user=first_assignee, organization=self.org, role="org_user")
        UserProfile.objects.create(user=second_assignee, organization=self.org, role="org_user")
        OrganizationUser.objects.create(organization=self.org, user=first_assignee, role="org_user", is_active=True)
        OrganizationUser.objects.create(organization=self.org, user=second_assignee, role="org_user", is_active=True)
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Patch Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=first_assignee,
            assigned_user_ids=[first_assignee.id],
            stage="New",
            status="Open",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps(
                {
                    "assigned_user_id": first_assignee.id,
                    "assigned_user_ids": [first_assignee.id],
                    "assigned_user_names": ["Patch One", "Patch Two"],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.assigned_user_ids, [first_assignee.id, second_assignee.id])

    def test_crm_lead_patch_updates_assigned_user_ids_from_names_without_ids_field(self):
        first_assignee = User.objects.create_user(
            username="lead.patch.noids.one@workzilla.test",
            email="lead.patch.noids.one@workzilla.test",
            password="pw123456",
            first_name="NoIds",
            last_name="One",
        )
        second_assignee = User.objects.create_user(
            username="lead.patch.noids.two@workzilla.test",
            email="lead.patch.noids.two@workzilla.test",
            password="pw123456",
            first_name="NoIds",
            last_name="Two",
        )
        UserProfile.objects.create(user=first_assignee, organization=self.org, role="org_user")
        UserProfile.objects.create(user=second_assignee, organization=self.org, role="org_user")
        OrganizationUser.objects.create(organization=self.org, user=first_assignee, role="org_user", is_active=True)
        OrganizationUser.objects.create(organization=self.org, user=second_assignee, role="org_user", is_active=True)
        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Patch Lead No Ids Field",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=first_assignee,
            assigned_user_ids=[first_assignee.id],
            stage="New",
            status="Open",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps(
                {
                    "assigned_user_id": first_assignee.id,
                    "assigned_user_names": ["NoIds One", "NoIds Two"],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.assigned_user_ids, [first_assignee.id, second_assignee.id])

    def test_crm_contacts_post_blocks_duplicate_company_email_and_phone(self):
        existing_contact = CrmContact.objects.create(
            organization=self.org,
            name="Krishnan",
            company="Krish Infotech",
            email="krish@gmail.com",
            phone_country_code="+91",
            phone="9092833701",
            tag="Client",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/business-autopilot/contacts",
            data=json.dumps(
                {
                    "name": "Krishnan New",
                    "company": "Krish Infotech",
                    "email": "krish@gmail.com",
                    "phone_country_code": "+91",
                    "phone": "9092833701",
                    "tag": "Client",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["detail"], "duplicate_contact")
        self.assertEqual(payload["existing_contact"]["id"], existing_contact.id)
        duplicate_fields = set(payload.get("duplicate_fields") or [])
        self.assertTrue({"company", "email", "phone"}.issubset(duplicate_fields))

    def test_crm_contacts_patch_blocks_duplicate_company_email_and_phone(self):
        first_contact = CrmContact.objects.create(
            organization=self.org,
            name="First Contact",
            company="Com Com",
            email="vishwa@gmail.com",
            phone_country_code="+91",
            phone="9092833701",
            tag="Client",
            created_by=self.admin,
            updated_by=self.admin,
        )
        second_contact = CrmContact.objects.create(
            organization=self.org,
            name="Second Contact",
            company="Apple Inc",
            email="apple@gmail.com",
            phone_country_code="+91",
            phone="1234567891",
            tag="Client",
            created_by=self.admin,
            updated_by=self.admin,
        )

        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/business-autopilot/contacts/{second_contact.id}",
            data=json.dumps(
                {
                    "name": "Second Contact Updated",
                    "company": "Com Com",
                    "email": "vishwa@gmail.com",
                    "phone_country_code": "+91",
                    "phone": "9092833701",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["detail"], "duplicate_contact")
        self.assertEqual(payload["existing_contact"]["id"], first_contact.id)
        duplicate_fields = set(payload.get("duplicate_fields") or [])
        self.assertTrue({"company", "email", "phone"}.issubset(duplicate_fields))

    def test_crm_contacts_patch_with_role_access_map_create_view_edit_own_blocks_other_member_contact(self):
        crm_user = User.objects.create_user(
            username="crm-own-contact-edit@workzilla.test",
            email="crm-own-contact-edit@workzilla.test",
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
            employee_role="Sales Executive",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Executive": {
                "sections": {"crm": "Create, View and Edit Own"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        other_user = User.objects.create_user(
            username="crm-own-contact-owner@workzilla.test",
            email="crm-own-contact-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=other_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=other_user,
            role="org_user",
            is_active=True,
        )
        other_member_contact = CrmContact.objects.create(
            organization=self.org,
            name="Other Member Contact",
            company="Other Member Corp",
            email="other.member@workzilla.test",
            phone_country_code="+91",
            phone="9191919191",
            tag="Client",
            created_by=other_user,
            updated_by=other_user,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/contacts/{other_member_contact.id}",
            data=json.dumps(
                {
                    "name": "Other Member Contact Updated",
                    "company": "Other Member Corp Updated",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json().get("detail"), "forbidden")

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
        self.assertEqual(payload["deal"]["created_by_name"], deal_owner.username)
        self.assertEqual(payload["deal"]["updated_by_name"], deal_owner.username)

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

    def test_crm_lead_reopen_requires_full_access(self):
        crm_user = User.objects.create_user(
            username="crm-reopen-forbidden@workzilla.test",
            email="crm-reopen-forbidden@workzilla.test",
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
            employee_role="Sales Executive",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Executive": {
                "sections": {"crm": "Create, View and Edit Own"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Reopen Lead",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=crm_user,
            assigned_user_ids=[crm_user.id],
            stage="New",
            status="Converted",
            final_proposal_amount="2500",
            proposal_finalized_at=timezone.now(),
            proposal_finalized_by=crm_user,
            created_by=crm_user,
            updated_by=crm_user,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps({"status": "Open", "final_proposal_amount": "2500", "proposal_finalized": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        lead.refresh_from_db()
        self.assertIsNotNone(lead.proposal_finalized_at)

    def test_crm_lead_reopen_allows_full_access(self):
        crm_user = User.objects.create_user(
            username="crm-reopen-allowed@workzilla.test",
            email="crm-reopen-allowed@workzilla.test",
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

        lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Reopen Lead 2",
            company="Acme",
            phone="9999999999",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=crm_user,
            assigned_user_ids=[crm_user.id],
            stage="New",
            status="Converted",
            final_proposal_amount="2500",
            proposal_finalized_at=timezone.now(),
            proposal_finalized_by=crm_user,
            created_by=crm_user,
            updated_by=crm_user,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{lead.id}",
            data=json.dumps({"status": "Open", "final_proposal_amount": "2500", "proposal_finalized": False}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        lead.refresh_from_db()
        self.assertIsNone(lead.proposal_finalized_at)

    def test_crm_lead_list_with_role_access_map_create_view_edit_own_is_row_scoped(self):
        crm_user = User.objects.create_user(
            username="crm-own-list@workzilla.test",
            email="crm-own-list@workzilla.test",
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
            employee_role="Sales Executive",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Executive": {
                "sections": {"crm": "Create, View and Edit Own"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        other_user = User.objects.create_user(
            username="crm-own-list-owner@workzilla.test",
            email="crm-own-list-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=other_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=other_user,
            role="org_user",
            is_active=True,
        )
        own_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Own Lead",
            company="Own Corp",
            phone="9000000001",
            lead_amount="1000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=crm_user,
            assigned_user_ids=[crm_user.id],
            stage="New",
            status="Open",
            created_by=crm_user,
            updated_by=crm_user,
        )
        assigned_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Assigned Lead",
            company="Assigned Corp",
            phone="9000000002",
            lead_amount="2000",
            lead_source="Referral",
            assign_type="Users",
            assigned_user=crm_user,
            assigned_user_ids=[crm_user.id],
            stage="New",
            status="Open",
            created_by=other_user,
            updated_by=other_user,
        )
        restricted_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Restricted Lead",
            company="Other Corp",
            phone="9000000003",
            lead_amount="3000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=other_user,
            assigned_user_ids=[other_user.id],
            stage="New",
            status="Open",
            created_by=other_user,
            updated_by=other_user,
        )

        self.client.force_login(crm_user)
        response = self.client.get("/api/business-autopilot/leads")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        returned_ids = {row["id"] for row in payload.get("leads", [])}
        self.assertIn(own_lead.id, returned_ids)
        self.assertIn(assigned_lead.id, returned_ids)
        self.assertNotIn(restricted_lead.id, returned_ids)

    def test_crm_lead_patch_with_role_access_map_create_view_edit_own_blocks_unassigned_lead(self):
        crm_user = User.objects.create_user(
            username="crm-own-edit@workzilla.test",
            email="crm-own-edit@workzilla.test",
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
            employee_role="Sales Executive",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Executive": {
                "sections": {"crm": "Create, View and Edit Own"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        other_user = User.objects.create_user(
            username="crm-own-edit-owner@workzilla.test",
            email="crm-own-edit-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=other_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=other_user,
            role="org_user",
            is_active=True,
        )
        blocked_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Blocked Lead",
            company="Blocked Corp",
            phone="9111111111",
            lead_amount="4000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=other_user,
            assigned_user_ids=[other_user.id],
            stage="New",
            status="Open",
            created_by=other_user,
            updated_by=other_user,
        )
        allowed_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Allowed Lead",
            company="Allowed Corp",
            phone="9222222222",
            lead_amount="5000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=crm_user,
            assigned_user_ids=[crm_user.id],
            stage="New",
            status="Open",
            created_by=other_user,
            updated_by=other_user,
        )

        self.client.force_login(crm_user)
        blocked_response = self.client.patch(
            f"/api/business-autopilot/leads/{blocked_lead.id}",
            data=json.dumps({"lead_amount": "4500"}),
            content_type="application/json",
        )
        self.assertEqual(blocked_response.status_code, 403)
        self.assertEqual(blocked_response.json().get("detail"), "forbidden")

        allowed_response = self.client.patch(
            f"/api/business-autopilot/leads/{allowed_lead.id}",
            data=json.dumps({"lead_amount": "5500"}),
            content_type="application/json",
        )
        self.assertEqual(allowed_response.status_code, 200)
        allowed_lead.refresh_from_db()
        self.assertEqual(float(allowed_lead.lead_amount), 5500.0)

    def test_crm_lead_patch_with_role_access_map_create_view_edit_all_allows_other_member_lead(self):
        crm_user = User.objects.create_user(
            username="crm-all-edit@workzilla.test",
            email="crm-all-edit@workzilla.test",
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
            employee_role="Sales Head",
            is_active=True,
        )
        settings_obj, _ = OrganizationSettings.objects.get_or_create(organization=self.org)
        settings_obj.business_autopilot_role_access_map = {
            "employee_role:Sales Head": {
                "sections": {"crm": "Create, View and Edit All"},
                "user_sub_sections": {},
                "can_export": False,
                "can_delete": False,
                "attendance_self_service": False,
                "remarks": "",
            }
        }
        settings_obj.save(update_fields=["business_autopilot_role_access_map"])

        other_user = User.objects.create_user(
            username="crm-all-edit-owner@workzilla.test",
            email="crm-all-edit-owner@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=other_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=other_user,
            role="org_user",
            is_active=True,
        )
        other_member_lead = CrmLead.objects.create(
            organization=self.org,
            lead_name="Other Member Lead",
            company="Other Member Corp",
            phone="9333333333",
            lead_amount="7000",
            lead_source="Website",
            assign_type="Users",
            assigned_user=other_user,
            assigned_user_ids=[other_user.id],
            stage="New",
            status="Open",
            created_by=other_user,
            updated_by=other_user,
        )

        self.client.force_login(crm_user)
        response = self.client.patch(
            f"/api/business-autopilot/leads/{other_member_lead.id}",
            data=json.dumps({"lead_amount": "7700"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["lead"]["lead_amount"], 7700.0)
        other_member_lead.refresh_from_db()
        self.assertEqual(float(other_member_lead.lead_amount), 7700.0)

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


class BusinessAutopilotSiteAdminQuickEstimateTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="siteadmin@workzilla.test",
            email="siteadmin@workzilla.test",
            password="pw123456",
        )
        self.org = Organization.objects.create(
            name="Alpha Prints",
            company_key="ALPHAPRINTS",
            owner=self.admin,
        )
        UserProfile.objects.create(
            user=self.admin,
            organization=self.org,
            role="company_admin",
        )
        self.product, _ = Product.objects.get_or_create(
            slug="business-autopilot-erp",
            defaults={"name": "Business Autopilot"},
        )
        self.plan = Plan.objects.create(name="Pro ERP", product=self.product)
        Subscription.objects.create(
            user=self.admin,
            organization=self.org,
            plan=self.plan,
            status="active",
        )
        OrganizationProduct.objects.create(
            organization=self.org,
            product=self.product,
            subscription_status="active",
        )
        self.client.force_login(self.admin)

    def test_site_admin_qe_new_mobile_creates_client_and_estimate(self):
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card Printing 300Gsm Single Side Digital Printing 500Nos Rs.1050",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "quick_estimate_created")
        self.assertEqual(payload["estimate_number"], "QE-0001")
        self.assertTrue(payload["whatsapp_share_pending"])
        estimate = QuickEstimate.objects.get(organization=self.org, estimate_number="QE-0001")
        self.assertEqual(estimate.mobile, "9092833701")
        self.assertEqual(estimate.client_name, "Guru")
        self.assertEqual(str(estimate.total_amount), "1050.00")
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        customers = workspace.data.get("customers") or []
        self.assertEqual(len(customers), 1)
        self.assertEqual(str(customers[0].get("phone") or ""), "9092833701")
        self.assertEqual(str(customers[0].get("clientName") or ""), "Guru")
        self.assertIn("Quick Estimate", payload["reply"])
        self.assertIn("QE-0001", payload["thermal_preview_html"])

    def test_site_admin_qe_same_mobile_reuses_existing_client_name(self):
        AccountsWorkspace.objects.create(
            organization=self.org,
            data={
                "customers": [
                    {
                        "id": "cust_existing_1",
                        "companyName": "Guru Prints",
                        "clientName": "Guru",
                        "name": "Guru Prints",
                        "phoneCountryCode": "+91",
                        "phone": "9092833701",
                        "phoneList": [{"countryCode": "+91", "number": "9092833701"}],
                        "email": "",
                        "additionalEmails": [],
                        "emailList": [],
                        "billingAddress": "",
                        "shippingAddress": "",
                        "gstin": "",
                    }
                ],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [],
            },
        )

        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nBusiness Card Printing Rs.1050",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "quick_estimate_created")
        estimate = QuickEstimate.objects.get(organization=self.org, estimate_number="QE-0001")
        self.assertEqual(estimate.client_name, "Guru")
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        self.assertEqual(len(workspace.data.get("customers") or []), 1)

    def test_site_admin_qe_same_mobile_only_asks_for_item_details_without_creating_estimate(self):
        AccountsWorkspace.objects.create(
            organization=self.org,
            data={
                "customers": [
                    {
                        "id": "cust_existing_2",
                        "companyName": "Madavan",
                        "clientName": "Madavan",
                        "name": "Madavan",
                        "phoneCountryCode": "+91",
                        "phone": "4545454545",
                        "phoneList": [{"countryCode": "+91", "number": "4545454545"}],
                        "email": "",
                        "additionalEmails": [],
                        "emailList": [],
                        "billingAddress": "",
                        "shippingAddress": "",
                        "gstin": "",
                    }
                ],
                "vendors": [],
                "itemMasters": [],
                "gstTemplates": [],
                "billingTemplates": [],
                "estimates": [],
                "invoices": [],
            },
        )

        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "4545454545"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "collecting_quick_estimate")
        self.assertEqual(payload["reply"], "Client name: Madavan. Please share the estimate item details.")
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, mobile="4545454545").exists())

    def test_site_admin_qe_numbered_item_list_creates_multiple_items_in_order(self):
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\n1. Business Card 500 nos Rs.1050\n2. Letterhead 100 nos Rs.950",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, estimate_number="QE-0001")
        items = list(estimate.items.order_by("id"))
        self.assertEqual(len(items), 2)
        self.assertIn("Business Card", items[0].description)
        self.assertIn("Letterhead", items[1].description)
        self.assertEqual(str(items[0].amount), "1050.00")
        self.assertEqual(str(items[1].amount), "950.00")
        self.assertEqual(str(estimate.total_amount), "2000.00")

    def test_site_admin_qe_missing_mobile_asks_for_mobile_then_continues(self):
        first = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "QE"},
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["reply"], "Please share the mobile number.")

        second = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701"},
            content_type="application/json",
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["reply"], "Please share the client name.")

        state = SiteAdminChatState.objects.get(organization=self.org, user=self.admin)
        self.assertEqual(state.intent, "quick_estimate")
        self.assertEqual(state.current_step, "client_name")

    def test_site_admin_qe_mobile_only_during_item_step_does_not_become_item_or_amount(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "QE"},
            content_type="application/json",
        )
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9094433222"},
            content_type="application/json",
        )
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "Guru"},
            content_type="application/json",
        )

        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9094433222"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "collecting_quick_estimate")
        self.assertEqual(response.json()["reply"], "Please share the client name.")
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, mobile="9094433222").exists())
        state = SiteAdminChatState.objects.get(organization=self.org, user=self.admin)
        self.assertEqual(state.current_step, "client_name")
        self.assertEqual(str((state.collected_data or {}).get("mobile") or ""), "9094433222")
        self.assertEqual(str((state.collected_data or {}).get("item_text") or ""), "")

    def test_site_admin_qe_does_not_use_greeting_as_client_name(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "QE"},
            content_type="application/json",
        )
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "Hi"},
            content_type="application/json",
        )
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "8412456789"},
            content_type="application/json",
        )
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "Letterhead Printing 100Gsm Bond Sheet 100nos Rs.950"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "collecting_quick_estimate")
        self.assertEqual(response.json()["reply"], "Please share the client name.")
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, mobile="8412456789").exists())

    def test_site_admin_qe_whatsapp_yes_returns_wa_me_link(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card Printing 500Nos Rs.1050",
            },
            content_type="application/json",
        )

        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "yes"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "open_whatsapp")
        self.assertIn("https://wa.me/919092833701?text=", payload["whatsapp_url"])
        estimate = QuickEstimate.objects.get(organization=self.org, estimate_number="QE-0001")
        self.assertEqual(estimate.status, QuickEstimate.STATUS_SHARED)

    def test_site_admin_qe_international_mobile_preserves_country_code(self):
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "+14252214350\nDeepali\nFlex Banner Printing Rs.3300",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        estimate = QuickEstimate.objects.get(organization=self.org, estimate_number="QE-0001")
        self.assertEqual(estimate.mobile, "14252214350")
        self.assertEqual(estimate.client_name, "Deepali")
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        customers = workspace.data.get("customers") or []
        self.assertEqual(customers[0].get("phone"), "14252214350")
        self.assertEqual(customers[0].get("phoneCountryCode"), "+1")
        self.assertEqual(customers[0].get("phoneList"), [{"countryCode": "+1", "number": "14252214350"}])
        whatsapp_response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "yes"},
            content_type="application/json",
        )
        estimate.refresh_from_db()
        self.assertEqual(estimate.status, QuickEstimate.STATUS_SHARED)
        self.assertIn("https://wa.me/14252214350?text=", whatsapp_response.json()["whatsapp_url"])

    def test_quick_estimate_contact_delete_hides_linked_contact_until_recreated(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card Printing Rs.1050",
            },
            content_type="application/json",
        )

        list_response = self.client.get("/api/business-autopilot/quick-estimate-contacts/")
        self.assertEqual(list_response.status_code, 200)
        contact = list_response.json()["contacts"][0]

        delete_response = self.client.post(
            f"/api/business-autopilot/quick-estimate-contacts/{contact['id']}/",
            data=json.dumps({"__action": "DELETE"}),
            content_type="application/json",
        )
        self.assertEqual(delete_response.status_code, 200)

        refreshed_response = self.client.get("/api/business-autopilot/quick-estimate-contacts/")
        self.assertEqual(refreshed_response.status_code, 200)
        self.assertEqual(refreshed_response.json()["contacts"], [])
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        self.assertIn(contact["id"], workspace.data.get("quickEstimateDeletedContactIds") or [])

    def test_quick_estimate_numbers_restart_per_organization(self):
        other_user = User.objects.create_user(
            username="other@workzilla.test",
            email="other@workzilla.test",
            password="pw123456",
        )
        other_org = Organization.objects.create(
            name="Beta Prints",
            company_key="BETAPRINTS",
            owner=other_user,
        )
        UserProfile.objects.create(
            user=other_user,
            organization=other_org,
            role="company_admin",
        )
        Subscription.objects.create(
            user=other_user,
            organization=other_org,
            plan=self.plan,
            status="active",
        )
        OrganizationProduct.objects.create(
            organization=other_org,
            product=self.product,
            subscription_status="active",
        )

        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card Rs.1050"},
            content_type="application/json",
        )

        self.client.logout()
        self.client.force_login(other_user)
        other_response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9876543210\nArun\nLetter Pad Rs.500"},
            content_type="application/json",
        )

        self.assertEqual(other_response.status_code, 200)
        self.assertEqual(other_response.json()["estimate_number"], "QE-0001")
        self.assertEqual(QuickEstimate.objects.filter(organization=self.org, estimate_number="QE-0001").count(), 1)
        self.assertEqual(QuickEstimate.objects.filter(organization=other_org, estimate_number="QE-0001").count(), 1)

    def test_quick_estimate_number_uses_next_continuous_sequence_after_sequence_drift(self):
        QuickEstimateSequence.objects.create(organization=self.org, next_number=2)
        QuickEstimate.objects.create(
            organization=self.org,
            estimate_sequence=5,
            estimate_number="QE-0005",
            estimate_date=date(2026, 6, 21),
            mobile="9092833701",
            client_name="Guru",
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("100.00"),
            status=QuickEstimate.STATUS_CREATED,
        )

        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card Rs.1050"},
            content_type="application/json",
        )

        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["estimate_number"], "QE-0006")

    def test_quick_estimate_list_returns_latest_estimate_number_first(self):
        QuickEstimate.objects.create(
            organization=self.org,
            estimate_sequence=1,
            estimate_number="QE-0001",
            estimate_date=date(2026, 6, 21),
            mobile="9000000001",
            client_name="Old",
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("100.00"),
            status=QuickEstimate.STATUS_CREATED,
        )
        QuickEstimate.objects.create(
            organization=self.org,
            estimate_sequence=2,
            estimate_number="QE-0002",
            estimate_date=date(2026, 6, 22),
            mobile="9000000002",
            client_name="New",
            subtotal=Decimal("200.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("200.00"),
            status=QuickEstimate.STATUS_CREATED,
        )

        response = self.client.get("/api/business-autopilot/quick-estimates/")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["quick_estimates"]
        self.assertEqual(rows[0]["estimate_number"], "QE-0002")
        self.assertEqual(rows[1]["estimate_number"], "QE-0001")

    def test_quick_estimate_detail_patch_updates_item_list(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "item_text": "1. Business Card 500 nos Rs.1050\n2. Letterhead 100 nos Rs.950",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "quick_estimate_updated")
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        items = list(estimate.items.order_by("id"))
        self.assertEqual(len(items), 2)
        self.assertEqual(str(estimate.total_amount), "2000.00")
        self.assertIn("QE-0001", payload["thermal_preview_html"])

    def test_quick_estimate_detail_post_with_body_action_patch_updates_item_list(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.post(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "__action": "PATCH",
                "item_text": "1. Business Card 500 nos Rs.1050\n2. Letterhead 100 nos Rs.950",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        items = list(estimate.items.order_by("id"))
        self.assertEqual(len(items), 2)
        self.assertEqual(str(estimate.total_amount), "2000.00")

    def test_quick_estimate_collection_post_with_body_action_patch_updates_item_list(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data=json.dumps({
                "__action": "PATCH",
                "quick_estimate_id": estimate_id,
                "mobile": "9092833701",
                "client_name": "Guru",
                "item_text": "1. Business Card 500 nos Rs.1050\n2. Letterhead 100 nos Rs.950",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        items = list(estimate.items.order_by("id"))
        self.assertEqual(len(items), 2)
        self.assertEqual(str(estimate.total_amount), "2000.00")

    def test_quick_estimate_detail_patch_updates_estimate_date(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        original_date = (estimate.estimate_date or timezone.localtime(estimate.created_at).date()).isoformat()

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "estimate_date": "2026-06-30",
                "mobile": "9092833701",
                "client_name": "Guru",
                "item_text": "1. Business Card 500 nos Rs.1050",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertNotEqual((estimate.estimate_date or timezone.localtime(estimate.created_at).date()).isoformat(), original_date)
        self.assertEqual(estimate.estimate_date.isoformat(), "2026-06-30")

        detail = self.client.get(f"/api/business-autopilot/quick-estimates/{estimate_id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["quick_estimate"]["estimate_date"], "2026-06-30")

    def test_quick_estimate_detail_patch_updates_mobile_and_client_in_same_customer_row(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        customer_id = estimate.customer_id

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "mobile": "9876543210",
                "client_name": "Guru Prakash",
                "item_text": "1. Business Card 500 nos Rs.1050\n2. Letterhead 100 nos Rs.950",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.mobile, "9876543210")
        self.assertEqual(estimate.client_name, "Guru Prakash")
        self.assertEqual(estimate.customer_id, customer_id)
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        customers = workspace.data.get("customers") or []
        self.assertEqual(len(customers), 1)
        self.assertEqual(str(customers[0].get("id") or ""), customer_id)
        self.assertEqual(str(customers[0].get("phone") or ""), "9876543210")
        self.assertEqual(str(customers[0].get("clientName") or ""), "Guru Prakash")

    def test_quick_estimate_detail_patch_merges_duplicate_customer_rows_for_same_mobile(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9094433222\nVarnika Vasthra\nBoard Printing Rs.650",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        original_customer_id = estimate.customer_id
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        workspace.data["customers"].append(
            {
                "id": "cust_duplicate_1",
                "companyName": "Guru",
                "clientName": "Guru",
                "name": "Guru",
                "phoneCountryCode": "+91",
                "phone": "9094433222",
                "phoneList": [{"countryCode": "+91", "number": "9094433222"}],
                "email": "",
                "additionalEmails": [],
                "emailList": [],
                "billingAddress": "",
                "shippingAddress": "",
                "gstin": "",
            }
        )
        workspace.save(update_fields=["data", "updated_at"])

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "mobile": "9094433222",
                "client_name": "Varnika Vasthra",
                "item_text": "1. 300Gsm Matt Board Two Rs.650\n2. 3in Dia Art Sticker Rs.100",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.customer_id, original_customer_id)
        workspace.refresh_from_db()
        customers = workspace.data.get("customers") or []
        self.assertEqual(len([row for row in customers if str(row.get("phone") or "") == "9094433222"]), 1)
        self.assertFalse(any(str(row.get("id") or "") == "cust_duplicate_1" for row in customers))

    def test_quick_estimate_contact_list_returns_workspace_customers(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )

        response = self.client.get("/api/business-autopilot/quick-estimate-contacts/")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["contacts"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["client_name"], "Guru")
        self.assertEqual(rows[0]["mobile"], "9092833701")
        self.assertEqual(rows[0]["linked_estimate_count"], 1)

    def test_quick_estimate_contact_delete_keeps_existing_estimate_client_data(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(id=estimate_id)

        response = self.client.delete(f"/api/business-autopilot/quick-estimate-contacts/{estimate.customer_id}/")

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.client_name, "Guru")
        self.assertEqual(estimate.mobile, "9092833701")
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        self.assertEqual(workspace.data.get("quickEstimateContacts") or [], [])

    def test_quick_estimate_contact_edit_updates_linked_estimate_client_data(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(id=estimate_id)

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimate-contacts/{estimate.customer_id}/",
            data=json.dumps({"client_name": "Guru Updated", "mobile": "9876543210"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.client_name, "Guru Updated")
        self.assertEqual(estimate.mobile, "9876543210")

    def test_quick_estimate_contact_post_with_body_action_patch_updates_linked_estimate_client_data(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(id=estimate_id)

        response = self.client.post(
            f"/api/business-autopilot/quick-estimate-contacts/{estimate.customer_id}/",
            data=json.dumps({
                "__action": "PATCH",
                "client_name": "Guru Updated",
                "mobile": "9876543210",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.client_name, "Guru Updated")
        self.assertEqual(estimate.mobile, "9876543210")

    def test_site_admin_qe_new_mobile_without_client_name_does_not_save(self):
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nBusiness Card Printing Rs.1050"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "collecting_quick_estimate")
        self.assertEqual(response.json()["reply"], "Please share the client name.")
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, mobile="9092833701").exists())

    def test_quick_estimate_detail_delete_removes_row(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(id=estimate_id)
        SiteAdminChatState.objects.filter(organization=self.org, user=self.admin).update(
            last_quick_estimate=estimate,
            awaiting_whatsapp_share=True,
        )

        response = self.client.delete(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["action"], "quick_estimate_deleted")
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, id=estimate_id).exists())
        state = SiteAdminChatState.objects.get(organization=self.org, user=self.admin)
        self.assertIsNone(state.last_quick_estimate)
        self.assertFalse(state.awaiting_whatsapp_share)

    def test_quick_estimate_list_marks_cancelled_delete_allowed_for_org_admin(self):
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            estimate_sequence=1,
            estimate_number="QE-0001",
            mobile="9092833701",
            client_name="Guru",
            status=QuickEstimate.STATUS_CANCELLED,
            created_by=self.admin,
        )

        response = self.client.get("/api/business-autopilot/quick-estimates/")

        self.assertEqual(response.status_code, 200)
        row = next(item for item in response.json()["quick_estimates"] if item["id"] == estimate.id)
        self.assertTrue(row["can_delete_cancelled"])

    def test_quick_estimate_list_marks_cancelled_delete_allowed_for_org_admin_with_other_org_profile_first(self):
        other_org = Organization.objects.create(
            name="Beta Prints",
            company_key="BETAPRINTS2",
            owner=self.admin,
        )
        UserProfile.objects.create(
            user=self.admin,
            organization=other_org,
            role="org_user",
        )
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            estimate_sequence=2,
            estimate_number="QE-0002",
            mobile="9092833702",
            client_name="Arun",
            status=QuickEstimate.STATUS_CANCELLED,
            created_by=self.admin,
        )

        response = self.client.get("/api/business-autopilot/quick-estimates/")

        self.assertEqual(response.status_code, 200)
        row = next(item for item in response.json()["quick_estimates"] if item["id"] == estimate.id)
        self.assertTrue(row["can_delete_cancelled"])

    def test_quick_estimate_delete_cancelled_row_forbidden_for_org_user(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        QuickEstimate.objects.filter(id=estimate_id).update(status=QuickEstimate.STATUS_CANCELLED)

        org_user = User.objects.create_user(
            username="qe-user@workzilla.test",
            email="qe-user@workzilla.test",
            password="pw123456",
        )
        UserProfile.objects.create(
            user=org_user,
            organization=self.org,
            role="org_user",
        )
        OrganizationUser.objects.create(
            organization=self.org,
            user=org_user,
            role="org_user",
            is_active=True,
        )

        self.client.logout()
        self.client.force_login(org_user)
        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data=json.dumps({
                "__action": "DELETE",
                "quick_estimate_id": estimate_id,
                "action": "delete",
                "reason": "Not needed",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "quick_estimate_delete_forbidden")
        self.assertTrue(QuickEstimate.objects.filter(organization=self.org, id=estimate_id).exists())

    def test_quick_estimate_delete_cancelled_row_removes_row_for_org_admin(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        estimate = QuickEstimate.objects.get(id=estimate_id)
        estimate.status = QuickEstimate.STATUS_CANCELLED
        estimate.save(update_fields=["status", "updated_at"])
        SiteAdminChatState.objects.filter(organization=self.org, user=self.admin).update(
            last_quick_estimate=estimate,
            awaiting_whatsapp_share=True,
        )

        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data=json.dumps({
                "__action": "DELETE",
                "quick_estimate_id": estimate_id,
                "action": "delete",
                "reason": "Customer cancelled",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["deleted_estimate_id"], estimate_id)
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, id=estimate_id).exists())
        state = SiteAdminChatState.objects.get(organization=self.org, user=self.admin)
        self.assertIsNone(state.last_quick_estimate)
        self.assertFalse(state.awaiting_whatsapp_share)

    def test_quick_estimate_collection_post_with_payment_action_marks_cash_payment_done(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data=json.dumps({
                "__action": "PATCH",
                "quick_estimate_id": estimate_id,
                "action": "payment",
                "payment_status": "completed",
                "payment_mode": "cash",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        self.assertEqual(estimate.payment_status, QuickEstimate.PROGRESS_COMPLETED)
        self.assertEqual(estimate.payment_mode, "cash")

    def test_quick_estimate_collection_post_multipart_patch_accepts_payment_proof_file(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        uploaded = SimpleUploadedFile(
            "proof.png",
            base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII="),
            content_type="image/png",
        )

        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data={
                "__action": "PATCH",
                "quick_estimate_id": estimate_id,
                "mobile": "9092833701",
                "client_name": "Guru",
                "payment_status": "completed",
                "payment_mode": "online",
                "job_status": "non_completed",
                "delivery_status": "non_completed",
                "item_text": "1. Business Card 500 nos Rs.1050",
                "payment_proof_file": uploaded,
            },
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        self.assertEqual(estimate.payment_status, QuickEstimate.PROGRESS_COMPLETED)
        self.assertEqual(estimate.payment_mode, "online")
        self.assertTrue(str(estimate.payment_proof_image).startswith("data:image/png;base64,"))

    def test_quick_estimate_payment_update_accepts_multiple_payment_proof_images(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        image_one = "data:image/png;base64,AAA111"
        image_two = "data:image/png;base64,BBB222"

        response = self.client.post(
            "/api/business-autopilot/quick-estimates/",
            data=json.dumps({
                "__action": "PATCH",
                "quick_estimate_id": estimate_id,
                "action": "payment",
                "payment_status": "completed",
                "payment_mode": "online",
                "payment_proof_images": [image_one, image_two],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        self.assertEqual(estimate.payment_status, QuickEstimate.PROGRESS_COMPLETED)
        self.assertEqual(estimate.payment_mode, "online")
        self.assertEqual(json.loads(estimate.payment_proof_image), [
            {"image": image_one, "paid_date": ""},
            {"image": image_two, "paid_date": ""},
        ])

        detail = self.client.get(f"/api/business-autopilot/quick-estimates/{estimate_id}/")
        self.assertEqual(detail.status_code, 200)
        quick_estimate = detail.json()["quick_estimate"]
        self.assertEqual(quick_estimate["payment_proof_image"], image_one)
        self.assertEqual(quick_estimate["payment_proof_images"], [image_one, image_two])
        self.assertEqual(quick_estimate["payment_proof_entries"], [
            {"image": image_one, "paid_date": ""},
            {"image": image_two, "paid_date": ""},
        ])

    def test_quick_estimate_payment_update_stores_paid_date_in_payment_proof_entries(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]
        image_one = "data:image/png;base64,AAA111"

        response = self.client.post(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({
                "__action": "PATCH",
                "action": "payment",
                "payment_status": "completed",
                "payment_mode": "online",
                "payment_proof_entries": [{"image": image_one, "paid_date": "2026-06-26"}],
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        self.assertEqual(json.loads(estimate.payment_proof_image), [{"image": image_one, "paid_date": "2026-06-26"}])

    def test_quick_estimate_list_includes_creator_and_assignment_details(self):
        assignee = User.objects.create_user(
            username="qe-assign-user@workzilla.test",
            email="qe-assign-user@workzilla.test",
            password="pw123456",
            first_name="Assign",
            last_name="User",
        )
        UserProfile.objects.create(user=assignee, organization=self.org, role="org_user")
        OrganizationUser.objects.create(organization=self.org, user=assignee, role="org_user", is_active=True)
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            customer_id="cust_001",
            estimate_sequence=7,
            estimate_number="QE-0007",
            mobile="9092833701",
            client_name="Guru",
            subtotal="950",
            total_amount="950",
            status=QuickEstimate.STATUS_CREATED,
            created_by=self.admin,
            assigned_user=assignee,
            assigned_by=self.admin,
        )

        response = self.client.get("/api/business-autopilot/quick-estimates/")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["quick_estimates"]
        payload = next(row for row in rows if row["id"] == estimate.id)
        self.assertEqual(payload["created_by_name"], self.admin.first_name or self.admin.username)
        self.assertEqual(payload["assigned_user_id"], assignee.id)
        self.assertEqual(payload["assigned_user_name"], "Assign User")
        self.assertEqual(payload["assigned_by_name"], self.admin.first_name or self.admin.username)

    def test_quick_estimate_detail_patch_assigns_followup_user(self):
        assignee = User.objects.create_user(
            username="qe-assign-target@workzilla.test",
            email="qe-assign-target@workzilla.test",
            password="pw123456",
            first_name="Follow",
            last_name="Up",
        )
        UserProfile.objects.create(user=assignee, organization=self.org, role="org_user")
        OrganizationUser.objects.create(organization=self.org, user=assignee, role="org_user", is_active=True)
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={
                "message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050",
            },
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps(
                {
                    "action": "assign",
                    "assigned_user_id": assignee.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(organization=self.org, id=estimate_id)
        self.assertEqual(estimate.assigned_user_id, assignee.id)
        self.assertEqual(estimate.assigned_by_id, self.admin.id)
        payload = response.json()["quick_estimate"]
        self.assertEqual(payload["assigned_user_name"], "Follow Up")
        self.assertTrue(QuickEstimateHistory.objects.filter(quick_estimate=estimate, action="assigned").exists())

    def test_quick_estimate_detail_patch_assign_sets_missing_creator(self):
        assignee = User.objects.create_user(
            username="qe-assign-missing-creator@workzilla.test",
            email="qe-assign-missing-creator@workzilla.test",
            password="pw123456",
            first_name="Assign",
            last_name="Target",
        )
        UserProfile.objects.create(user=assignee, organization=self.org, role="org_user")
        membership = OrganizationUser.objects.create(
            organization=self.org,
            user=assignee,
            role="org_user",
            is_active=True,
        )
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            customer_id="cust_missing_creator",
            estimate_sequence=99,
            estimate_number="QE-0099",
            mobile="9092833701",
            client_name="Legacy",
            subtotal="1200",
            total_amount="1200",
            status=QuickEstimate.STATUS_CREATED,
            created_by=None,
        )

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate.id}/",
            data=json.dumps(
                {
                    "action": "assign",
                    "assigned_user_id": assignee.id,
                    "membership_id": membership.id,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate.refresh_from_db()
        self.assertEqual(estimate.created_by_id, self.admin.id)
        self.assertEqual(estimate.assigned_user_id, assignee.id)
        self.assertEqual(response.json()["quick_estimate"]["created_by_name"], self.admin.first_name or self.admin.username)

    def test_quick_estimate_update_creates_history_entry(self):
        created = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "9092833701\nGuru\nBusiness Card 500 nos Rs.1050"},
            content_type="application/json",
        )
        estimate_id = created.json()["quick_estimate_id"]

        response = self.client.patch(
            f"/api/business-autopilot/quick-estimates/{estimate_id}/",
            data=json.dumps({"item_text": "1. Letterhead 100 nos Rs.950"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        estimate = QuickEstimate.objects.get(id=estimate_id)
        history = QuickEstimateHistory.objects.filter(quick_estimate=estimate, action="updated").first()
        self.assertIsNotNone(history)
        self.assertEqual(history.actor_id, self.admin.id)

    def test_quick_estimate_history_endpoint_returns_entries(self):
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            customer_id="cust_001",
            estimate_sequence=9,
            estimate_number="QE-0009",
            mobile="9092833701",
            client_name="Guru",
            subtotal="950",
            total_amount="950",
            status=QuickEstimate.STATUS_CREATED,
            created_by=self.admin,
        )
        QuickEstimateHistory.objects.create(
            quick_estimate=estimate,
            action="updated",
            note="Estimate updated for Guru.",
            actor=self.admin,
            snapshot={"after": {"client_name": "Guru"}},
        )

        response = self.client.get(f"/api/business-autopilot/quick-estimates/{estimate.id}/history/")

        self.assertEqual(response.status_code, 200)
        rows = response.json()["history"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["actor_name"], self.admin.username)

    def test_quick_estimate_list_includes_pdf_download_url(self):
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            customer_id="cust_pdf_001",
            estimate_sequence=11,
            estimate_number="QE-0011",
            mobile="9092833701",
            client_name="Guru",
            subtotal="950",
            total_amount="950",
            status=QuickEstimate.STATUS_CREATED,
            created_by=self.admin,
        )

        response = self.client.get("/api/business-autopilot/quick-estimates/")

        self.assertEqual(response.status_code, 200)
        payload = next(row for row in response.json()["quick_estimates"] if row["id"] == estimate.id)
        self.assertEqual(
            payload["thermal_preview_pdf_url"],
            f"/api/business-autopilot/quick-estimates/{estimate.id}/thermal-preview/?format=pdf",
        )

    def test_quick_estimate_thermal_preview_pdf_uses_template_size_in_filename(self):
        estimate = QuickEstimate.objects.create(
            organization=self.org,
            customer_id="cust_pdf_002",
            estimate_sequence=12,
            estimate_number="QE-0012",
            mobile="9092833701",
            client_name="Guru",
            subtotal="950",
            total_amount="950",
            status=QuickEstimate.STATUS_CREATED,
            created_by=self.admin,
        )
        QuickEstimateItem.objects.create(
            quick_estimate=estimate,
            service_name="Business Card",
            description="Matte lamination",
            quantity="500",
            unit="Nos",
            amount="950",
        )

        workspace = AccountsWorkspace.objects.get(organization=self.org)
        workspace.data["quickEstimateSettings"] = {
            "headerText": "<p>Demo Header</p>",
            "templateSize": "3in",
        }
        workspace.save(update_fields=["data", "updated_at"])

        response = self.client.get(f"/api/business-autopilot/quick-estimates/{estimate.id}/thermal-preview/?format=pdf")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn('filename="QE-0012_3in.pdf"', response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_quick_estimate_settings_post_with_body_action_patch_saves_json_payload(self):
        response = self.client.post(
            "/api/business-autopilot/quick-estimate-settings/",
            data=json.dumps(
                {
                    "__action": "PATCH",
                    "headerText": "<p>Demo Header</p>",
                    "templateSize": "3in",
                    "paymentProofRetentionDays": "60",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        settings_data = workspace.data.get("quickEstimateSettings") or {}
        self.assertEqual(settings_data.get("templateSize"), "3in")
        self.assertEqual(settings_data.get("paymentProofRetentionDays"), "60")
        self.assertIn("Demo Header", settings_data.get("headerText") or "")

    def test_quick_estimate_settings_post_with_formdata_patch_saves_qr_header(self):
        response = self.client.post(
            "/api/business-autopilot/quick-estimate-settings/",
            data={
                "__action": "PATCH",
                "headerText": '<p>Gpay : 9092833701</p><img src="data:image/png;base64,AAA111" alt="QR" />',
                "templateSize": "3in",
                "paymentProofRetentionDays": "45",
            },
        )

        self.assertEqual(response.status_code, 200)
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        settings_data = workspace.data.get("quickEstimateSettings") or {}
        self.assertEqual(settings_data.get("templateSize"), "3in")
        self.assertEqual(settings_data.get("paymentProofRetentionDays"), "45")
        self.assertIn("data:image/png;base64,AAA111", settings_data.get("headerText") or "")

    def test_quick_estimate_settings_post_replaces_header_image_tokens_with_uploaded_media_urls(self):
        uploaded = SimpleUploadedFile(
            "qr.png",
            base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII="),
            content_type="image/png",
        )

        response = self.client.post(
            "/api/business-autopilot/quick-estimate-settings/",
            data={
                "__action": "PATCH",
                "headerText": '<p>Gpay : 9092833701</p><img src="__WZ_QE_HEADER_IMAGE_1__" alt="QR" />',
                "templateSize": "3in",
                "paymentProofRetentionDays": "45",
                "header_image_tokens": "__WZ_QE_HEADER_IMAGE_1__",
                "header_image_files": uploaded,
            },
        )

        self.assertEqual(response.status_code, 200)
        workspace = AccountsWorkspace.objects.get(organization=self.org)
        settings_data = workspace.data.get("quickEstimateSettings") or {}
        self.assertIn("/media/business_autopilot/quick_estimate_headers/", settings_data.get("headerText") or "")
        self.assertNotIn("__WZ_QE_HEADER_IMAGE_1__", settings_data.get("headerText") or "")

    def test_site_admin_reset_clears_pending_state(self):
        self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "QE"},
            content_type="application/json",
        )
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "reset"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "state_cleared")
        state = SiteAdminChatState.objects.get(organization=self.org, user=self.admin)
        self.assertEqual(state.intent, "")
        self.assertEqual(state.current_step, "")

    def test_site_admin_instruction_registry_loads_quick_estimate_prompt(self):
        module = get_site_admin_module("quick_estimate")
        self.assertIsNotNone(module)
        self.assertTrue(module.enabled)
        self.assertIn("quick_estimate_create", module.supported_intents)
        self.assertIn("mobile", module.required_fields)
        self.assertEqual(module.output_schema.get("module"), "quick_estimate")

        prompt_text = build_site_admin_instruction_context("quick_estimate")
        self.assertIn("Business Autopilot", prompt_text)
        self.assertIn("Quick Estimate Module Instruction", prompt_text)
        self.assertIn("\"module\": \"quick_estimate\"", prompt_text)

    def test_site_admin_requires_explicit_qe_module_entry(self):
        response = self.client.post(
            "/api/business-autopilot/site-admin/chat",
            data={"message": "8412456789 Letterhead Printing 100Gsm Bond Sheet 100nos Rs.950"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action"], "unsupported")
        self.assertIn("Click QE Create to open Quick Estimate", response.json()["reply"])
        self.assertFalse(QuickEstimate.objects.filter(organization=self.org, mobile="8412456789").exists())

    def test_accounts_workspace_put_blocks_duplicate_customer_phone(self):
        response = self.client.put(
            "/api/business-autopilot/accounts/workspace",
            data=json.dumps(
                {
                    "data": {
                        "customers": [
                            {
                                "id": "cust_1",
                                "companyName": "Alpha",
                                "clientName": "Guru",
                                "phoneCountryCode": "+91",
                                "phone": "9092833701",
                                "phoneList": [{"countryCode": "+91", "number": "9092833701"}],
                                "email": "guru1@example.com",
                                "emailList": ["guru1@example.com"],
                            },
                            {
                                "id": "cust_2",
                                "companyName": "Beta",
                                "clientName": "Arun",
                                "phoneCountryCode": "+91",
                                "phone": "9092833701",
                                "phoneList": [{"countryCode": "+91", "number": "9092833701"}],
                                "email": "arun@example.com",
                                "emailList": ["arun@example.com"],
                            },
                        ]
                    }
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["detail"], "duplicate_customer")
        self.assertEqual(payload["duplicate_fields"], ["phone"])

    def test_accounts_workspace_put_blocks_duplicate_customer_email(self):
        response = self.client.put(
            "/api/business-autopilot/accounts/workspace",
            data=json.dumps(
                {
                    "data": {
                        "customers": [
                            {
                                "id": "cust_1",
                                "companyName": "Alpha",
                                "clientName": "Guru",
                                "phoneCountryCode": "+91",
                                "phone": "9092833701",
                                "phoneList": [{"countryCode": "+91", "number": "9092833701"}],
                                "email": "same@example.com",
                                "emailList": ["same@example.com"],
                            },
                            {
                                "id": "cust_2",
                                "companyName": "Beta",
                                "clientName": "Arun",
                                "phoneCountryCode": "+91",
                                "phone": "9876543210",
                                "phoneList": [{"countryCode": "+91", "number": "9876543210"}],
                                "email": "same@example.com",
                                "emailList": ["same@example.com"],
                            },
                        ]
                    }
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        payload = response.json()
        self.assertEqual(payload["detail"], "duplicate_customer")
        self.assertEqual(payload["duplicate_fields"], ["email"])
