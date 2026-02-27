from django.urls import path

from . import api_views


urlpatterns = [
    path("license", api_views.product_license, name="product_license"),
    path("devices", api_views.product_devices, name="product_devices"),
    path("users", api_views.product_users, name="product_users"),
    path("billing", api_views.product_billing, name="product_billing"),
    path("plan", api_views.product_plan, name="product_plan"),
    path("activity", api_views.product_activity, name="product_activity"),
    path("addons/purchase", api_views.product_addon_purchase, name="product_addon_purchase"),
    path("qr-barcode/generate", api_views.qr_barcode_generate, name="product_qr_barcode_generate"),
    path("bulk-import/upload", api_views.bulk_import_upload, name="product_bulk_import_upload"),
    path("bulk-layout/generate", api_views.bulk_layout_generate, name="product_bulk_layout_generate"),
    path("bulk-export", api_views.bulk_export, name="product_bulk_export"),
]
