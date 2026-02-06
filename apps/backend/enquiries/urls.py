from django.urls import path

from .views import submit_enquiry

urlpatterns = [
    path("submit/", submit_enquiry, name="enquiry_submit"),
]
