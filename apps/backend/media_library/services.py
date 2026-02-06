import mimetypes
import os
from dataclasses import dataclass

import boto3
from botocore.config import Config
from django.conf import settings

from saas_admin.models import GlobalMediaStorageSettings


@dataclass
class StorageContext:
    settings_obj: GlobalMediaStorageSettings
    base_prefix: str


def _normalize_prefix(prefix):
    value = (prefix or "").strip()
    if not value:
        return ""
    value = value.replace("\\", "/")
    if not value.endswith("/"):
        value = f"{value}/"
    return value


def _join_prefix(base, tail):
    if not base:
        return _normalize_prefix(tail)
    if not tail:
        return _normalize_prefix(base)
    return _normalize_prefix(f"{base.rstrip('/')}/{tail.strip('/')}")


def _build_category_prefix(base_path, category):
    base_path = _normalize_prefix(base_path)
    category = (category or "").strip().strip("/")
    if not category:
        return base_path
    if base_path.rstrip("/") == category:
        return _normalize_prefix(base_path)
    if base_path.endswith(f"{category}/"):
        return _normalize_prefix(base_path)
    return _join_prefix(base_path, category)


def get_storage_context(org_id=None, category=None):
    settings_obj = GlobalMediaStorageSettings.get_solo()
    base_path = settings_obj.base_path
    if settings_obj.storage_mode != "object":
        base_path = ""
    base_path = _build_category_prefix(base_path, category)
    if org_id:
        base_prefix = _join_prefix(base_path, str(org_id))
    else:
        base_prefix = base_path
    return StorageContext(settings_obj=settings_obj, base_prefix=base_prefix)


def get_s3_client(settings_obj):
    config = Config(
        signature_version=getattr(settings, "AWS_S3_SIGNATURE_VERSION", "s3v4"),
        s3={"addressing_style": getattr(settings, "AWS_S3_ADDRESSING_STYLE", "virtual")},
    )
    return boto3.client(
        "s3",
        endpoint_url=settings_obj.endpoint_url,
        region_name=settings_obj.region_name or None,
        aws_access_key_id=settings_obj.access_key_id,
        aws_secret_access_key=settings_obj.secret_access_key,
        config=config,
    )


def ensure_object_storage(settings_obj):
    if settings_obj.storage_mode != "object":
        raise ValueError("storage_mode_not_object")
    if not settings_obj.is_object_configured():
        raise ValueError("storage_not_configured")


def list_folders(context):
    if context.settings_obj.storage_mode != "object":
        return list_folders_local(context)
    ensure_object_storage(context.settings_obj)
    client = get_s3_client(context.settings_obj)
    prefix = context.base_prefix
    response = client.list_objects_v2(
        Bucket=context.settings_obj.bucket_name,
        Prefix=prefix,
        Delimiter="/",
        MaxKeys=1000,
    )
    prefixes = response.get("CommonPrefixes") or []
    folders = []
    for item in prefixes:
        folder_prefix = item.get("Prefix")
        if not folder_prefix:
            continue
        name = folder_prefix[len(prefix):] if prefix and folder_prefix.startswith(prefix) else folder_prefix
        name = name.rstrip("/")
        folders.append({"name": name, "prefix": folder_prefix})
    return folders


def list_objects(context, folder_prefix, limit=50, continuation_token=None):
    if context.settings_obj.storage_mode != "object":
        return list_objects_local(context, folder_prefix, limit=limit, continuation_token=continuation_token)
    ensure_object_storage(context.settings_obj)
    client = get_s3_client(context.settings_obj)
    params = {
        "Bucket": context.settings_obj.bucket_name,
        "Prefix": folder_prefix,
        "MaxKeys": limit,
    }
    if continuation_token:
        params["ContinuationToken"] = continuation_token
    response = client.list_objects_v2(**params)
    items = []
    for obj in response.get("Contents") or []:
        key = obj.get("Key")
        if not key or key.endswith("/"):
            continue
        filename = key.split("/")[-1]
        content_type, _ = mimetypes.guess_type(filename)
        items.append({
            "key": key,
            "filename": filename,
            "size": obj.get("Size") or 0,
            "last_modified": obj.get("LastModified"),
            "storage_class": obj.get("StorageClass") or "",
            "content_type_guess": content_type or "",
            "folder_prefix": folder_prefix,
        })
    return {
        "items": items,
        "is_truncated": response.get("IsTruncated", False),
        "next_token": response.get("NextContinuationToken"),
    }


def delete_objects(context, keys):
    if context.settings_obj.storage_mode != "object":
        return delete_objects_local(context, keys)
    ensure_object_storage(context.settings_obj)
    client = get_s3_client(context.settings_obj)
    payload = {"Objects": [{"Key": key} for key in keys], "Quiet": True}
    response = client.delete_objects(Bucket=context.settings_obj.bucket_name, Delete=payload)
    return response


def generate_signed_url(context, key, expires=60):
    if context.settings_obj.storage_mode != "object":
        base_url = (settings.MEDIA_URL or "/media/").rstrip("/")
        return f"{base_url}/{key}"
    ensure_object_storage(context.settings_obj)
    client = get_s3_client(context.settings_obj)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": context.settings_obj.bucket_name, "Key": key},
        ExpiresIn=expires,
    )


def get_object_size(context, key):
    if context.settings_obj.storage_mode != "object":
        local_path = _local_prefix_path(key)
        try:
            return os.path.getsize(local_path)
        except OSError:
            return 0
    ensure_object_storage(context.settings_obj)
    client = get_s3_client(context.settings_obj)
    head = client.head_object(Bucket=context.settings_obj.bucket_name, Key=key)
    return int(head.get("ContentLength") or 0)


def _local_root():
    return str(getattr(settings, "MEDIA_ROOT", "") or "")


def _local_prefix_path(prefix):
    local_root = _local_root()
    clean = (prefix or "").replace("\\", "/").lstrip("/")
    return os.path.join(local_root, clean)


def list_folders_local(context):
    prefix = context.base_prefix
    root_path = _local_prefix_path(prefix)
    folders = []
    if not os.path.isdir(root_path):
        return folders
    for name in os.listdir(root_path):
        full_path = os.path.join(root_path, name)
        if os.path.isdir(full_path):
            folders.append({"name": name, "prefix": _normalize_prefix(f"{prefix}{name}")})
    return folders


def list_objects_local(context, folder_prefix, limit=50, continuation_token=None):
    prefix = folder_prefix
    root_path = _local_prefix_path(prefix)
    items = []
    if not os.path.isdir(root_path):
        return {"items": [], "is_truncated": False, "next_token": None}
    all_files = []
    for root, _, files in os.walk(root_path):
        for filename in files:
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, _local_root()).replace(os.sep, "/")
            all_files.append((rel_path, full_path))
    all_files.sort(key=lambda row: row[0])
    start = 0
    if continuation_token:
        try:
            start = int(continuation_token)
        except (TypeError, ValueError):
            start = 0
    slice_files = all_files[start : start + limit]
    for rel_path, full_path in slice_files:
        filename = rel_path.split("/")[-1]
        content_type, _ = mimetypes.guess_type(filename)
        stat = os.stat(full_path)
        items.append({
            "key": rel_path,
            "filename": filename,
            "size": stat.st_size,
            "last_modified": stat.st_mtime,
            "storage_class": "",
            "content_type_guess": content_type or "",
            "folder_prefix": prefix,
        })
    next_token = None
    if start + limit < len(all_files):
        next_token = str(start + limit)
    return {
        "items": items,
        "is_truncated": bool(next_token),
        "next_token": next_token,
    }


def delete_objects_local(context, keys):
    deleted = []
    for key in keys:
        full_path = os.path.join(_local_root(), key.replace("/", os.sep))
        if os.path.exists(full_path) and os.path.isfile(full_path):
            try:
                os.remove(full_path)
                deleted.append(key)
            except OSError:
                continue
    return {"deleted": deleted}
