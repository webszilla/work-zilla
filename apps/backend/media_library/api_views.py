import json
from datetime import datetime

from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.db.models import Sum, Max
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from core.models import Organization
from .models import MediaLibraryActionLog
from .permissions import is_saas_admin, is_org_admin, get_profile
from .services import get_storage_context, list_folders, list_objects, delete_objects, generate_signed_url, get_object_size
from apps.backend.storage.services import apply_bandwidth_usage
from apps.backend.storage.models import StorageFolder, StorageFile


CATEGORIES = [
    {"key": "screenshots", "label": "Screenshots"},
    {"key": "ai_media_library", "label": "AI Media Library"},
    {"key": "payments", "label": "Payments"},
]
ONLINE_STORAGE_CATEGORY = {"key": "online_storage", "label": "Online Storage"}


IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"}
DOC_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "json", "zip", "rar"}


def _get_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _log_action(request, action, object_key="", org=None):
    profile = get_profile(request.user)
    role = profile.role if profile else ""
    MediaLibraryActionLog.objects.create(
        actor_user=request.user,
        actor_role=role,
        organization=org,
        action=action,
        object_key=object_key,
        ip=_get_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT") or "")[:1000],
    )


def _get_org_for_request(request, allow_none=False):
    org_id = request.GET.get("org_id") or request.data.get("org_id") if hasattr(request, "data") else None
    if not org_id:
        return None if allow_none else None
    try:
        return Organization.objects.filter(id=int(org_id)).first()
    except (TypeError, ValueError):
        return None


def _get_allowed_context(request):
    category = (request.GET.get("category") or request.data.get("category") if hasattr(request, "data") else None)
    profile = get_profile(request.user)
    if is_saas_admin(request.user, profile=profile):
        org = _get_org_for_request(request, allow_none=True)
        context = get_storage_context(org_id=org.id if org else None, category=category)
        return context, org, "saas_admin", category
    if is_org_admin(request.user, profile=profile):
        org = profile.organization
        context = get_storage_context(org_id=org.id, category=category)
        return context, org, "org_admin", category
    return None, None, None, None


def _ensure_prefix_allowed(key, allowed_prefix):
    if not allowed_prefix:
        return True
    return key.startswith(allowed_prefix)


def _filter_type(items, filter_type):
    if filter_type == "images":
        return [item for item in items if item.get("filename", "").split(".")[-1].lower() in IMAGE_EXTS]
    if filter_type == "documents":
        return [item for item in items if item.get("filename", "").split(".")[-1].lower() in DOC_EXTS]
    return items


def _filter_search(items, query):
    if not query:
        return items
    needle = query.lower()
    return [item for item in items if needle in item.get("filename", "").lower() or needle in item.get("key", "").lower()]


def _safe_org_label(org):
    name = str(getattr(org, "name", "") or "").strip()
    if not name:
        name = "org"
    clean = "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")
    clean = "-".join(part for part in clean.split("-") if part)
    if not clean:
        clean = "org"
    return f"{clean}-{org.id}"


def _online_storage_categories_for_role(role):
    if role == "saas_admin":
        return CATEGORIES + [ONLINE_STORAGE_CATEGORY]
    return CATEGORIES


def _online_storage_org_folders():
    org_ids = (
        StorageFolder.objects
        .filter(is_deleted=False)
        .values_list("organization_id", flat=True)
        .distinct()
    )
    org_map = {org.id: org for org in Organization.objects.filter(id__in=list(org_ids))}
    folders = []
    for org_id in sorted(org_map.keys()):
        org = org_map[org_id]
        folders.append(
            {
                "name": f"{org.name} ({org.id})",
                "prefix": f"online-storage-org:{org.id}",
            }
        )
    return folders


def _folder_descendant_ids(org_id, owner_id, root_folder_id):
    seen = {root_folder_id}
    queue = [root_folder_id]
    while queue:
        chunk = queue[:200]
        queue = queue[200:]
        children = (
            StorageFolder.objects
            .filter(
                organization_id=org_id,
                owner_id=owner_id,
                is_deleted=False,
                parent_id__in=chunk,
            )
            .values_list("id", flat=True)
        )
        for child_id in children:
            if child_id in seen:
                continue
            seen.add(child_id)
            queue.append(child_id)
    return list(seen)


def _list_online_storage_root_folders(org_id, limit=25, continuation_token=None):
    try:
        org_id = int(org_id)
    except (TypeError, ValueError):
        return {"items": [], "is_truncated": False, "next_token": None}

    org = Organization.objects.filter(id=org_id).first()
    if not org:
        return {"items": [], "is_truncated": False, "next_token": None}

    roots = list(
        StorageFolder.objects
        .filter(
            organization_id=org_id,
            parent__isnull=True,
            is_deleted=False,
        )
        .only("id", "owner_id")
        .order_by("owner_id", "id")
    )

    rows = []
    for root in roots:
        children = list(
            StorageFolder.objects
            .filter(
                organization_id=org_id,
                owner_id=root.owner_id,
                parent_id=root.id,
                is_deleted=False,
            )
            .only("id", "name")
            .order_by("name")
        )

        if not children:
            direct_qs = StorageFile.objects.filter(
                organization_id=org_id,
                owner_id=root.owner_id,
                folder_id=root.id,
                is_deleted=False,
            )
            direct_size = int(direct_qs.aggregate(total=Sum("size_bytes")).get("total") or 0)
            direct_last = direct_qs.aggregate(last=Max("created_at")).get("last")
            if direct_size > 0:
                rows.append(
                    {
                        "key": f"media-storage/{_safe_org_label(org)}/media-storage/sync/",
                        "filename": "sync",
                        "size": direct_size,
                        "last_modified": direct_last,
                        "content_type_guess": "folder",
                        "storage_class": "",
                        "folder_prefix": f"online-storage-folder:{root.id}",
                        "is_folder": True,
                    }
                )
            continue

        for child in children:
            descendant_ids = _folder_descendant_ids(org_id, root.owner_id, child.id)
            file_qs = StorageFile.objects.filter(
                organization_id=org_id,
                owner_id=root.owner_id,
                folder_id__in=descendant_ids,
                is_deleted=False,
            )
            total_size = int(file_qs.aggregate(total=Sum("size_bytes")).get("total") or 0)
            last_created = file_qs.aggregate(last=Max("created_at")).get("last")
            rows.append(
                {
                    "key": f"media-storage/{_safe_org_label(org)}/media-storage/{child.name}/",
                    "filename": child.name,
                    "size": total_size,
                    "last_modified": last_created,
                    "content_type_guess": "folder",
                    "storage_class": "",
                    "folder_prefix": f"online-storage-folder:{child.id}",
                    "is_folder": True,
                }
            )

    rows.sort(key=lambda item: (str(item.get("filename") or "").lower(), str(item.get("key") or "")))
    start = 0
    if continuation_token:
        try:
            start = max(0, int(continuation_token))
        except (TypeError, ValueError):
            start = 0
    page_limit = max(1, min(int(limit or 25), 100))
    end = start + page_limit
    page = rows[start:end]
    next_token = str(end) if end < len(rows) else None
    return {
        "items": page,
        "is_truncated": bool(next_token),
        "next_token": next_token,
    }


class MediaFoldersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context, org, role, category = _get_allowed_context(request)
        if not context:
            return JsonResponse({"detail": "forbidden"}, status=403)
        if (category or "").strip().lower() == "online_storage":
            if role != "saas_admin":
                return JsonResponse({"detail": "forbidden"}, status=403)
            folders = _online_storage_org_folders()
            _log_action(request, "LIST", object_key="online_storage", org=org)
            return JsonResponse({
                "folders": folders,
                "base_prefix": folders[0]["prefix"] if folders else "online-storage",
                "storage_mode": "object",
                "categories": _online_storage_categories_for_role(role),
                "category": category or "",
            })

        cache_key = f"media_folders:{context.base_prefix}"
        cached = cache.get(cache_key)
        if cached is not None:
            _log_action(request, "LIST", object_key=context.base_prefix, org=org)
            return JsonResponse({
                "folders": cached,
                "base_prefix": context.base_prefix,
                "storage_mode": context.settings_obj.storage_mode,
                "categories": _online_storage_categories_for_role(role),
                "category": category or "",
            })

        try:
            folders = list_folders(context)
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        cache.set(cache_key, folders, 60)
        _log_action(request, "LIST", object_key=context.base_prefix, org=org)
        return JsonResponse({
            "folders": folders,
            "base_prefix": context.base_prefix,
            "storage_mode": context.settings_obj.storage_mode,
            "categories": _online_storage_categories_for_role(role),
            "category": category or "",
        })


class MediaObjectsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context, org, role, category = _get_allowed_context(request)
        if not context:
            return JsonResponse({"detail": "forbidden"}, status=403)
        if (category or "").strip().lower() == "online_storage":
            if role != "saas_admin":
                return JsonResponse({"detail": "forbidden"}, status=403)
            folder = (request.GET.get("folder") or "").strip()
            token = request.GET.get("continuation_token") or None
            limit = int(request.GET.get("limit") or 25)
            if not folder.startswith("online-storage-org:"):
                return JsonResponse({
                    "items": [],
                    "next_token": None,
                    "is_truncated": False,
                    "current_prefix": folder or "online-storage",
                    "category": category or "",
                })
            org_id = folder.split(":", 1)[1]
            result = _list_online_storage_root_folders(org_id, limit=limit, continuation_token=token)
            for item in result["items"]:
                if isinstance(item.get("last_modified"), datetime):
                    item["last_modified"] = timezone.localtime(item["last_modified"]).strftime("%Y-%m-%d %H:%M:%S")
            _log_action(request, "LIST", object_key=folder, org=org)
            return JsonResponse({
                "items": result["items"],
                "next_token": result.get("next_token"),
                "is_truncated": result.get("is_truncated", False),
                "current_prefix": folder,
                "category": category or "",
            })

        folder = (request.GET.get("folder") or "").strip()
        if not folder:
            folder = context.base_prefix

        if not _ensure_prefix_allowed(folder, context.base_prefix):
            return JsonResponse({"detail": "invalid_folder"}, status=400)

        q = (request.GET.get("q") or "").strip()
        filter_type = (request.GET.get("type") or "all").strip().lower()
        limit = int(request.GET.get("limit") or 50)
        limit = max(1, min(limit, 100))
        token = request.GET.get("continuation_token") or None

        try:
            result = list_objects(context, folder_prefix=folder, limit=limit, continuation_token=token)
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        items = _filter_search(_filter_type(result["items"], filter_type), q)
        for item in items:
            if isinstance(item.get("last_modified"), datetime):
                item["last_modified"] = timezone.localtime(item["last_modified"]).strftime("%Y-%m-%d %H:%M:%S")
            elif isinstance(item.get("last_modified"), (int, float)):
                item["last_modified"] = timezone.localtime(
                    datetime.fromtimestamp(item["last_modified"])
                ).strftime("%Y-%m-%d %H:%M:%S")
        _log_action(request, "LIST", object_key=folder, org=org)
        return JsonResponse({
            "items": items,
            "next_token": result.get("next_token"),
            "is_truncated": result.get("is_truncated", False),
            "current_prefix": folder,
            "category": category or "",
        })


class MediaObjectDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        context, org, role, category = _get_allowed_context(request)
        if not context:
            return JsonResponse({"detail": "forbidden"}, status=403)
        if (category or "").strip().lower() == "online_storage":
            return JsonResponse({"detail": "forbidden"}, status=403)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            payload = {}

        key = (payload.get("key") or "").strip()
        if not key:
            return JsonResponse({"detail": "key_required"}, status=400)
        if not _ensure_prefix_allowed(key, context.base_prefix):
            return JsonResponse({"detail": "forbidden"}, status=403)

        try:
            delete_objects(context, [key])
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        _log_action(request, "DELETE", object_key=key, org=org)
        return JsonResponse({"deleted": [key]})


class MediaBulkDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        context, org, role, category = _get_allowed_context(request)
        if not context:
            return JsonResponse({"detail": "forbidden"}, status=403)
        if (category or "").strip().lower() == "online_storage":
            return JsonResponse({"detail": "forbidden"}, status=403)

        keys = request.data.get("keys") if hasattr(request, "data") else None
        if not isinstance(keys, list) or not keys:
            return JsonResponse({"detail": "keys_required"}, status=400)

        keys = [str(key).strip() for key in keys if str(key).strip()]
        for key in keys:
            if not _ensure_prefix_allowed(key, context.base_prefix):
                return JsonResponse({"detail": "forbidden"}, status=403)

        try:
            delete_objects(context, keys)
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        for key in keys:
            _log_action(request, "DELETE", object_key=key, org=org)
        return JsonResponse({"deleted": keys})


class MediaSignedUrlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        context, org, role, category = _get_allowed_context(request)
        if not context:
            return JsonResponse({"detail": "forbidden"}, status=403)
        if role == "saas_admin" and (category or "").strip().lower() == "screenshots":
            return JsonResponse({"detail": "forbidden"}, status=403)
        if (category or "").strip().lower() == "online_storage":
            return JsonResponse({"detail": "forbidden"}, status=403)

        key = (request.GET.get("key") or "").strip()
        if not key:
            return JsonResponse({"detail": "key_required"}, status=400)
        if not _ensure_prefix_allowed(key, context.base_prefix):
            return JsonResponse({"detail": "forbidden"}, status=403)

        try:
            if org:
                size_bytes = get_object_size(context, key)
                ok, usage = apply_bandwidth_usage(org, size_bytes)
                if not ok:
                    return JsonResponse({"detail": "bandwidth_limit_exceeded"}, status=409)
            url = generate_signed_url(context, key)
        except ValueError as exc:
            return JsonResponse({"detail": str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({"detail": str(exc)}, status=500)

        return JsonResponse({"url": url})
