from django.db import transaction
from django.shortcuts import get_object_or_404

from .models import StorageFolder, StorageFile
from .services import total_allowed_storage_gb, get_org_bandwidth_status, get_org_storage_usage
from .usage_cache import get_usage_for_org, increment_usage, decrement_usage
from .permissions import resolve_org_for_user, is_org_admin, is_saas_admin
from .storage_backend import build_storage_key, storage_save, storage_open
from .events import emit_event, soft_delete_folder, hard_delete_file


def resolve_context(request):
    org = resolve_org_for_user(request.user, request=request)
    if not org:
        return None
    if is_saas_admin(request.user):
        role = "saas_admin"
    else:
        role = "org_admin" if is_org_admin(request.user) else "org_user"
    return {
        "org": org,
        "user": request.user,
        "role": role,
    }


def get_owner_from_request(request, org, role):
    owner_id = request.GET.get("user_id") or request.POST.get("user_id")
    if role == "org_admin" and owner_id:
        return int(owner_id)
    return request.user.id


def get_root_folder(org, owner_id):
    folder = StorageFolder.objects.filter(
        organization=org,
        owner_id=owner_id,
        parent__isnull=True,
        is_deleted=False,
    ).first()
    if folder:
        return folder
    return StorageFolder.objects.create(
        organization=org,
        owner_id=owner_id,
        parent=None,
        name="Root",
        created_by_id=owner_id,
        is_deleted=False,
    )


def list_folder(org, owner_id, parent_id=None, role="org_user", limit=50, offset=0):
    parent = None
    if parent_id:
        parent = get_object_or_404(StorageFolder, id=parent_id, organization=org, is_deleted=False)
        if role != "org_admin" and parent.owner_id != owner_id:
            raise PermissionError("permission_denied")
    folders_qs = StorageFolder.objects.filter(
        organization=org,
        owner_id=owner_id,
        parent=parent,
        is_deleted=False,
    ).order_by("name")
    files_qs = StorageFile.objects.filter(
        organization=org,
        owner_id=owner_id,
        folder=parent,
        is_deleted=False,
    ).order_by("original_filename")
    total_folders = folders_qs.count()
    total_files = files_qs.count()
    folders = list(folders_qs[offset:offset + limit])
    files = list(files_qs[offset:offset + limit])
    return {
        "parent": parent,
        "folders": folders,
        "files": files,
        "total_folders": total_folders,
        "total_files": total_files,
    }


def ensure_folder_access(org, owner_id, role, folder_id):
    folder = get_object_or_404(StorageFolder, id=folder_id, organization=org, is_deleted=False)
    if role != "org_admin" and folder.owner_id != owner_id:
        raise PermissionError("permission_denied")
    return folder


def ensure_file_access(org, owner_id, role, file_id):
    file = get_object_or_404(StorageFile, id=file_id, organization=org, is_deleted=False)
    if role != "org_admin" and file.owner_id != owner_id:
        raise PermissionError("permission_denied")
    return file


def ensure_unique_folder_name(org, owner_id, parent, name):
    exists = StorageFolder.objects.filter(
        organization=org,
        owner_id=owner_id,
        parent=parent,
        name=name,
        is_deleted=False,
    ).exists()
    return not exists


def upload_file(org, owner_id, folder, upload):
    incoming = int(upload.size or 0)
    with transaction.atomic():
        usage = get_usage_for_org(org, lock=True)
        allowed_bytes = total_allowed_storage_gb(org) * (1024 ** 3)
        if allowed_bytes and (usage.used_storage_bytes + incoming) > allowed_bytes:
            return None, "storage_limit_exceeded", {
                "used_bytes": usage.used_storage_bytes,
                "limit_bytes": allowed_bytes,
            }
        storage_key = build_storage_key(org.id, owner_id)
        storage_save(storage_key, upload)
        item = StorageFile.objects.create(
            organization=org,
            folder=folder,
            owner_id=owner_id,
            original_filename=upload.name or "file",
            storage_key=storage_key,
            size_bytes=incoming,
            content_type=getattr(upload, "content_type", "") or "",
            is_deleted=False,
        )
        increment_usage(org, incoming)
    emit_event("file_uploaded", file_id=str(item.id), org_id=org.id, owner_id=owner_id)
    return item, "", {"used_bytes": usage.used_storage_bytes, "limit_bytes": allowed_bytes}


def rename_file(item, name):
    item.original_filename = name
    item.save(update_fields=["original_filename"])
    return item


def move_file(item, folder):
    item.folder = folder
    item.save(update_fields=["folder"])
    return item


def soft_delete_file(item):
    if item.is_deleted:
        return item
    hard_delete_file(item.storage_key)
    item.is_deleted = True
    item.save(update_fields=["is_deleted"])
    decrement_usage(item.organization, item.size_bytes or 0)
    emit_event("file_deleted", file_id=str(item.id), org_id=item.organization_id, owner_id=item.owner_id)
    return item


def rename_folder(folder, name):
    folder.name = name
    folder.save(update_fields=["name"])
    return folder


def _is_descendant(folder, possible_parent):
    current = possible_parent
    while current:
        if current.id == folder.id:
            return True
        current = current.parent
    return False


def move_folder(folder, parent):
    if parent and _is_descendant(folder, parent):
        raise ValueError("invalid_folder")
    folder.parent = parent
    folder.save(update_fields=["parent"])
    return folder


def delete_folder(folder):
    soft_delete_folder(folder)
    emit_event("folder_deleted", folder_id=str(folder.id), org_id=folder.organization_id, owner_id=folder.owner_id)


def get_storage_status(org):
    usage = get_usage_for_org(org)
    storage_usage = get_org_storage_usage(org)
    total_gb = total_allowed_storage_gb(org)
    used_gb = int((usage.used_storage_bytes or 0) / (1024 ** 3))
    remaining_gb = max(0, total_gb - used_gb)
    bandwidth = get_org_bandwidth_status(org)
    return {
        "total_allowed_storage_gb": total_gb,
        "used_storage_gb": used_gb,
        "remaining_storage_gb": remaining_gb,
        "total_allowed_bandwidth_gb": bandwidth.get("total_allowed_bandwidth_gb", 0),
        "used_bandwidth_gb": bandwidth.get("used_bandwidth_gb", 0),
        "remaining_bandwidth_gb": bandwidth.get("remaining_bandwidth_gb", 0),
        "is_bandwidth_limited": bandwidth.get("is_bandwidth_limited", False),
        "max_users": storage_usage.get("max_users", 0),
        "user_count": storage_usage.get("user_count", 0),
        "addon_slots": storage_usage.get("addon_slots", 0),
    }


def search_files(org, owner_id, role, query, limit=50):
    qs = StorageFile.objects.filter(organization=org, is_deleted=False, original_filename__icontains=query)
    if role != "org_admin":
        qs = qs.filter(owner_id=owner_id)
    qs = qs.select_related("folder")[:limit]
    items = []
    for item in qs:
        path = []
        current = item.folder
        while current:
            path.append({"id": str(current.id), "name": current.name})
            current = current.parent
        items.append({
            "file_id": str(item.id),
            "filename": item.original_filename,
            "folder_path": list(reversed(path)),
            "size": item.size_bytes,
            "created_at": item.created_at.isoformat(),
        })
    return items


def open_file_stream(item):
    return storage_open(item.storage_key, "rb")
