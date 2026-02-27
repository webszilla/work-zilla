from django.urls import path

from . import api_views


urlpatterns = [
    path("license/validate", api_views.license_validate, name="imposition_license_validate"),
    path("device/register", api_views.device_register, name="imposition_device_register"),
    path("device/check", api_views.device_check, name="imposition_device_check"),
    path("device/heartbeat", api_views.device_heartbeat, name="imposition_device_heartbeat"),
    path("policy", api_views.policy, name="imposition_policy"),
    path("jobs", api_views.imposition_jobs, name="imposition_jobs"),
    path("templates", api_views.imposition_templates, name="imposition_templates"),
    path("data/import", api_views.data_import, name="imposition_data_import"),
    path("qr-barcode/generate", api_views.qr_barcode_generate, name="imposition_qr_barcode_generate"),
    path("bulk-import/upload", api_views.bulk_import_upload, name="imposition_bulk_import_upload"),
    path("bulk-layout/generate", api_views.bulk_layout_generate, name="imposition_bulk_layout_generate"),
    path("bulk-export", api_views.bulk_export, name="imposition_bulk_export"),
]
