from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.contrib import messages
from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods

from .forms import SignupForm
from .models import Organization, User
from core.models import UserProfile
from core.email_utils import send_templated_email
from core.notification_emails import send_email_verification, is_verification_token_valid, mark_email_verified


@require_http_methods(["GET", "POST"])
def login_view(request):
    next_url = request.GET.get("next") or request.POST.get("next") or "/my-account/"
    if request.method == "GET":
        if request.user.is_authenticated:
            return redirect(next_url)
        return render(request, "sites/login.html", {"next": next_url})

    username_or_email = request.POST.get("email") or request.POST.get("username")
    password = request.POST.get("password")
    if not username_or_email or not password:
        return render(
            request,
            "sites/login.html",
            {"next": next_url, "error": "Email and password are required"},
        )
    user = authenticate(request, username=username_or_email, password=password)
    if user is None:
        user_obj = User.objects.filter(email__iexact=username_or_email).first()
        if user_obj:
            user = authenticate(request, username=user_obj.username, password=password)
    if user is None:
        return render(
            request,
            "sites/login.html",
            {"next": next_url, "error": "Username or password is incorrect. Please check and try again."},
        )

    login(request, user)
    return redirect(next_url)


@require_http_methods(["GET", "POST"])
def logout_view(request):
    logout(request)
    return redirect("/")


@require_http_methods(["GET", "POST"])
def signup_view(request):
    if request.method == "GET":
        return render(request, "sites/signup.html")

    form = SignupForm(request.POST)
    if not form.is_valid():
        return render(request, "sites/signup.html", {"form": form})

    username = form.cleaned_data["username"]
    first_name = form.cleaned_data["first_name"]
    last_name = form.cleaned_data["last_name"]
    email = form.cleaned_data["email"]
    company_name = form.cleaned_data["company_name"]
    password = form.cleaned_data["password1"]
    phone_number = form.cleaned_data["phone_number"]

    with transaction.atomic():
        organization = Organization.objects.create(name=company_name)
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            organization=organization,
        )
        user.first_name = first_name
        user.last_name = last_name
        user.save(update_fields=["first_name", "last_name"])
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.phone_number = phone_number
        profile.save(update_fields=["phone_number"])
    send_templated_email(
        user.email,
        "Welcome to Work Zilla",
        "emails/welcome_signup.txt",
        {
            "name": user.first_name or user.username,
            "login_url": request.build_absolute_uri("/auth/login/"),
        },
    )
    send_email_verification(user, request=request, force=True)
    login(request, user)
    return redirect("/my-account/")


@require_http_methods(["GET", "POST"])
def agent_login_view(request):
    return render(request, "sites/agent_login.html")


@require_http_methods(["GET"])
def verify_email_view(request, user_id, token):
    user = User.objects.filter(id=user_id).first()
    if not user or not is_verification_token_valid(user, token):
        messages.error(request, "Invalid or expired verification link. Please request a new one.")
        return redirect("/my-account/")
    mark_email_verified(user)
    messages.success(request, f"Email verified successfully: {user.email}")
    return redirect("/my-account/")
