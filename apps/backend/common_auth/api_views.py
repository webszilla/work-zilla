import uuid
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.tokens import default_token_generator
from django.middleware.csrf import get_token
from django.db import models
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.device_policy import resolve_org_for_user, get_device_limit_for_org, should_refresh_device_last_seen
from core.models import Device, UserProfile, Organization as CoreOrganization
from .models import User
from .forms import SignupForm
from .signals import user_registration_success
from core.email_utils import send_templated_email
from core.notification_emails import send_email_verification
from core.session_security import apply_request_session_timeout, log_user_login_activity


@api_view(["GET"])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_token(request):
    token = get_token(request)
    return Response({"csrfToken": token})


def _build_core_company_key(username, user_id):
    raw = str(username or "").strip().lower()
    normalized = "".join(ch if ch.isalnum() else "-" for ch in raw).strip("-")
    if not normalized:
        normalized = "organization"
    normalized = normalized[:70]
    candidate = f"{normalized}-{user_id}"
    suffix = 1
    while CoreOrganization.objects.filter(company_key=candidate).exists():
        candidate = f"{normalized}-{user_id}-{suffix}"
        suffix += 1
    return candidate


def _signup_duplicate_company_response():
    return Response(
        {
            "error": "validation_failed",
            "field_errors": {"company_name": ["An account with this company name already exists."]},
            "non_field_errors": [],
        },
        status=400,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def api_login(request):
    username = request.data.get("username") or request.data.get("email") or ""
    password = request.data.get("password") or ""
    username = username.strip()
    if not username or not password:
        return Response({"error": "username and password are required"}, status=400)

    user = authenticate(request, username=username, password=password)
    if not user:
        user_obj = (
            User.objects.filter(email__iexact=username).first()
            or User.objects.filter(username__iexact=username).first()
        )
        if user_obj:
            user = authenticate(request, username=user_obj.username, password=password)
    if not user:
        return Response({"error": "Invalid credentials"}, status=401)
    if not user.is_active:
        return Response({"error": "Account is disabled"}, status=403)

    device_id = (request.data.get("device_id") or "").strip()
    device_name = (request.data.get("device_name") or "").strip()
    os_info = (request.data.get("os_info") or "").strip()
    app_version = (request.data.get("app_version") or "").strip()
    device_registered = False
    device_replaced = False
    if device_id:
        try:
            device_uuid = uuid.UUID(device_id)
        except (ValueError, TypeError):
            return Response({"error": "invalid_device_id"}, status=400)
        org, profile = resolve_org_for_user(user, request.session.get("active_org_id"))
        if not org:
            return Response({"error": "org_required"}, status=403)
        request.session["active_org_id"] = org.id
        device = Device.objects.filter(device_id=device_uuid).select_related("org", "user").first()
        if device:
            if device.org_id != org.id:
                return Response({"error": "device_org_mismatch"}, status=403)
            if device.user_id != user.id:
                # Same organization login should be able to rebind this device to the current authenticated user.
                device.user = user
            if not device.is_active:
                device.is_active = True
        else:
            limit = get_device_limit_for_org(org)
            active_count = Device.objects.filter(user=user, org=org, is_active=True).count()
            if limit and active_count >= limit:
                cutoff = timezone.now() - timedelta(minutes=5)
                candidate = (
                    Device.objects
                    .filter(user=user, org=org, is_active=True)
                    .exclude(device_id=device_uuid)
                    .filter(models.Q(last_seen__isnull=True) | models.Q(last_seen__lte=cutoff))
                    .order_by("last_seen", "device_id")
                    .first()
                )
                if candidate:
                    candidate.is_active = False
                    candidate.save(update_fields=["is_active"])
                    device_replaced = True
            device = Device(device_id=device_uuid, org=org, user=user)
        device.device_name = device_name or device.device_name
        device.os_info = os_info or device.os_info
        device.app_version = app_version or device.app_version
        now = timezone.now()
        if should_refresh_device_last_seen(device, now):
            device.last_seen = now
        device.is_active = True
        device.save()
        device_registered = True

    login(request, user)
    profile = UserProfile.objects.filter(user=user).select_related("organization").first()
    org_for_security = org if device_id else None
    apply_request_session_timeout(request, org=org_for_security, minutes=None)
    log_user_login_activity(request, user, org=org_for_security, profile=profile)
    return Response({"ok": True, "device_registered": device_registered, "device_replaced": device_replaced})


@api_view(["POST"])
@permission_classes([AllowAny])
def api_signup(request):
    form = SignupForm(request.data)
    if not form.is_valid():
        return Response(
            {
                "error": "validation_failed",
                "field_errors": form.errors,
                "non_field_errors": form.non_field_errors(),
            },
            status=400,
        )

    username = form.cleaned_data["username"]
    first_name = form.cleaned_data["first_name"]
    last_name = form.cleaned_data["last_name"]
    email = form.cleaned_data["email"]
    company_name = form.cleaned_data["company_name"]
    password = form.cleaned_data["password1"]
    phone_number = form.cleaned_data["phone_number"]

    try:
        with transaction.atomic():
            organization = User.organization.field.related_model.objects.create(name=company_name)
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                organization=organization,
            )
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])
            core_org = CoreOrganization.objects.create(
                name=company_name,
                company_key=_build_core_company_key(username, user.id),
                owner=user,
            )
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.phone_number = phone_number
            profile.organization = core_org
            profile.save(update_fields=["phone_number", "organization"])
    except IntegrityError:
        if User.organization.field.related_model.objects.filter(name__iexact=company_name).exists():
            return _signup_duplicate_company_response()
        raise

    send_templated_email(
        user.email,
        "Welcome to Work Zilla",
        "emails/welcome_signup.txt",
        {
            "name": user.first_name or user.username,
            "login_url": request.build_absolute_uri("/auth/login/"),
        },
    )
    verification_sent = send_email_verification(
        user,
        request=request,
        force=True,
        next_path="/pricing/",
    )
    user_registration_success.send(
        sender=api_signup,
        user=user,
        request=request,
        phone_number=phone_number,
    )
    login(request, user)

    return Response(
        {
            "ok": True,
            "authenticated": True,
            "verification_sent": verification_sent,
            "pricing_url": request.build_absolute_uri("/pricing/"),
            "message": "Account created successfully.",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def api_forgot_password(request):
    email = (request.data.get("email") or "").strip()
    if not email:
        return Response({"error": "Email is required."}, status=400)

    user = User.objects.filter(email__iexact=email).first()
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

    return Response({"ok": True, "message": "If this email is registered, a password reset link has been sent."})


@api_view(["POST"])
def api_logout(request):
    logout(request)
    return Response({"ok": True})
