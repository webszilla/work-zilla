from django.urls import path

from . import views


urlpatterns = [
    path("<slug:slug>/", views.product_marketing_view, name="product-page"),
]
