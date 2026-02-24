from django.http import Http404
from django.shortcuts import render, redirect

from .models import Product
from apps.backend.enquiries.views import build_enquiry_context
from apps.backend.brand.models import ProductRouteMapping
from django.db import connection


def product_marketing_view(request, slug):
    retired_product_redirects = {
        "digital-card": "whatsapp-automation",
        "ai-chat-widget": "ai-chatbot",
    }
    if slug in retired_product_redirects:
        return redirect(f"/products/{retired_product_redirects[slug]}/", permanent=True)
    if slug == "online-storage":
        slug = "storage"
    raw_slug = slug
    route = ProductRouteMapping.objects.select_related("product").filter(public_slug=raw_slug).first()
    if not route:
        if connection.vendor == "sqlite":
            for candidate in (
                ProductRouteMapping.objects
                .select_related("product")
            ):
                legacy = candidate.legacy_slugs or []
                if raw_slug in legacy:
                    route = candidate
                    break
        else:
            route = (
                ProductRouteMapping.objects.select_related("product")
                .filter(legacy_slugs__contains=[raw_slug])
                .first()
            )
    if route:
        product_slug = route.product.internal_code_name
    else:
        product_slug = "monitor" if raw_slug == "worksuite" else raw_slug
    product = Product.objects.filter(slug=product_slug, is_active=True).first()
    if not product:
        raise Http404()
    template_slug = route.public_slug if route else raw_slug
    templates = [
        f"products/pages/{template_slug}.html",
        "products/pages/generic.html",
    ]
    context = build_enquiry_context(request)
    context["product"] = product
    seo_title = getattr(product, "seo_title", "") or product.name
    seo_description = getattr(product, "seo_description", "") or product.short_description
    og_title = getattr(product, "og_title", "") or seo_title
    og_description = getattr(product, "og_description", "") or seo_description
    og_image_field = getattr(product, "og_image", None)
    og_image_url = og_image_field.url if og_image_field else None

    context["seo_title"] = seo_title
    context["seo_description"] = seo_description
    context["og_title"] = og_title
    context["og_description"] = og_description
    context["og_image"] = og_image_url
    canonical_slug = route.public_slug if route else slug
    context["canonical_url"] = request.build_absolute_uri(f"/products/{canonical_slug}/")
    return render(request, templates, context)


# Backwards compatibility with any direct imports.
product_page = product_marketing_view
