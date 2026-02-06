from django.http import Http404
from django.shortcuts import render

from .models import Product
from apps.backend.enquiries.views import build_enquiry_context


def product_marketing_view(request, slug):
    if slug == "online-storage":
        slug = "storage"
    product = Product.objects.filter(slug=slug, is_active=True).first()
    if not product:
        raise Http404()
    templates = [
        f"products/pages/{slug}.html",
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
    context["canonical_url"] = request.build_absolute_uri()
    return render(request, templates, context)


# Backwards compatibility with any direct imports.
product_page = product_marketing_view
