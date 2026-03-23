import random
import hashlib
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.cache import cache
from django.db import transaction
from django.contrib import messages
from django.shortcuts import render, redirect
from django.views.decorators.http import require_http_methods
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils import timezone

from .forms import SignupForm
from .models import Organization, User
from core.models import UserProfile
from core.access_control import get_user_organization
from core.email_utils import send_templated_email
from core.notification_emails import send_email_verification, is_verification_token_valid, mark_email_verified
from core.session_security import apply_request_session_timeout, log_user_login_activity
from .signals import user_registration_success


LOGIN_MAX_FAILED_ATTEMPTS = 4
LOGIN_LOCK_SECONDS = 15 * 60


def _login_attempt_cache_key(identifier: str, ip_address: str) -> str:
    source = f"{(identifier or '').strip().lower()}|{(ip_address or '').strip()}"
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
    return f"auth:login-lock:{digest}"


def _is_login_locked(identifier: str, ip_address: str):
    key = _login_attempt_cache_key(identifier, ip_address)
    state = cache.get(key) or {}
    locked_until = state.get("locked_until")
    if not locked_until:
        return False, 0
    now = timezone.now()
    if locked_until <= now:
        cache.delete(key)
        return False, 0
    remaining_seconds = int((locked_until - now).total_seconds())
    return True, max(1, remaining_seconds)


def _register_login_failure(identifier: str, ip_address: str):
    key = _login_attempt_cache_key(identifier, ip_address)
    state = cache.get(key) or {}
    count = int(state.get("count") or 0) + 1
    if count >= LOGIN_MAX_FAILED_ATTEMPTS:
        locked_until = timezone.now() + timedelta(seconds=LOGIN_LOCK_SECONDS)
        cache.set(
            key,
            {"count": LOGIN_MAX_FAILED_ATTEMPTS, "locked_until": locked_until},
            timeout=LOGIN_LOCK_SECONDS,
        )
        return True
    cache.set(key, {"count": count}, timeout=LOGIN_LOCK_SECONDS)
    return False


def _clear_login_lock(identifier: str, ip_address: str):
    cache.delete(_login_attempt_cache_key(identifier, ip_address))


def _build_signup_captcha(request):
    left = random.randint(1, 9)
    right = random.randint(1, 9)
    answer = left + right
    request.session["signup_captcha_answer"] = str(answer)
    request.session["signup_captcha_question"] = f"{left} + {right}"
    request.session.modified = True
    return request.session["signup_captcha_question"]


def _build_login_captcha(request):
    left = random.randint(1, 9)
    right = random.randint(1, 9)
    answer = left + right
    request.session["login_captcha_answer"] = str(answer)
    request.session["login_captcha_question"] = f"{left} + {right}"
    request.session.modified = True
    return request.session["login_captcha_question"]


@require_http_methods(["GET", "POST"])
def login_view(request):
    next_url = request.GET.get("next") or request.POST.get("next") or "/my-account/"
    if request.method == "GET":
        if request.user.is_authenticated:
            return redirect(next_url)
        captcha_question = _build_login_captcha(request)
        return render(request, "sites/login.html", {"next": next_url, "captcha_question": captcha_question})

    username_or_email = request.POST.get("username") or request.POST.get("email")
    password = request.POST.get("password")
    captcha_answer = str(request.POST.get("captcha_answer") or "").strip()
    expected_captcha = str(request.session.get("login_captcha_answer") or "").strip()
    client_ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")

    if not expected_captcha or captcha_answer != expected_captcha:
        captcha_question = _build_login_captcha(request)
        return render(
            request,
            "sites/login.html",
            {"next": next_url, "error": "Captcha answer is incorrect. Please try again.", "captcha_question": captcha_question},
        )

    if not username_or_email or not password:
        captcha_question = _build_login_captcha(request)
        return render(
            request,
            "sites/login.html",
            {"next": next_url, "error": "Username/Email and password are required", "captcha_question": captcha_question},
        )
    is_locked, remaining_seconds = _is_login_locked(username_or_email, client_ip)
    if is_locked:
        remaining_minutes = max(1, (remaining_seconds + 59) // 60)
        captcha_question = _build_login_captcha(request)
        return render(
            request,
            "sites/login.html",
            {
                "next": next_url,
                "error": f"Too many failed attempts. Please try again after {remaining_minutes} minutes.",
                "captcha_question": captcha_question,
            },
        )
    user = authenticate(request, username=username_or_email, password=password)
    if user is None:
        user_obj = (
            User.objects.filter(email__iexact=username_or_email).first()
            or User.objects.filter(username__iexact=username_or_email).first()
        )
        if user_obj:
            user = authenticate(request, username=user_obj.username, password=password)
    if user is None:
        just_locked = _register_login_failure(username_or_email, client_ip)
        if just_locked:
            error_message = "Too many failed attempts. Please try again after 15 minutes."
        else:
            error_message = "Username or password is incorrect. Please check and try again."
        captcha_question = _build_login_captcha(request)
        return render(
            request,
            "sites/login.html",
            {"next": next_url, "error": error_message, "captcha_question": captcha_question},
        )

    _clear_login_lock(username_or_email, client_ip)
    login(request, user)
    request.session.pop("login_captcha_answer", None)
    request.session.pop("login_captcha_question", None)
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    org_for_security = get_user_organization(user, profile)
    apply_request_session_timeout(request, org=org_for_security)
    log_user_login_activity(request, user, org=org_for_security, profile=profile)
    return redirect(next_url)


@require_http_methods(["GET", "POST"])
def logout_view(request):
    logout(request)
    return redirect("/")


@require_http_methods(["GET", "POST"])
def signup_view(request):
    if request.method == "GET":
        captcha_question = _build_signup_captcha(request)
        return render(request, "sites/signup.html", {"captcha_question": captcha_question})

    form = SignupForm(request.POST)
    expected_answer = str(request.session.get("signup_captcha_answer") or "").strip()
    entered_answer = str(request.POST.get("captcha_answer") or "").strip()
    captcha_valid = bool(expected_answer and entered_answer and entered_answer == expected_answer)

    if not captcha_valid:
        form.add_error(None, "Captcha answer is incorrect. Please try again.")

    if not form.is_valid() or not captcha_valid:
        captcha_question = _build_signup_captcha(request)
        return render(request, "sites/signup.html", {"form": form, "captcha_question": captcha_question})

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
    transaction.on_commit(
        lambda: user_registration_success.send(
            sender=signup_view,
            user=user,
            request=request,
            phone_number=phone_number,
        )
    )
    login(request, user)
    request.session.pop("signup_captcha_answer", None)
    request.session.pop("signup_captcha_question", None)
    return redirect("/pricing/")


@require_http_methods(["GET", "POST"])
def forgot_password_view(request):
    if request.method == "GET":
        return render(request, "sites/forgot_password.html")

    email = (request.POST.get("email") or "").strip()
    if not email:
        return render(
            request,
            "sites/forgot_password.html",
            {"error": "Email is required."},
        )

    user = User.objects.filter(email__iexact=email).first()
    # Keep response generic for unknown emails as well.
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_path = f"/auth/reset-password/{uid}/{token}/"
        reset_url = request.build_absolute_uri(reset_path)
        send_templated_email(
            user.email,
            "Reset your Work Zilla password",
            "emails/password_reset_link.txt",
            {
                "name": user.first_name or user.username,
                "reset_url": reset_url,
                "support_email": "support@getworkzilla.com",
            },
        )

    return render(
        request,
        "sites/forgot_password.html",
        {
            "success": "If this email is registered, a password reset link has been sent.",
            "submitted_email": email,
        },
    )


@require_http_methods(["GET", "POST"])
def reset_password_view(request, uidb64, token):
    user = None
    token_valid = False
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.filter(pk=uid).first()
        token_valid = bool(user and default_token_generator.check_token(user, token))
    except Exception:
        token_valid = False
        user = None

    if request.method == "GET":
        return render(
            request,
            "sites/reset_password.html",
            {"token_valid": token_valid},
        )

    if not token_valid or not user:
        return render(
            request,
            "sites/reset_password.html",
            {"token_valid": False, "error": "This password reset link is invalid or expired."},
        )

    password1 = request.POST.get("password1") or ""
    password2 = request.POST.get("password2") or ""

    if not password1 or not password2:
        return render(
            request,
            "sites/reset_password.html",
            {"token_valid": True, "error": "Both password fields are required."},
        )
    if password1 != password2:
        return render(
            request,
            "sites/reset_password.html",
            {"token_valid": True, "error": "Passwords do not match."},
        )

    try:
        validate_password(password1, user=user)
    except ValidationError as exc:
        return render(
            request,
            "sites/reset_password.html",
            {"token_valid": True, "error": " ".join([str(m) for m in exc.messages])},
        )

    user.set_password(password1)
    user.save(update_fields=["password"])
    messages.success(request, "Password reset successful. Please login with your new password.")
    return redirect("/auth/login/")


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
