import json
import mimetypes

from django.contrib.auth.decorators import login_required
from django.db import models
from django.http import JsonResponse, FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from .models import (
    StorageFolder,
    StorageFile,
    StorageOrganizationSettings,
    StorageUserSettings,
    StorageGlobalSettings,
    OrgUser,
)
from .storage_backend import (
    build_storage_key,
    storage_save,
    storage_open,
)
from .events import emit_event, soft_delete_folder, hard_delete_file
from .permissions import (
    is_org_admin,
    is_saas_admin,
    resolve_org_for_user,
    resolve_owner_target,
)
from .services import (
    get_active_storage_subscription,
    get_storage_access_state,
    get_org_storage_usage,
    can_store_bytes,
    check_storage_available,
    is_system_sync_enabled,
    apply_bandwidth_usage,
)
from .services_admin import (
    create_org_user,
    set_org_user_active,
    list_org_users,
    set_user_system_sync,
)
from core.models import Device, UserProfile
import secrets
import os
import tempfile
import zipfile
import uuid


def _json_error(message, status=400, extra=None):
    payload = {"detail": message}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _get_org_or_error(request):
    org = resolve_org_for_user(request.user, request=request)
    if not org:
        return None, _json_error("organization_required", status=403)
    return org, None


def _require_active_subscription(org, allow_readonly=False):
    state, sub = get_storage_access_state(org)
    if state == "active":
        return sub, None
    if state == "read_only" and allow_readonly:
        return None, None
    if state == "read_only":
        return None, _json_error("read_only", status=403)
    return None, _json_error("subscription_required", status=403)


def _clean_name(value):
    name = " ".join(str(value or "").strip().split())
    name = name.replace("/", "-").replace("\\", "-")
    return name


def _safe_filename(value, fallback="download"):
    name = _clean_name(value) or fallback
    return name.replace("/", "-").replace("\\", "-")


def _folder_path_map(folders):
    mapping = {}
    for folder in folders:
        mapping[folder.id] = folder

    cache = {}

    def build_path(folder_id):
        if not folder_id:
            return []
        if folder_id in cache:
            return cache[folder_id]
        folder = mapping.get(folder_id)
        if not folder:
            cache[folder_id] = []
            return []
        parts = build_path(folder.parent_id) + [_safe_filename(folder.name)]
        cache[folder_id] = parts
        return parts

    return build_path


def _collect_folder_tree(org, root_folder):
    folder_ids = {root_folder.id}
    queue = [root_folder.id]
    while queue:
        children = list(
            StorageFolder.objects
            .filter(organization=org, parent_id__in=queue, is_deleted=False)
        )
        queue = []
        for child in children:
            if child.id not in folder_ids:
                folder_ids.add(child.id)
                queue.append(child.id)
    return folder_ids


def _ensure_unique_folder_name(org, owner, parent, name):
    exists = StorageFolder.objects.filter(
        organization=org,
        owner=owner,
        parent=parent,
        name=name,
        is_deleted=False,
    ).exists()
    return not exists


def _folder_queryset(org, owner_id=None, allow_all=False):
    qs = StorageFolder.objects.filter(organization=org, is_deleted=False)
    if not allow_all and owner_id:
        qs = qs.filter(owner_id=owner_id)
    return qs


def _file_queryset(org, owner_id=None, allow_all=False):
    qs = StorageFile.objects.filter(organization=org, is_deleted=False)
    if not allow_all and owner_id:
        qs = qs.filter(owner_id=owner_id)
    return qs


def _is_descendant(folder, possible_parent):
    current = possible_parent
    while current:
        if current.id == folder.id:
            return True
        current = current.parent
    return False


@login_required
@require_http_methods(["GET"])
def storage_usage(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org, allow_readonly=True)
    if sub_error:
        return sub_error
    sub = get_active_storage_subscription(org)
    usage = get_org_storage_usage(org)
    return JsonResponse({
        "used_bytes": usage["used_bytes"],
        "limit_bytes": usage["limit_bytes"],
        "remaining_bytes": usage["remaining_bytes"],
        "usage_percent": usage["usage_percent"],
        "plan_storage_gb": usage["plan_storage_gb"],
        "addon_slots": usage["addon_slots"],
        "total_storage_gb": usage["total_storage_gb"],
        "max_users": usage.get("max_users", 0),
        "user_count": usage.get("user_count", 0),
        "suggest_addon": usage["limit_bytes"] and usage["used_bytes"] >= usage["limit_bytes"],
        "subscription_active": bool(sub),
    })


@login_required
@require_http_methods(["GET"])
def org_users_list(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if not is_org_admin(request.user):
        return _json_error("forbidden", status=403)
    rows = list_org_users(org)
    user_ids = [row.user_id for row in rows]
    device_counts = {
        entry["user_id"]: entry["total"]
        for entry in (
            Device.objects
            .filter(org=org, user_id__in=user_ids, is_active=True)
            .values("user_id")
            .annotate(total=models.Count("device_id"))
        )
    }
    profiles = {
        profile.user_id: profile
        for profile in UserProfile.objects.filter(user_id__in=user_ids)
    }
    return JsonResponse({
        "items": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "email": row.user.email or "",
                "username": row.user.username,
                "name": (row.user.first_name or row.user.username),
                "role": (profiles.get(row.user_id).role if profiles.get(row.user_id) else "org_user"),
                "device_count": device_counts.get(row.user_id, 0),
                "is_active": row.is_active,
                "system_sync_enabled": row.system_sync_enabled,
            }
            for row in rows
        ]
    })


@login_required
@require_http_methods(["GET"])
def org_devices_list(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if is_saas_admin(request.user):
        return _json_error("forbidden", status=403)
    qs = Device.objects.filter(org=org, is_active=True)
    if not is_org_admin(request.user):
        qs = qs.filter(user=request.user)
    user_id = request.GET.get("user_id")
    if user_id:
        try:
            user_id_value = int(user_id)
        except (TypeError, ValueError):
            user_id_value = None
        if user_id_value:
            qs = qs.filter(user_id=user_id_value)
    def device_type(value):
        raw = (value or "").lower()
        if "android" in raw or "ios" in raw or "iphone" in raw or "ipad" in raw:
            return "mobile"
        if "windows" in raw:
            return "pc"
        if "darwin" in raw or "mac" in raw or "os x" in raw:
            return "laptop"
        return "device"

    return JsonResponse({
        "items": [
            {
                "device_id": str(device.device_id),
                "user_id": device.user_id,
                "device_name": device.device_name or "",
                "last_seen": device.last_seen.isoformat() if device.last_seen else None,
                "os_info": device.os_info or "",
                "device_type": device_type(device.os_info),
            }
            for device in qs.order_by("-last_seen")
        ]
    })


@login_required
@require_http_methods(["POST"])
def org_users_create(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if not is_org_admin(request.user):
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = (payload.get("name") or payload.get("first_name") or "").strip()
    email = (payload.get("email") or "").strip()
    password = (payload.get("password") or "").strip()
    invite = bool(payload.get("invite"))
    if not email:
        return _json_error("missing_fields", status=400)
    if not password and not invite:
        return _json_error("missing_fields", status=400)
    if not password and invite:
        password = secrets.token_urlsafe(16)
    username = email
    try:
        org_user = create_org_user(
            org=org,
            username=username,
            email=email,
            password=password,
            first_name=name,
            last_name=(payload.get("last_name") or "").strip(),
        )
    except ValueError as exc:
        return _json_error(str(exc), status=409)
    profile = UserProfile.objects.filter(user_id=org_user.user_id).first()
    return JsonResponse({
        "id": org_user.id,
        "user_id": org_user.user_id,
        "email": org_user.user.email or "",
        "username": org_user.user.username,
        "name": (org_user.user.first_name or org_user.user.username),
        "role": profile.role if profile else "org_user",
        "device_count": 0,
        "is_active": org_user.is_active,
        "system_sync_enabled": org_user.system_sync_enabled,
    })


@login_required
@require_http_methods(["POST"])
def org_users_toggle_active(request, user_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if not is_org_admin(request.user):
        return _json_error("forbidden", status=403)
    org_user = get_object_or_404(OrgUser, organization=org, user_id=user_id)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    is_active = payload.get("is_active")
    if is_active is None:
        return _json_error("is_active_required", status=400)
    org_user = set_org_user_active(org_user=org_user, is_active=bool(is_active))
    return JsonResponse({"user_id": org_user.user_id, "is_active": org_user.is_active})


@login_required
@require_http_methods(["POST"])
def org_user_sync_toggle(request, user_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if not is_org_admin(request.user):
        return _json_error("forbidden", status=403)
    org_user = get_object_or_404(OrgUser, organization=org, user_id=user_id)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    enabled = payload.get("system_sync_enabled")
    if enabled is None:
        return _json_error("system_sync_enabled_required", status=400)
    try:
        org_user = set_user_system_sync(org_user=org_user, enabled=bool(enabled))
    except ValueError as exc:
        return _json_error(str(exc), status=409)
    return JsonResponse({
        "user_id": org_user.user_id,
        "system_sync_enabled": org_user.system_sync_enabled,
        "effective_sync_enabled": bool(org_user.system_sync_enabled and is_system_sync_enabled(org)),
    })


@login_required
@require_http_methods(["GET"])
def list_folder(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org, allow_readonly=True)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    owner = resolve_owner_target(request, org, allow_override=allow_all)
    if not owner:
        return _json_error("owner_not_found", status=404)
    parent_id = request.GET.get("parent_id")
    parent = None
    if parent_id:
        parent = get_object_or_404(StorageFolder, id=parent_id, organization=org, is_deleted=False)
        if not allow_all and parent.owner_id != owner.id:
            return _json_error("forbidden", status=403)
    limit = int(request.GET.get("limit") or 50)
    offset = int(request.GET.get("offset") or 0)
    limit = max(1, min(limit, 200))
    folders_qs = (
        _folder_queryset(org, owner_id=owner.id, allow_all=allow_all)
        .filter(parent=parent)
        .order_by("name")
    )
    files_qs = (
        _file_queryset(org, owner_id=owner.id, allow_all=allow_all)
        .filter(folder=parent)
        .order_by("original_filename")
    )
    folders = list(folders_qs[offset:offset + limit])
    files = list(files_qs[offset:offset + limit])
    total_folders = folders_qs.count()
    total_files = files_qs.count()
    return JsonResponse({
        "folder": {
            "id": str(parent.id) if parent else None,
            "name": parent.name if parent else "Root",
        },
        "owner": {
            "id": owner.id,
            "email": owner.email or "",
            "name": owner.first_name or owner.username,
        },
        "folders": [
            {
                "id": str(folder.id),
                "name": folder.name,
                "created_at": folder.created_at.isoformat(),
                "owner_id": folder.owner_id,
            }
            for folder in folders
        ],
        "files": [
            {
                "id": str(item.id),
                "name": item.original_filename,
                "size_bytes": item.size_bytes,
                "content_type": item.content_type,
                "created_at": item.created_at.isoformat(),
                "owner_id": item.owner_id,
            }
            for item in files
        ],
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total_folders": total_folders,
            "total_files": total_files,
        },
    })


@login_required
@require_http_methods(["POST"])
def create_folder(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _json_error("name_required", status=400)
    owner = resolve_owner_target(request, org, allow_override=allow_all)
    if not owner:
        return _json_error("owner_not_found", status=404)
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id:
        parent = get_object_or_404(StorageFolder, id=parent_id, organization=org, is_deleted=False)
        if not allow_all and parent.owner_id != owner.id:
            return _json_error("forbidden", status=403)
    if not _ensure_unique_folder_name(org, owner, parent, name):
        return _json_error("duplicate_folder_name", status=409)
    folder = StorageFolder.objects.create(
        organization=org,
        parent=parent,
        name=name,
        owner=owner,
        created_by=request.user,
    )
    emit_event("folder_created", folder_id=str(folder.id), org_id=org.id, owner_id=owner.id)
    return JsonResponse({
        "id": str(folder.id),
        "name": folder.name,
        "parent_id": str(parent.id) if parent else None,
    })


@login_required
@require_http_methods(["POST"])
def rename_folder(request, folder_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
    if not allow_all and folder.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _json_error("name_required", status=400)
    if not _ensure_unique_folder_name(org, folder.owner, folder.parent, name):
        return _json_error("duplicate_folder_name", status=409)
    folder.name = name
    folder.save(update_fields=["name"])
    return JsonResponse({"id": str(folder.id), "name": folder.name})


@login_required
@require_http_methods(["POST"])
def move_folder(request, folder_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
    if not allow_all and folder.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id:
        parent = get_object_or_404(StorageFolder, id=parent_id, organization=org, is_deleted=False)
        if _is_descendant(folder, parent):
            return _json_error("invalid_parent", status=409)
        if not allow_all and parent.owner_id != folder.owner_id:
            return _json_error("forbidden", status=403)
    folder.parent = parent
    folder.save(update_fields=["parent"])
    return JsonResponse({"id": str(folder.id), "parent_id": str(parent.id) if parent else None})


@login_required
@require_http_methods(["DELETE"])
def delete_folder(request, folder_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
    if not allow_all and folder.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    soft_delete_folder(folder)
    emit_event("folder_deleted", folder_id=str(folder.id), org_id=org.id, owner_id=folder.owner_id)
    return JsonResponse({"deleted": True})


@login_required
@require_http_methods(["POST"])
def upload_file(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    owner = resolve_owner_target(request, org, allow_override=allow_all)
    if not owner:
        return _json_error("owner_not_found", status=404)
    upload = request.FILES.get("file")
    if not upload:
        return _json_error("file_required", status=400)
    folder_id = request.POST.get("folder_id")
    folder = None
    if folder_id:
        folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
        if not allow_all and folder.owner_id != owner.id:
            return _json_error("forbidden", status=403)
    else:
        folder = StorageFolder.objects.filter(organization=org, owner=owner, parent__isnull=True, is_deleted=False).first()
        if not folder:
            folder = StorageFolder.objects.create(
                organization=org,
                parent=None,
                name="Root",
                owner=owner,
                created_by=request.user,
                is_deleted=False,
            )
    allowed, usage = can_store_bytes(org, upload.size or 0)
    if not allowed:
        return _json_error(
            "storage_limit_exceeded",
            status=409,
            extra={
                "used_bytes": usage.get("used_bytes"),
                "limit_bytes": usage.get("limit_bytes"),
                "remaining_bytes": usage.get("remaining_bytes"),
                "suggest_addon": True,
            },
        )
    if not check_storage_available():
        return _json_error("storage_unavailable", status=503)
    name = _clean_name(upload.name or "file")
    storage_key = build_storage_key(org.id, owner.id)
    try:
        storage_save(storage_key, upload)
    except Exception:
        return _json_error("storage_unavailable", status=503)
    item = StorageFile.objects.create(
        organization=org,
        folder=folder,
        owner=owner,
        original_filename=name,
        storage_key=storage_key,
        size_bytes=upload.size or 0,
        content_type=getattr(upload, "content_type", "") or "",
    )
    emit_event("file_uploaded", file_id=str(item.id), org_id=org.id, owner_id=owner.id)
    return JsonResponse({
        "id": str(item.id),
        "name": item.original_filename,
        "size_bytes": item.size_bytes,
    })


@login_required
@require_http_methods(["GET"])
def download_file(request, file_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org, allow_readonly=True)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    item = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
    if not allow_all and item.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    try:
        file_handle = storage_open(item.storage_key, "rb")
    except Exception:
        return _json_error("storage_unavailable", status=503)
    ok, usage = apply_bandwidth_usage(org, item.size_bytes or 0)
    if not ok:
        return _json_error("bandwidth_limit_exceeded", status=409, extra={
            "used_bytes": usage.get("used_bytes"),
            "limit_bytes": usage.get("limit_bytes"),
        })
    content_type, _ = mimetypes.guess_type(item.original_filename or "")
    response = FileResponse(file_handle, content_type=content_type or "application/octet-stream")
    response["Content-Disposition"] = f"attachment; filename=\"{item.original_filename}\""
    return response


@login_required
@require_http_methods(["GET"])
def download_bundle(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    if is_saas_admin(request.user):
        return _json_error("forbidden", status=403)
    _, sub_error = _require_active_subscription(org, allow_readonly=True)
    if sub_error:
        return sub_error

    allow_all = is_org_admin(request.user)
    file_id = request.GET.get("file_id")
    folder_id = request.GET.get("folder_id")
    user_id = request.GET.get("user_id")
    device_id = request.GET.get("device_id")

    owner_id = None
    if device_id:
        try:
            device_uuid = uuid.UUID(str(device_id))
        except (ValueError, TypeError):
            return _json_error("invalid_device_id", status=400)
        device = Device.objects.filter(device_id=device_uuid, org=org).first()
        if not device:
            return _json_error("device_not_found", status=404)
        owner_id = device.user_id
    if user_id:
        try:
            owner_id = int(user_id)
        except (TypeError, ValueError):
            return _json_error("invalid_user_id", status=400)
    if owner_id is not None and not allow_all and owner_id != request.user.id:
        return _json_error("forbidden", status=403)

    if file_id:
        item = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
        if not allow_all and item.owner_id != request.user.id:
            return _json_error("forbidden", status=403)
        return download_file(request, item.id)

    if folder_id:
        folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
        if not allow_all and folder.owner_id != request.user.id:
            return _json_error("forbidden", status=403)
        owner_id = folder.owner_id
        folder_ids = _collect_folder_tree(org, folder)
        files = list(
            StorageFile.objects
            .filter(organization=org, owner_id=owner_id, folder_id__in=folder_ids, is_deleted=False)
            .order_by("created_at")
        )
        root_name = _safe_filename(folder.name, "folder")
    else:
        if owner_id is None:
            owner_id = request.user.id
        files = list(
            StorageFile.objects
            .filter(organization=org, owner_id=owner_id, is_deleted=False)
            .order_by("created_at")
        )
        root_name = _safe_filename(f"user_{owner_id}", "user")

    if not files:
        return _json_error("no_files", status=404)

    total_bytes = sum(int(item.size_bytes or 0) for item in files)
    ok, usage = apply_bandwidth_usage(org, total_bytes)
    if not ok:
        return _json_error("bandwidth_limit_exceeded", status=409, extra={
            "used_bytes": usage.get("used_bytes"),
            "limit_bytes": usage.get("limit_bytes"),
        })

    folder_ids = {item.folder_id for item in files}
    folder_rows = list(
        StorageFolder.objects
        .filter(organization=org, id__in=folder_ids)
        .only("id", "name", "parent_id")
    )
    build_path = _folder_path_map(folder_rows)

    temp_file = tempfile.TemporaryFile()
    with zipfile.ZipFile(temp_file, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for item in files:
            try:
                file_handle = storage_open(item.storage_key, "rb")
            except Exception:
                continue
            parts = build_path(item.folder_id)
            archive_path = os.path.join(root_name, *parts, _safe_filename(item.original_filename, "file"))
            with zipf.open(archive_path, "w") as dest:
                for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
                    dest.write(chunk)
            try:
                file_handle.close()
            except Exception:
                pass

    temp_file.seek(0)
    response = FileResponse(temp_file, content_type="application/zip")
    response["Content-Disposition"] = f"attachment; filename=\"{root_name}.zip\""
    return response


@login_required
@require_http_methods(["POST"])
def rename_file(request, file_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    item = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
    if not allow_all and item.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _json_error("name_required", status=400)
    item.original_filename = name
    item.save(update_fields=["original_filename"])
    return JsonResponse({"id": str(item.id), "name": item.original_filename})


@login_required
@require_http_methods(["POST"])
def move_file(request, file_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    item = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
    if not allow_all and item.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    folder_id = payload.get("folder_id")
    folder = None
    if folder_id:
        folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
        if not allow_all and folder.owner_id != item.owner_id:
            return _json_error("forbidden", status=403)
    item.folder = folder
    item.save(update_fields=["folder"])
    return JsonResponse({"id": str(item.id), "folder_id": str(folder.id) if folder else None})


@login_required
@require_http_methods(["DELETE"])
def delete_file(request, file_id):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    allow_all = is_org_admin(request.user)
    item = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
    if not allow_all and item.owner_id != request.user.id:
        return _json_error("forbidden", status=403)
    hard_delete_file(item.storage_key)
    item.is_deleted = True
    item.save(update_fields=["is_deleted"])
    emit_event("file_deleted", file_id=str(item.id), org_id=org.id, owner_id=item.owner_id)
    return JsonResponse({"deleted": True})


@login_required
@require_http_methods(["GET"])
def sync_settings(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org, allow_readonly=True)
    if sub_error:
        return sub_error
    global_settings = StorageGlobalSettings.get_solo()
    org_settings, _ = StorageOrganizationSettings.objects.get_or_create(organization=org)
    user_settings = StorageUserSettings.objects.filter(organization=org, user=request.user).first()
    return JsonResponse({
        "global_sync_enabled": global_settings.sync_globally_enabled,
        "org_sync_enabled": org_settings.sync_enabled,
        "user_sync_enabled": user_settings.sync_enabled if user_settings else True,
        "effective_sync_enabled": (
            global_settings.sync_globally_enabled
            and org_settings.sync_enabled
            and (user_settings.sync_enabled if user_settings else True)
        ),
        "storage_available": check_storage_available(),
    })


@login_required
@require_http_methods(["POST"])
def update_sync_settings(request):
    org, error = _get_org_or_error(request)
    if error:
        return error
    _, sub_error = _require_active_subscription(org)
    if sub_error:
        return sub_error
    is_admin = is_org_admin(request.user)
    if not is_admin and not is_saas_admin(request.user):
        return _json_error("forbidden", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    global_sync = payload.get("global_sync_enabled")
    org_sync = payload.get("org_sync_enabled")
    user_id = payload.get("user_id")
    user_sync = payload.get("user_sync_enabled")
    if global_sync is not None:
        if not is_saas_admin(request.user):
            return _json_error("forbidden", status=403)
        global_settings = StorageGlobalSettings.get_solo()
        global_settings.sync_globally_enabled = bool(global_sync)
        global_settings.save(update_fields=["sync_globally_enabled", "updated_at"])
    org_settings, _ = StorageOrganizationSettings.objects.get_or_create(organization=org)
    if org_sync is not None:
        if not is_admin:
            return _json_error("forbidden", status=403)
        org_settings.sync_enabled = bool(org_sync)
        org_settings.save(update_fields=["sync_enabled", "updated_at"])
    if user_id:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        target_user = User.objects.filter(id=user_id).first()
        if not target_user:
            return _json_error("user_not_found", status=404)
        user_settings, _ = StorageUserSettings.objects.get_or_create(organization=org, user=target_user)
        if user_sync is not None:
            if not is_admin:
                return _json_error("forbidden", status=403)
            user_settings.sync_enabled = bool(user_sync)
            user_settings.save(update_fields=["sync_enabled", "updated_at"])
    return JsonResponse({"updated": True})
