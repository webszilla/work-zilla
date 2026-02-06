from django.urls import path

from . import api_views


urlpatterns = [
    path("usage", api_views.storage_usage, name="storage_usage"),
    path("folders", api_views.list_folder, name="storage_folders"),
    path("folders/create", api_views.create_folder, name="storage_folder_create"),
    path("folders/<uuid:folder_id>/rename", api_views.rename_folder, name="storage_folder_rename"),
    path("folders/<uuid:folder_id>/move", api_views.move_folder, name="storage_folder_move"),
    path("folders/<uuid:folder_id>/delete", api_views.delete_folder, name="storage_folder_delete"),
    path("files/upload", api_views.upload_file, name="storage_file_upload"),
    path("files/<uuid:file_id>/download", api_views.download_file, name="storage_file_download"),
    path("download/", api_views.download_bundle, name="storage_download"),
    path("files/<uuid:file_id>/rename", api_views.rename_file, name="storage_file_rename"),
    path("files/<uuid:file_id>/move", api_views.move_file, name="storage_file_move"),
    path("files/<uuid:file_id>/delete", api_views.delete_file, name="storage_file_delete"),
    path("sync/settings", api_views.sync_settings, name="storage_sync_settings"),
    path("sync/settings/update", api_views.update_sync_settings, name="storage_sync_settings_update"),
    path("org/users", api_views.org_users_list, name="storage_org_users_list"),
    path("org/users/create", api_views.org_users_create, name="storage_org_users_create"),
    path("org/users/<int:user_id>/toggle", api_views.org_users_toggle_active, name="storage_org_users_toggle"),
    path("org/users/<int:user_id>/sync", api_views.org_user_sync_toggle, name="storage_org_user_sync"),
    path("org/devices", api_views.org_devices_list, name="storage_org_devices_list"),
]
