from django.urls import path

from . import api_views

urlpatterns = [
    path("folders", api_views.MediaFoldersView.as_view(), name="media_folders"),
    path("objects", api_views.MediaObjectsView.as_view(), name="media_objects"),
    path("object", api_views.MediaObjectDeleteView.as_view(), name="media_object_delete"),
    path("bulk-delete", api_views.MediaBulkDeleteView.as_view(), name="media_bulk_delete"),
    path("signed-url", api_views.MediaSignedUrlView.as_view(), name="media_signed_url"),
]
