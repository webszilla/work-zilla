import re

from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import User


class EmailAuthenticationForm(AuthenticationForm):
    username = forms.CharField(label="Email")


class SignupForm(forms.Form):
    first_name = forms.CharField(label="First name", max_length=150)
    last_name = forms.CharField(label="Last name", max_length=150)
    username = forms.CharField(label="Username", max_length=150)
    email = forms.EmailField(label="Email")
    company_name = forms.CharField(label="Company", max_length=200)
    phone_number = forms.CharField(label="Phone number", max_length=30)
    password1 = forms.CharField(label="Password", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Confirm password", widget=forms.PasswordInput)

    def clean_username(self) -> str:
        username = self.cleaned_data["username"].strip()
        if len(username) < 5:
            raise ValidationError("Username must be at least 5 characters.")
        if not re.match(r"^[A-Za-z0-9_.-]+$", username):
            raise ValidationError("Username can contain only letters, numbers, dot, underscore, and hyphen.")
        if User.objects.filter(username__iexact=username).exists():
            raise ValidationError("This username is already taken.")
        return username

    def clean_email(self) -> str:
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(email=email).exists():
            raise ValidationError("An account with this email already exists.")
        return email

    def clean_phone_number(self) -> str:
        phone_number = self.cleaned_data["phone_number"].strip()
        digits = re.sub(r"\D+", "", phone_number)
        if not digits:
            raise ValidationError("Mobile number is required.")
        if len(digits) < 6 or len(digits) > 15:
            raise ValidationError("Enter a valid mobile number.")
        return phone_number

    def clean_password1(self) -> str:
        password = self.cleaned_data["password1"]
        validate_password(password)
        score = 0
        if len(password) >= 8:
            score += 1
        if re.search(r"[A-Z]", password):
            score += 1
        if re.search(r"[a-z]", password):
            score += 1
        if re.search(r"[0-9]", password):
            score += 1
        if re.search(r"[^A-Za-z0-9]", password):
            score += 1
        if score < 4:
            raise ValidationError(
                "Use a strong password with at least 8 characters including uppercase, lowercase, number, and symbol."
            )
        return password

    def clean(self) -> dict:
        cleaned = super().clean()
        password1 = cleaned.get("password1")
        password2 = cleaned.get("password2")
        if password1 and password2 and password1 != password2:
            raise ValidationError("Passwords do not match.")
        return cleaned
