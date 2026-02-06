import uuid
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.db import models
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.device_policy import resolve_org_for_user, get_device_limit_for_org, should_refresh_device_last_seen
from core.models import Device


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    token = get_token(request)
    return Response({"csrfToken": token})


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
                is_admin = user.is_superuser or (profile and profile.role in ("company_admin", "superadmin", "super_admin"))
                if not is_admin:
                    return Response({"error": "device_org_mismatch"}, status=403)
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
    return Response({"ok": True, "device_registered": device_registered, "device_replaced": device_replaced})


@api_view(["POST"])
def api_logout(request):
    logout(request)
    return Response({"ok": True})
