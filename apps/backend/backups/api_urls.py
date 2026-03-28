from django.urls import path

from . import api_views

urlpatterns = [
    path("request", api_views.backup_request, name="backup_request"),
    path("download/<uuid:backup_id>", api_views.backup_download, name="backup_download"),
    path("restore/<uuid:backup_id>", api_views.backup_restore, name="backup_restore"),
    path("restore-upload", api_views.backup_restore_upload, name="backup_restore_upload"),
    path("list", api_views.backup_list, name="backup_list"),
    path("google-drive/settings", api_views.org_google_backup_settings, name="org_google_backup_settings"),
    path("google-drive/auth-start", api_views.org_google_backup_auth_start, name="org_google_backup_auth_start"),
    path("google-drive/callback", api_views.org_google_backup_auth_callback, name="org_google_backup_auth_callback"),
    path("google-drive/disconnect", api_views.org_google_backup_disconnect, name="org_google_backup_disconnect"),
    path("google-drive/run", api_views.org_google_backup_run, name="org_google_backup_run"),
    path("org-downloads", api_views.OrgDownloadsListView.as_view(), name="org_downloads_list"),
    path("org-admin/generate-backup", api_views.OrgGenerateBackupView.as_view(), name="org_generate_backup"),
    path("org-admin/backups", api_views.OrgAdminBackupAccessView.as_view(), name="org_admin_backups"),
    path("saas-admin/org-downloads", api_views.SaasAdminDownloadListView.as_view(), name="saas_admin_downloads"),
]
