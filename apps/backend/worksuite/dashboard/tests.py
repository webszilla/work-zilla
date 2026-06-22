from django.test import TestCase

from apps.backend.products.models import Product as PublicProduct
from saas_admin.models import Product
from .api_views import _build_dashboard_products_payload


class DashboardProductsPayloadTests(TestCase):
    def test_only_active_public_products_are_returned(self):
        PublicProduct.objects.create(
            name="AI Chatbot",
            slug="ai-chatbot",
            description="Chat support",
            is_active=True,
            sort_order=1,
        )
        PublicProduct.objects.create(
            name="Business Autopilot",
            slug="business-autopilot-erp",
            description="ERP suite",
            is_active=True,
            sort_order=2,
        )
        Product.objects.create(
            name="AI Chatbot",
            slug="ai-chatbot",
            description="Chat support",
            icon="bi-box",
            status="active",
            features="Live chat\nLeads",
            sort_order=1,
        )
        Product.objects.create(
            name="Business Autopilot",
            slug="business-autopilot-erp",
            description="ERP suite",
            icon="bi-briefcase",
            status="active",
            features="CRM\nAccounts",
            sort_order=2,
        )
        Product.objects.create(
            name="CRM",
            slug="crm",
            description="Legacy card",
            icon="bi-people",
            status="active",
            features="Leads",
            sort_order=3,
        )
        Product.objects.create(
            name="ERP",
            slug="erp",
            description="Legacy card",
            icon="bi-boxes",
            status="coming_soon",
            features="Inventory",
            sort_order=4,
        )
        Product.objects.create(
            name="Work Suite",
            slug="monitor",
            description="Should stay hidden in products section",
            icon="bi-display",
            status="active",
            features="Monitoring",
            sort_order=5,
        )

        payload = _build_dashboard_products_payload()

        self.assertEqual(
            [item["slug"] for item in payload],
            ["ai-chatbot", "business-autopilot-erp"],
        )
        self.assertEqual(payload[0]["features"], ["Live chat", "Leads"])
        self.assertEqual(payload[1]["name"], "Business Autopilot")
