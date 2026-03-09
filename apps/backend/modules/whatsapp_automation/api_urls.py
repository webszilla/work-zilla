from django.urls import path

from . import api_views


urlpatterns = [
    path("company-profile", api_views.company_profile_settings, name="wa_company_profile_settings"),
    path("dashboard-summary", api_views.whatsapp_dashboard_summary_api, name="wa_dashboard_summary_api"),
    path("settings", api_views.whatsapp_settings_api, name="wa_settings_api"),
    path("rules", api_views.automation_rules_api, name="wa_rules_api"),
    path("rules/<int:rule_id>", api_views.automation_rule_detail_api, name="wa_rule_detail_api"),
    path("marketing/contacts", api_views.marketing_contacts_api, name="wa_marketing_contacts_api"),
    path("marketing/contacts/import-csv", api_views.marketing_contacts_import_csv_api, name="wa_marketing_contacts_import_csv_api"),
    path("marketing/contacts/opt-out", api_views.marketing_contacts_opt_out_api, name="wa_marketing_contacts_opt_out_api"),
    path("marketing/contacts/<int:contact_id>", api_views.marketing_contact_detail_api, name="wa_marketing_contact_detail_api"),
    path("marketing/campaigns", api_views.marketing_campaigns_api, name="wa_marketing_campaigns_api"),
    path("marketing/campaigns/<int:campaign_id>/retry-failed", api_views.marketing_campaign_retry_failed_api, name="wa_marketing_campaign_retry_failed_api"),
    path("preview-reply", api_views.automation_preview_reply, name="wa_preview_reply_api"),
    path("catalogue/page", api_views.catalogue_page_settings_api, name="wa_catalogue_page_settings_api"),
    path("catalogue/categories", api_views.catalogue_categories_api, name="wa_catalogue_categories_api"),
    path("catalogue/categories/<int:category_id>", api_views.catalogue_category_detail_api, name="wa_catalogue_category_detail_api"),
    path("catalogue/products", api_views.catalogue_products_api, name="wa_catalogue_products_api"),
    path("catalogue/products/<int:product_id>", api_views.catalogue_product_detail_api, name="wa_catalogue_product_detail_api"),
    path("digital-cards", api_views.digital_card_entries_api, name="wa_digital_cards_api"),
    path("digital-cards/visitor-analytics", api_views.digital_card_visitor_analytics_api, name="wa_digital_card_visitor_analytics_api"),
    path("digital-cards/slug-check", api_views.digital_card_slug_check_api, name="wa_digital_card_slug_check_api"),
    path("digital-cards/public/feedback", api_views.public_card_feedback_submit_api, name="wa_public_card_feedback_submit_api"),
    path("digital-cards/public/enquiry", api_views.public_card_enquiry_submit_api, name="wa_public_card_enquiry_submit_api"),
    path("digital-cards/feedback-inbox", api_views.digital_card_feedback_inbox_api, name="wa_digital_card_feedback_inbox_api"),
    path("digital-cards/feedback-inbox/<int:feedback_id>", api_views.digital_card_feedback_detail_api, name="wa_digital_card_feedback_detail_api"),
    path("digital-cards/enquiry-inbox", api_views.digital_card_enquiry_inbox_api, name="wa_digital_card_enquiry_inbox_api"),
    path("digital-cards/enquiry-inbox/<int:enquiry_id>/status", api_views.digital_card_enquiry_status_api, name="wa_digital_card_enquiry_status_api"),
    path("digital-cards/enquiry-inbox/export", api_views.digital_card_enquiry_export_api, name="wa_digital_card_enquiry_export_api"),
    path("digital-cards/<int:card_id>", api_views.digital_card_entry_detail_api, name="wa_digital_card_detail_api"),
]
