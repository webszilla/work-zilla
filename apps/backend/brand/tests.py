from django.test import TestCase

from apps.backend.brand.models import Product, ProductAlias, ProductRouteMapping


class BrandingApiTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(
            key="worksuite",
            internal_code_name="monitor",
            display_name="Work Suite",
            tagline="Focus with clarity.",
            description="Monitoring without the noise.",
            primary_color="#123456",
            is_active=True,
        )
        ProductAlias.objects.create(
            product=self.product,
            alias_key="monitorLabel",
            alias_text="Work Suite",
            context=ProductAlias.CONTEXT_UI,
            is_active=True,
        )
        ProductRouteMapping.objects.create(
            product=self.product,
            public_slug="worksuite",
            legacy_slugs=["monitor"],
            redirect_enabled=True,
        )

    def test_branding_endpoint_and_etag(self):
        response = self.client.get("/api/public/branding/?product=worksuite")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["key"], "worksuite")
        self.assertEqual(payload["displayName"], "Work Suite")
        self.assertEqual(payload["publicSlug"], "worksuite")
        self.assertIn("monitor", payload["legacySlugs"])
        self.assertEqual(payload["aliases"]["ui"]["monitorLabel"], "Work Suite")
        etag = response.headers.get("ETag")
        self.assertTrue(etag)

        response_304 = self.client.get(
            "/api/public/branding/?product=worksuite",
            HTTP_IF_NONE_MATCH=etag,
        )
        self.assertEqual(response_304.status_code, 304)


class BrandingRedirectTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(
            key="worksuite",
            internal_code_name="monitor",
            display_name="Work Suite",
            is_active=True,
        )
        ProductRouteMapping.objects.create(
            product=self.product,
            public_slug="worksuite",
            legacy_slugs=["monitor-old"],
            redirect_enabled=True,
        )

    def test_legacy_slug_redirects(self):
        response = self.client.get("/products/monitor-old/")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response["Location"], "/products/worksuite/")
