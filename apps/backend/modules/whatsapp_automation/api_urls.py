from django.urls import path

from . import api_views


urlpatterns = [
    path("company-profile", api_views.company_profile_settings, name="wa_company_profile_settings"),
    path("settings", api_views.whatsapp_settings_api, name="wa_settings_api"),
    path("rules", api_views.automation_rules_api, name="wa_rules_api"),
    path("rules/<int:rule_id>", api_views.automation_rule_detail_api, name="wa_rule_detail_api"),
    path("preview-reply", api_views.automation_preview_reply, name="wa_preview_reply_api"),
    path("catalogue/page", api_views.catalogue_page_settings_api, name="wa_catalogue_page_settings_api"),
    path("catalogue/products", api_views.catalogue_products_api, name="wa_catalogue_products_api"),
    path("catalogue/products/<int:product_id>", api_views.catalogue_product_detail_api, name="wa_catalogue_product_detail_api"),
]
