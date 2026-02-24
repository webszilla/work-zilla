from django.urls import path

from . import views

urlpatterns = [
    path("card/<slug:public_slug>/", views.public_digital_card, name="wa_public_card"),
    path("catalogue/<slug:public_slug>/", views.public_catalogue, name="wa_public_catalogue"),
]
