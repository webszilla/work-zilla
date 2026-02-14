from django.urls import path
from apps.backend.products import views as product_views
from django.views.generic import RedirectView

from . import views


urlpatterns = [
    path("", views.home_view, name="website_home"),
    path("pricing/", views.pricing_view, name="website_pricing"),
    path("worksuite/", RedirectView.as_view(url="/products/worksuite/", permanent=True), name="worksuite_landing"),
    path("ai-chatbot/", RedirectView.as_view(url="/products/ai-chatbot/", permanent=False), name="ai_chatbot_landing"),
    path("contact/", views.contact_view, name="website_contact"),
    path("about/", views.about_view, name="website_about"),
    path("privacy/", views.privacy_view, name="website_privacy"),
    path("terms/", views.terms_view, name="website_terms"),
    path("sitemap.xml", views.sitemap_view, name="website_sitemap"),
    path("checkout/select/", views.checkout_select, name="checkout_select"),
    path("checkout/", views.checkout_view, name="checkout"),
    path("checkout/confirm/", views.checkout_confirm, name="checkout_confirm"),
    path("my/account/", RedirectView.as_view(url="/my-account/", permanent=False)),
    path("my-account/", views.account_view, name="account"),
    path("my-account/billing/", views.billing_view, name="account_billing"),
    path("my-account/bank-transfer/<int:transfer_id>/", views.account_bank_transfer, name="account_bank_transfer"),
    path("my-account/bank-transfer/", views.account_bank_transfer, name="account_bank_transfer_root"),
    path("my-account/billing/renew/start/", views.billing_renew_start, name="account_billing_renew_start"),
    path("my-account/billing/renew/", views.billing_renew_view, name="account_billing_renew"),
    path("my-account/billing/renew/confirm/", views.billing_renew_confirm, name="account_billing_renew_confirm"),
    path("my-account/profile/", views.profile_view, name="account_profile"),
    path("downloads/windows-agent/", views.download_windows_agent, name="download_windows_agent"),
    path("downloads/mac-agent/", views.download_mac_agent, name="download_mac_agent"),
    path("downloads/bootstrap-products.json", views.bootstrap_products_config, name="bootstrap_products_config"),
]
