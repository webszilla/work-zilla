from django.urls import path

from . import api_views

urlpatterns = [
    path("request", api_views.backup_request, name="backup_request"),
    path("import", api_views.backup_import, name="backup_import"),
    path("download/<uuid:backup_id>", api_views.backup_download, name="backup_download"),
    path("restore/<uuid:backup_id>", api_views.backup_restore, name="backup_restore"),
    path("list", api_views.backup_list, name="backup_list"),
    path("org-downloads", api_views.OrgDownloadsListView.as_view(), name="org_downloads_list"),
    path("org-admin/generate-backup", api_views.OrgGenerateBackupView.as_view(), name="org_generate_backup"),
    path("org-admin/backups", api_views.OrgAdminBackupAccessView.as_view(), name="org_admin_backups"),
    path("saas-admin/org-downloads", api_views.SaasAdminDownloadListView.as_view(), name="saas_admin_downloads"),
]
