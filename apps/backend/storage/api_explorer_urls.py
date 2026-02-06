from django.urls import path

from . import api_explorer_views as explorer


urlpatterns = [
    path("root", explorer.explorer_root, name="storage_explorer_root"),
    path("folder/<uuid:folder_id>", explorer.explorer_folder, name="storage_explorer_folder"),
    path("upload", explorer.explorer_upload, name="storage_explorer_upload"),
    path("files/<uuid:file_id>/download", explorer.explorer_download, name="storage_explorer_download"),
    path("folders/create", explorer.explorer_folder_create, name="storage_explorer_folder_create"),
    path("folders/<uuid:folder_id>/rename", explorer.explorer_folder_rename, name="storage_explorer_folder_rename"),
    path("folders/<uuid:folder_id>/move", explorer.explorer_folder_move, name="storage_explorer_folder_move"),
    path("folders/<uuid:folder_id>/delete", explorer.explorer_folder_delete, name="storage_explorer_folder_delete"),
    path("files/<uuid:file_id>/rename", explorer.explorer_file_rename, name="storage_explorer_file_rename"),
    path("files/<uuid:file_id>/move", explorer.explorer_file_move, name="storage_explorer_file_move"),
    path("files/<uuid:file_id>/delete", explorer.explorer_file_delete, name="storage_explorer_file_delete"),
    path("status", explorer.explorer_status, name="storage_explorer_status"),
    path("search", explorer.explorer_search, name="storage_explorer_search"),
]
