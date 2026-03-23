from django.urls import path

from . import views


urlpatterns = [
    path("", views.products_index_redirect, name="products-index"),
    path("<slug:slug>/", views.product_marketing_view, name="product-page"),
]
