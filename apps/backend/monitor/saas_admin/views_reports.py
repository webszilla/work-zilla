from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden
from django.shortcuts import render

from core.models import Organization
from .models import Product
from .observability import build_observability_summary
from .api_views import _is_saas_admin_user


@login_required
def observability_report(request):
    if not _is_saas_admin_user(request.user):
        return HttpResponseForbidden("Access denied.")

    days = request.GET.get("days") or 7
    org_id = request.GET.get("org_id") or ""
    product = request.GET.get("product") or "monitor"

    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 7

    try:
        org_id_int = int(org_id) if org_id else None
    except (TypeError, ValueError):
        org_id_int = None

    summary = build_observability_summary(
        days=days,
        org_id=org_id_int,
        product_slug=product,
    )

    orgs = Organization.objects.order_by("name")
    products = Product.objects.order_by("name")

    context = {
        "summary": summary,
        "orgs": orgs,
        "products": products,
        "selected_days": days,
        "selected_org_id": str(org_id or ""),
        "selected_product": product,
        "seo_title": "SaaS Admin Observability",
    }
    return render(request, "saas_admin/observability_report.html", context)
