from __future__ import annotations

import fnmatch
import glob
import os
import re
from datetime import datetime, timezone as dt_timezone
from pathlib import Path

from django.conf import settings
from django.http import Http404

from apps.backend.media_library import services as media_services
from saas_admin.models import GlobalMediaStorageSettings


APPLICATION_DOWNLOADS_CATEGORY = "application-downloads"
SIGNED_URL_TTL_SECONDS = 3600

DOWNLOAD_CLASSIFIERS = [
    {
        "family": "bootstrap_windows",
        "label": "Bootstrap Installer",
        "product": "Bootstrap Installer",
        "platform": "Windows",
        "arch": "",
        "patterns": [
            "Work Zilla Installer-win-x86-*.exe",
            "Work Zilla Installer-win-ia32-*.exe",
            "Work Zilla Installer-win-x64-*.exe",
            "Work Zilla Installer-win-*.exe",
        ],
    },
    {
        "family": "bootstrap_mac_arm64",
        "label": "Bootstrap Installer",
        "product": "Bootstrap Installer",
        "platform": "macOS",
        "arch": "arm64",
        "patterns": [
            "Work Zilla Installer-mac-arm64-*.dmg",
            "Work Zilla Installer-mac-arm64-*.zip",
        ],
    },
    {
        "family": "bootstrap_mac_x64",
        "label": "Bootstrap Installer",
        "product": "Bootstrap Installer",
        "platform": "macOS",
        "arch": "x64",
        "patterns": [
            "Work Zilla Installer-mac-x64-*.dmg",
            "Work Zilla Installer-mac-x64-*.zip",
        ],
    },
    {
        "family": "monitor_windows",
        "label": "Work Suite Agent",
        "product": "Work Suite",
        "platform": "Windows",
        "arch": "",
        "patterns": [
            "Work Zilla Agent Setup *x86*.exe",
            "Work Zilla Agent Setup *ia32*.exe",
            "Work Zilla Agent Setup *x64*.exe",
            "Work Zilla Agent Setup *.exe",
            "WorkZillaInstallerSetup.exe",
            "WorkZillaAgentSetup.exe",
        ],
    },
    {
        "family": "monitor_mac_arm64",
        "label": "Work Suite Agent",
        "product": "Work Suite",
        "platform": "macOS",
        "arch": "arm64",
        "patterns": [
            "Work Zilla Agent-*-arm64.dmg",
            "Work Zilla Agent-*-arm64.pkg",
            "Work Zilla Agent-*-arm64-mac.zip",
        ],
    },
    {
        "family": "monitor_mac_x64",
        "label": "Work Suite Agent",
        "product": "Work Suite",
        "platform": "macOS",
        "arch": "x64",
        "patterns": [
            "Work Zilla Agent-[0-9]*.dmg",
            "Work Zilla Agent-[0-9]*.pkg",
            "Work Zilla Agent-[0-9]*-mac.zip",
            "Work Zilla Agent-*.dmg",
            "Work Zilla Agent-*.pkg",
            "Work Zilla Agent-*-mac.zip",
        ],
    },
    {
        "family": "storage_windows",
        "label": "Online Storage Agent",
        "product": "Online Storage",
        "platform": "Windows",
        "arch": "",
        "patterns": [
            "Work Zilla Storage Setup *x86*.exe",
            "Work Zilla Storage Setup *ia32*.exe",
            "Work Zilla Storage Agent Setup *x86*.exe",
            "Work Zilla Storage Agent Setup *ia32*.exe",
            "Work Zilla Storage Setup *.exe",
            "Work Zilla Storage Agent Setup *.exe",
        ],
    },
    {
        "family": "storage_mac_arm64",
        "label": "Online Storage Agent",
        "product": "Online Storage",
        "platform": "macOS",
        "arch": "arm64",
        "patterns": [
            "Work Zilla Storage-*-arm64.dmg",
            "Work Zilla Storage-*-arm64.pkg",
            "Work Zilla Storage-*-arm64-mac.zip",
        ],
    },
    {
        "family": "storage_mac_x64",
        "label": "Online Storage Agent",
        "product": "Online Storage",
        "platform": "macOS",
        "arch": "x64",
        "patterns": [
            "Work Zilla Storage-*.dmg",
            "Work Zilla Storage-*.pkg",
            "Work Zilla Storage-*-mac.zip",
        ],
    },
    {
        "family": "imposition_windows",
        "label": "Imposition Installer",
        "product": "Print Marks",
        "platform": "Windows",
        "arch": "",
        "patterns": [
            "Work Zilla Imposition Setup *x86*.exe",
            "Work Zilla Imposition Setup *ia32*.exe",
            "Work Zilla Imposition Setup *x64*.exe",
            "Work Zilla Imposition Setup *.exe",
        ],
    },
    {
        "family": "imposition_mac_arm64",
        "label": "Imposition Installer",
        "product": "Print Marks",
        "platform": "macOS",
        "arch": "arm64",
        "patterns": [
            "Work Zilla Imposition-*-arm64.dmg",
            "Work Zilla Imposition-*-arm64.pkg",
            "Work Zilla Imposition-*-arm64-mac.zip",
        ],
    },
    {
        "family": "imposition_mac_x64",
        "label": "Imposition Installer",
        "product": "Print Marks",
        "platform": "macOS",
        "arch": "x64",
        "patterns": [
            "Work Zilla Imposition-*.dmg",
            "Work Zilla Imposition-*.pkg",
            "Work Zilla Imposition-*-mac.zip",
        ],
    },
]

LOCAL_SOURCE_GLOBS = [
    ("bootstrap_windows", "apps/bootstrap_installer/dist/Work Zilla Installer-win-x64-*.exe"),
    ("bootstrap_windows", "apps/bootstrap_installer/dist/Work Zilla Installer-win-x86-*.exe"),
    ("bootstrap_windows", "apps/bootstrap_installer/dist/Work Zilla Installer-win-ia32-*.exe"),
    ("bootstrap_mac_arm64", "apps/bootstrap_installer/dist/Work Zilla Installer-mac-arm64-*.*"),
    ("bootstrap_mac_x64", "apps/bootstrap_installer/dist/Work Zilla Installer-mac-x64-*.*"),
    ("monitor_windows", "apps/desktop_app/dist/Work Zilla Agent Setup *.exe"),
    ("monitor_mac_arm64", "apps/desktop_app/dist/Work Zilla Agent-*-arm64.*"),
    ("monitor_mac_x64", "apps/desktop_app/dist/Work Zilla Agent-[0-9]*.*"),
    ("storage_windows", "apps/backend/static/downloads/Work Zilla Storage Setup *.exe"),
    ("storage_windows", "apps/backend/static/downloads/Work Zilla Storage Agent Setup *.exe"),
    ("storage_mac_arm64", "apps/backend/static/downloads/Work Zilla Storage-*-arm64.*"),
    ("storage_mac_x64", "apps/backend/static/downloads/Work Zilla Storage-*.*"),
    ("imposition_windows", "apps/backend/static/downloads/Work Zilla Imposition Setup *.exe"),
    ("imposition_mac_arm64", "apps/backend/static/downloads/Work Zilla Imposition-*-arm64.*"),
    ("imposition_mac_x64", "apps/backend/static/downloads/Work Zilla Imposition-*.*"),
]

DIRECT_DOWNLOAD_ROUTES = [
    {"label": "Windows Installer", "path": "/downloads/windows-agent/"},
    {"label": "macOS Installer", "path": "/downloads/mac-agent/"},
    {"label": "Windows Work Suite Agent", "path": "/downloads/windows-monitor-product-agent/"},
    {"label": "macOS Work Suite Agent", "path": "/downloads/mac-monitor-product-agent/"},
    {"label": "Windows Online Storage Agent", "path": "/downloads/windows-storage-product-agent/"},
    {"label": "macOS Online Storage Agent", "path": "/downloads/mac-storage-product-agent/"},
    {"label": "Windows Imposition Installer", "path": "/downloads/windows-imposition-product-agent/"},
    {"label": "macOS Imposition Installer", "path": "/downloads/mac-imposition-product-agent/"},
]


def _repo_root() -> Path:
    return Path(getattr(settings, "REPO_ROOT"))


def _normalize_prefix(prefix):
    value = (prefix or "").strip().strip("/")
    if not value:
        return ""
    return f"{value}/"


def _strip_base_prefix(full_key, base_prefix):
    prefix = _normalize_prefix(base_prefix)
    if prefix and full_key.startswith(prefix):
        return full_key[len(prefix):]
    return full_key


def _classify_filename(filename):
    for entry in DOWNLOAD_CLASSIFIERS:
        for pattern in entry["patterns"]:
            if fnmatch.fnmatch(filename, pattern):
                return entry
    return {
        "family": "other",
        "label": "Application Download",
        "product": "Application Download",
        "platform": "",
        "arch": "",
        "patterns": [],
    }


def _infer_arch_from_filename(filename):
    value = str(filename or "").lower()
    if any(token in value for token in ("arm64", "aarch64")):
        return "arm64"
    if any(token in value for token in ("x86", "ia32", "i386", "32bit", "32-bit", "win32")):
        return "x86"
    if any(token in value for token in ("x64", "amd64", "x86_64", "win64")):
        return "x64"
    if value.endswith(".exe"):
        return "x64"
    return ""


def _extract_version_from_filename(filename):
    value = str(filename or "")
    match = re.search(r"(\d+\.\d+\.\d+(?:\.\d+)?)", value)
    return match.group(1) if match else ""


def _iter_local_matches(pattern):
    full_pattern = str(_repo_root() / pattern)
    for path in glob.glob(full_pattern):
        if os.path.isdir(path):
            continue
        filename = os.path.basename(path)
        if filename.endswith(".blockmap") or filename == "builder-debug.yml":
            continue
        yield path


def list_local_application_downloads():
    seen_paths = set()
    items = []
    for family, pattern in LOCAL_SOURCE_GLOBS:
        for path in _iter_local_matches(pattern):
            if path in seen_paths:
                continue
            seen_paths.add(path)
            filename = os.path.basename(path)
            classifier = _classify_filename(filename)
            inferred_arch = _infer_arch_from_filename(filename)
            stat = os.stat(path)
            items.append({
                "source": "local",
                "family": family or classifier["family"],
                "filename": filename,
                "relative_key": filename,
                "storage_key": path,
                "size_bytes": int(stat.st_size or 0),
                "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=dt_timezone.utc),
                "product": classifier["product"],
                "platform": classifier["platform"],
                "arch": inferred_arch or classifier["arch"],
                "version": _extract_version_from_filename(filename),
                "label": classifier["label"],
                "download_url": None,
            })
    items.sort(key=lambda item: item["last_modified"], reverse=True)
    return items


def get_remote_application_download_context():
    settings_obj = GlobalMediaStorageSettings.get_solo()
    if settings_obj.storage_mode != "object" or not settings_obj.is_object_configured():
        return None
    return media_services.get_storage_context(category=APPLICATION_DOWNLOADS_CATEGORY)


def list_remote_application_downloads(expires=SIGNED_URL_TTL_SECONDS):
    context = get_remote_application_download_context()
    if context is None:
        return []

    items = []
    token = None
    folder_prefix = context.base_prefix
    while True:
        page = media_services.list_objects(context, folder_prefix, limit=200, continuation_token=token)
        for obj in page["items"]:
            filename = obj["filename"]
            classifier = _classify_filename(filename)
            inferred_arch = _infer_arch_from_filename(filename)
            last_modified = obj.get("last_modified")
            items.append({
                "source": "object",
                "family": classifier["family"],
                "filename": filename,
                "relative_key": _strip_base_prefix(obj["key"], context.base_prefix),
                "storage_key": obj["key"],
                "size_bytes": int(obj.get("size") or 0),
                "last_modified": last_modified,
                "product": classifier["product"],
                "platform": classifier["platform"],
                "arch": inferred_arch or classifier["arch"],
                "version": _extract_version_from_filename(filename),
                "label": classifier["label"],
                "download_url": media_services.generate_signed_url(context, obj["key"], expires=expires),
            })
        if not page.get("is_truncated"):
            break
        token = page.get("next_token")
        if not token:
            break
    items.sort(key=lambda item: item["last_modified"] or datetime.min.replace(tzinfo=dt_timezone.utc), reverse=True)
    return items


def list_application_downloads(expires=SIGNED_URL_TTL_SECONDS):
    remote_items = list_remote_application_downloads(expires=expires)
    if remote_items:
        return remote_items
    return list_local_application_downloads()


def resolve_latest_download_item(*candidates):
    items = list_application_downloads(expires=SIGNED_URL_TTL_SECONDS)
    for candidate in candidates:
        if not candidate:
            continue
        matches = [item for item in items if fnmatch.fnmatch(item["filename"], candidate)]
        if matches:
            return max(
                matches,
                key=lambda item: item["last_modified"] or datetime.min.replace(tzinfo=dt_timezone.utc),
            )
    raise Http404("Installer not found.")


def resolve_latest_download_url(*candidates):
    item = resolve_latest_download_item(*candidates)
    if item["source"] == "object":
        return item["download_url"], item["filename"]
    return item["relative_key"], item["filename"]


def serve_local_application_download(relative_key):
    relative_key = os.path.basename(relative_key or "")
    if not relative_key:
        raise Http404("Installer not found.")
    for item in list_local_application_downloads():
        if item["relative_key"] == relative_key:
            return item
    raise Http404("Installer not found.")


def delete_application_download(relative_key):
    context = get_remote_application_download_context()
    if context is None:
        raise ValueError("object_storage_not_configured")
    clean_key = (relative_key or "").strip().replace("\\", "/").lstrip("/")
    if not clean_key:
        raise ValueError("download_key_required")
    if ".." in clean_key.split("/"):
        raise ValueError("invalid_download_key")
    storage_key = f"{context.base_prefix}{clean_key}" if context.base_prefix else clean_key
    media_services.delete_objects(context, [storage_key])
    return storage_key


def sync_local_application_downloads(delete_local=False):
    context = get_remote_application_download_context()
    if context is None:
        raise ValueError("object_storage_not_configured")

    client = media_services.get_s3_client(context.settings_obj)
    existing_items = list_remote_application_downloads(expires=SIGNED_URL_TTL_SECONDS)
    existing_by_family = {}
    for item in existing_items:
        family_key = f"{item.get('family') or 'other'}::{item.get('arch') or '-'}"
        existing_by_family.setdefault(family_key, []).append(item)

    uploaded = []
    deleted_remote = []
    deleted_local = []
    local_items = list_local_application_downloads()
    local_by_family = {}
    for item in local_items:
        family_key = f"{item.get('family') or 'other'}::{item.get('arch') or '-'}"
        local_by_family.setdefault(family_key, []).append(item)

    for family_key, family_items in local_by_family.items():
        family_label = family_items[0].get("family", "other") if family_items else "other"
        selected_items = [
            max(
                family_items,
                key=lambda item: item["last_modified"] or datetime.min.replace(tzinfo=dt_timezone.utc),
            )
        ]
        keep_filenames = {item["filename"] for item in selected_items}
        for item in selected_items:
            key = f"{context.base_prefix}{item['filename']}" if context.base_prefix else item["filename"]
            with open(item["storage_key"], "rb") as handle:
                client.upload_fileobj(handle, context.settings_obj.bucket_name, key)
            uploaded.append({"filename": item["filename"], "storage_key": key, "family": family_label, "arch": item.get("arch") or ""})
        for item in existing_by_family.get(family_key, []):
            if item["filename"] in keep_filenames:
                continue
            media_services.delete_objects(context, [item["storage_key"]])
            deleted_remote.append(item["filename"])
        if delete_local:
            for item in family_items:
                try:
                    os.remove(item["storage_key"])
                    deleted_local.append(item["filename"])
                except OSError:
                    continue

    return {
        "uploaded": uploaded,
        "deleted_remote": deleted_remote,
        "deleted_local": deleted_local,
        "folder_prefix": context.base_prefix,
    }
