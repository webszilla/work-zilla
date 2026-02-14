from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, FileResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import os
import tempfile
import zipfile

from .services_explorer import (
    resolve_context,
    get_owner_from_request,
    get_root_folder,
    list_folder,
    ensure_folder_access,
    ensure_file_access,
    ensure_unique_folder_name,
    upload_file,
    rename_file,
    move_file,
    soft_delete_file,
    rename_folder,
    move_folder,
    delete_folder,
    get_storage_status,
    search_files,
    open_file_stream,
)
from .models import StorageFolder, StorageFile
from .models import StorageGlobalSettings
from .security import rate_limit, get_storage_security_settings, validate_upload
from .events import emit_security_event
from .services import get_storage_access_state, apply_bandwidth_usage


def _error(code, status=400, extra=None):
    payload = {"error": code}
    if extra:
        payload.update(extra)
    return JsonResponse(payload, status=status)


def _clean_name(value):
    name = " ".join(str(value or "").strip().split())
    name = name.replace("/", "-").replace("\\", "-")
    return name


def _safe_filename(value, fallback="download"):
    base = _clean_name(value) or fallback
    return base.replace("..", ".")


def _collect_folder_tree(org, owner_id, roots):
    folder_ids = {folder.id for folder in roots}
    queue = list(folder_ids)
    while queue:
        parent_id = queue.pop(0)
        children = list(
            StorageFolder.objects.filter(
                organization=org,
                owner_id=owner_id,
                parent_id=parent_id,
                is_deleted=False,
            ).only("id")
        )
        for child in children:
            if child.id in folder_ids:
                continue
            folder_ids.add(child.id)
            queue.append(child.id)
    return folder_ids


@login_required
@require_http_methods(["GET"])
def explorer_root(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    root = get_root_folder(org, owner_id)
    data = list_folder(org, owner_id, parent_id=root.id, role=ctx["role"], limit=int(request.GET.get("limit") or 50), offset=int(request.GET.get("offset") or 0))
    return JsonResponse({
        "folder_id": str(root.id),
        "owner_id": owner_id,
        "items": [
            {"id": str(f.id), "name": f.name, "type": "folder", "created_at": f.created_at.isoformat()}
            for f in data["folders"]
        ] + [
            {"id": str(f.id), "name": f.original_filename, "type": "file", "size": f.size_bytes, "created_at": f.created_at.isoformat()}
            for f in data["files"]
        ],
        "pagination": {
            "limit": int(request.GET.get("limit") or 50),
            "offset": int(request.GET.get("offset") or 0),
            "total_folders": data["total_folders"],
            "total_files": data["total_files"],
        },
    })


@login_required
@require_http_methods(["GET"])
def explorer_folder(request, folder_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        ensure_folder_access(org, owner_id, ctx["role"], folder_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    data = list_folder(org, owner_id, parent_id=folder_id, role=ctx["role"], limit=int(request.GET.get("limit") or 50), offset=int(request.GET.get("offset") or 0))
    return JsonResponse({
        "folder_id": str(folder_id),
        "owner_id": owner_id,
        "items": [
            {"id": str(f.id), "name": f.name, "type": "folder", "created_at": f.created_at.isoformat()}
            for f in data["folders"]
        ] + [
            {"id": str(f.id), "name": f.original_filename, "type": "file", "size": f.size_bytes, "created_at": f.created_at.isoformat()}
            for f in data["files"]
        ],
        "pagination": {
            "limit": int(request.GET.get("limit") or 50),
            "offset": int(request.GET.get("offset") or 0),
            "total_folders": data["total_folders"],
            "total_files": data["total_files"],
        },
    })


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_upload(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    settings_obj = StorageGlobalSettings.get_solo()
    if not settings_obj.uploads_globally_enabled or settings_obj.read_only_globally_enabled:
        emit_security_event("uploads_disabled", org_id=org.id, user_id=request.user.id, request=request)
        return _error("uploads_disabled", status=403)
    sec = get_storage_security_settings()
    if rate_limit(f"upload:user:{request.user.id}", sec["rate_limit_user_per_min"], 60):
        return _error("rate_limited", status=429)
    if rate_limit(f"upload:org:{org.id}", sec["rate_limit_org_per_min"], 60):
        return _error("rate_limited", status=429)
    folder_id = request.POST.get("folder_id")
    upload = request.FILES.get("file")
    if not upload:
        return _error("file_required", status=400)
    validation_error = validate_upload(upload, sec)
    if validation_error:
        emit_security_event(validation_error, org_id=org.id, user_id=request.user.id, request=request)
        return _error(validation_error, status=400)
    folder = None
    if folder_id:
        try:
            folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
        except PermissionError:
            return _error("permission_denied", status=403)
    else:
        folder = get_root_folder(org, owner_id)
    item, error, usage = upload_file(org, owner_id, folder, upload)
    if error == "storage_limit_exceeded":
        emit_security_event("storage_limit_exceeded", org_id=org.id, user_id=request.user.id, request=request)
        return _error("storage_limit_exceeded", status=409, extra={
            "used_bytes": usage.get("used_bytes"),
            "limit_bytes": usage.get("limit_bytes"),
        })
    if error:
        return _error(error, status=400)
    return JsonResponse({
        "file_id": str(item.id),
        "filename": item.original_filename,
        "size": item.size_bytes,
        "folder_id": str(folder.id) if folder else None,
    })


@login_required
@require_http_methods(["GET"])
def explorer_download(request, file_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        item = ensure_file_access(org, owner_id, ctx["role"], file_id)
    except PermissionError:
        emit_security_event("permission_denied", org_id=org.id, user_id=request.user.id, request=request)
        return _error("permission_denied", status=403)
    try:
        handle = open_file_stream(item)
    except Exception:
        return _error("storage_unavailable", status=503)
    ok, usage = apply_bandwidth_usage(org, item.size_bytes or 0)
    if not ok:
        emit_security_event("bandwidth_limit_exceeded", org_id=org.id, user_id=request.user.id, request=request)
        return _error("bandwidth_limit_exceeded", status=409, extra={
            "used_bytes": usage.get("used_bytes"),
            "limit_bytes": usage.get("limit_bytes"),
        })
    emit_security_event("file_download", org_id=org.id, user_id=request.user.id, request=request, file_id=str(item.id))
    response = FileResponse(handle, content_type=item.content_type or "application/octet-stream")
    response["Content-Disposition"] = f"attachment; filename=\"{item.original_filename}\""
    return response


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_bulk_download(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}

    file_ids = payload.get("file_ids") or []
    folder_ids = payload.get("folder_ids") or []
    if not isinstance(file_ids, list) or not isinstance(folder_ids, list):
        return _error("invalid_selection", status=400)
    if not file_ids and not folder_ids:
        return _error("no_selection", status=400)

    files = []
    seen_file_ids = set()
    for file_id in file_ids:
        try:
            item = ensure_file_access(org, owner_id, ctx["role"], file_id)
        except PermissionError:
            return _error("permission_denied", status=403)
        if item.id in seen_file_ids:
            continue
        seen_file_ids.add(item.id)
        files.append(item)

    folders = []
    for folder_id in folder_ids:
        try:
            folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
        except PermissionError:
            return _error("permission_denied", status=403)
        folders.append(folder)

    if folders:
        tree_ids = _collect_folder_tree(org, owner_id, folders)
        folder_files = list(
            StorageFile.objects.filter(
                organization=org,
                owner_id=owner_id,
                folder_id__in=tree_ids,
                is_deleted=False,
            ).order_by("created_at")
        )
        for item in folder_files:
            if item.id in seen_file_ids:
                continue
            seen_file_ids.add(item.id)
            files.append(item)

    if not files:
        return _error("no_files", status=404)

    total_bytes = sum(int(item.size_bytes or 0) for item in files)
    ok, usage = apply_bandwidth_usage(org, total_bytes)
    if not ok:
        return _error("bandwidth_limit_exceeded", status=409, extra={
            "used_bytes": usage.get("used_bytes"),
            "limit_bytes": usage.get("limit_bytes"),
        })

    folder_rows = list(
        StorageFolder.objects.filter(
            organization=org,
            owner_id=owner_id,
            id__in={item.folder_id for item in files if item.folder_id},
        ).only("id", "name", "parent_id")
    )
    folder_map = {row.id: row for row in folder_rows}

    def build_path(folder_id):
        parts = []
        current = folder_map.get(folder_id)
        while current:
            parts.append(_safe_filename(current.name, "folder"))
            current = folder_map.get(current.parent_id)
        parts.reverse()
        return parts

    temp_file = tempfile.TemporaryFile()
    with zipfile.ZipFile(temp_file, "w", compression=zipfile.ZIP_DEFLATED) as zipf:
        for item in files:
            try:
                file_handle = open_file_stream(item)
            except Exception:
                continue
            archive_path = os.path.join(
                "selection",
                *build_path(item.folder_id),
                _safe_filename(item.original_filename, "file")
            )
            with zipf.open(archive_path, "w") as dest:
                for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
                    dest.write(chunk)
            try:
                file_handle.close()
            except Exception:
                pass

    temp_file.seek(0)
    response = FileResponse(temp_file, content_type="application/zip")
    response["Content-Disposition"] = "attachment; filename=\"selection.zip\""
    return response


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_folder_create(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _error("invalid_folder", status=400)
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id:
        try:
            parent = ensure_folder_access(org, owner_id, ctx["role"], parent_id)
        except PermissionError:
            return _error("permission_denied", status=403)
    if not ensure_unique_folder_name(org, owner_id, parent, name):
        return _error("duplicate_folder", status=409)
    folder = StorageFolder.objects.create(
        organization=org,
        owner_id=owner_id,
        parent=parent,
        name=name,
        created_by=request.user,
        is_deleted=False,
    )
    return JsonResponse({"id": str(folder.id), "name": folder.name, "parent_id": str(parent.id) if parent else None})


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_folder_rename(request, folder_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _error("invalid_folder", status=400)
    if not ensure_unique_folder_name(org, owner_id, folder.parent, name):
        return _error("duplicate_folder", status=409)
    rename_folder(folder, name)
    return JsonResponse({"id": str(folder.id), "name": folder.name})


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_folder_move(request, folder_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id:
        try:
            parent = ensure_folder_access(org, owner_id, ctx["role"], parent_id)
        except PermissionError:
            return _error("permission_denied", status=403)
    try:
        move_folder(folder, parent)
    except ValueError:
        return _error("invalid_folder", status=409)
    return JsonResponse({"id": str(folder.id), "parent_id": str(parent.id) if parent else None})


@csrf_exempt
@login_required
@require_http_methods(["DELETE"])
def explorer_folder_delete(request, folder_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    delete_folder(folder)
    return JsonResponse({"deleted": True})


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_file_rename(request, file_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        item = ensure_file_access(org, owner_id, ctx["role"], file_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    name = _clean_name(payload.get("name"))
    if not name:
        return _error("file_not_found", status=400)
    rename_file(item, name)
    return JsonResponse({"id": str(item.id), "name": item.original_filename})


@csrf_exempt
@login_required
@require_http_methods(["POST"])
def explorer_file_move(request, file_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        item = ensure_file_access(org, owner_id, ctx["role"], file_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        payload = {}
    folder_id = payload.get("folder_id")
    folder = None
    if folder_id:
        try:
            folder = ensure_folder_access(org, owner_id, ctx["role"], folder_id)
        except PermissionError:
            return _error("permission_denied", status=403)
    move_file(item, folder)
    return JsonResponse({"id": str(item.id), "folder_id": str(folder.id) if folder else None})


@csrf_exempt
@login_required
@require_http_methods(["DELETE"])
def explorer_file_delete(request, file_id):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state != "active":
        return _error("read_only", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    try:
        item = ensure_file_access(org, owner_id, ctx["role"], file_id)
    except PermissionError:
        return _error("permission_denied", status=403)
    soft_delete_file(item)
    return JsonResponse({"deleted": True})


@login_required
@require_http_methods(["GET"])
def explorer_status(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    return JsonResponse(get_storage_status(org))


@login_required
@require_http_methods(["GET"])
def explorer_search(request):
    ctx = resolve_context(request)
    if not ctx:
        return _error("permission_denied", status=403)
    if ctx["role"] == "saas_admin":
        emit_security_event("permission_denied", request=request)
        return _error("permission_denied", status=403)
    org = ctx["org"]
    access_state, _ = get_storage_access_state(org)
    if access_state == "none":
        return _error("subscription_required", status=403)
    owner_id = get_owner_from_request(request, org, ctx["role"])
    query = (request.GET.get("q") or "").strip()
    if not query:
        return JsonResponse({"items": [], "limit": int(request.GET.get("limit") or 50)})
    limit = int(request.GET.get("limit") or 50)
    items = search_files(org, owner_id, ctx["role"], query, limit=limit)
    return JsonResponse({"items": items, "limit": limit})
