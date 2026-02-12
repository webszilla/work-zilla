from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import redirect, render
from django.urls import reverse

from saas_admin.models import Product


@staff_member_required
def monitor_product_features(request):
    product = Product.objects.filter(slug="monitor").first()
    if not product:
        return redirect(reverse("admin:saas_admin_product_changelist"))
    return redirect(reverse("admin:saas_admin_product_change", args=[product.pk]))


@staff_member_required
def monitor_products_hub(request):
    product = Product.objects.filter(slug="monitor").first()
    product_change_url = None
    if product:
        product_change_url = reverse("admin:saas_admin_product_change", args=[product.pk])

    sections = [
        {
            "title": "Product Settings",
            "items": [
                {
                    "label": "Edit Work Suite Product",
                    "list_url": reverse("admin:saas_admin_product_changelist"),
                    "change_url": product_change_url,
                },
                {
                    "label": "Org Product Entitlements",
                    "list_url": reverse("admin:saas_admin_orgproductentitlement_changelist"),
                    "add_url": reverse("admin:saas_admin_orgproductentitlement_add"),
                },
            ],
        },
        {
            "title": "Organizations & Users",
            "items": [
                {
                    "label": "Organizations",
                    "list_url": reverse("admin:core_organization_changelist"),
                    "add_url": reverse("admin:core_organization_add"),
                },
                {
                    "label": "Users",
                    "list_url": reverse("admin:common_auth_user_changelist"),
                    "add_url": reverse("admin:common_auth_user_add"),
                },
            ],
        },
        {
            "title": "Plans & Subscriptions",
            "items": [
                {
                    "label": "Plans",
                    "list_url": reverse("admin:core_plan_changelist"),
                    "add_url": reverse("admin:core_plan_add"),
                },
                {
                    "label": "Subscriptions",
                    "list_url": reverse("admin:core_subscription_changelist"),
                    "add_url": reverse("admin:core_subscription_add"),
                },
                {
                    "label": "Pending Transfers",
                    "list_url": reverse("admin:core_pendingtransfer_changelist"),
                    "add_url": reverse("admin:core_pendingtransfer_add"),
                },
            ],
        },
        {
            "title": "Billing & Referrals",
            "items": [
                {
                    "label": "Billing Profiles",
                    "list_url": reverse("admin:core_billingprofile_changelist"),
                    "add_url": reverse("admin:core_billingprofile_add"),
                },
                {
                    "label": "Invoice Seller Profiles",
                    "list_url": reverse("admin:core_invoicesellerprofile_changelist"),
                    "add_url": reverse("admin:core_invoicesellerprofile_add"),
                },
                {
                    "label": "Referral Earnings",
                    "list_url": reverse("admin:core_referralearning_changelist"),
                    "add_url": reverse("admin:core_referralearning_add"),
                },
                {
                    "label": "Referral Settings",
                    "list_url": reverse("admin:core_referralsettings_changelist"),
                    "add_url": reverse("admin:core_referralsettings_add"),
                },
            ],
        },
        {
            "title": "Support",
            "items": [
                {
                    "label": "Support Access",
                    "list_url": "/admin/support-access/",
                },
            ],
        },
    ]

    context = {
        **admin.site.each_context(request),
        "title": "Work Suite Product",
        "sections": sections,
    }
    return render(request, "admin/worksuite/worksuite_products_hub.html", context)
