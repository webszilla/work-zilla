import re

from django import forms
from django.utils.html import strip_tags

from .models import Enquiry
from apps.backend.products.models import Product


MOBILE_RE = re.compile(r"^[0-9+\-\s]{7,20}$")


class EnquiryForm(forms.ModelForm):
    captcha_answer = forms.IntegerField(
        label="Captcha",
        required=True,
        widget=forms.NumberInput(attrs={"class": "form-control", "placeholder": "Answer"}),
    )

    class Meta:
        model = Enquiry
        fields = ("name", "mobile_number", "email", "product", "details")
        widgets = {
            "name": forms.TextInput(attrs={"class": "form-control", "placeholder": "Your name"}),
            "mobile_number": forms.TextInput(attrs={"class": "form-control", "placeholder": "Phone number"}),
            "email": forms.EmailInput(attrs={"class": "form-control", "placeholder": "you@example.com"}),
            "product": forms.Select(attrs={"class": "form-select"}),
            "details": forms.Textarea(attrs={"class": "form-control", "rows": 4, "placeholder": "How can we help?"}),
        }

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop("request", None)
        super().__init__(*args, **kwargs)
        self.fields["product"].queryset = (
            Product.objects
            .filter(is_active=True)
            .exclude(slug="ai-chat-widget")
            .order_by("sort_order", "name")
        )
        self.fields["product"].required = False
        self.fields["details"].required = False

    def clean_mobile_number(self):
        value = (self.cleaned_data.get("mobile_number") or "").strip()
        if not value:
            raise forms.ValidationError("Mobile number is required.")
        if not MOBILE_RE.match(value):
            raise forms.ValidationError("Enter a valid mobile number.")
        return value

    def clean_name(self):
        value = strip_tags((self.cleaned_data.get("name") or "")).strip()
        if not value:
            raise forms.ValidationError("Name is required.")
        return value

    def clean_details(self):
        value = strip_tags((self.cleaned_data.get("details") or "")).strip()
        return value

    def clean_captcha_answer(self):
        value = self.cleaned_data.get("captcha_answer")
        request = self.request
        expected = None
        if request is not None:
            expected = request.session.get("enquiry_captcha_answer") or request.session.get("captcha_answer")
        if expected is None or value != expected:
            raise forms.ValidationError("Captcha answer is incorrect.")
        return value
