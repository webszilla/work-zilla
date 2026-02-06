from typing import Iterable, List

from django.conf import settings


DEFAULT_INCLUDE_PREFIXES = [
    "critical/org_{org_id}/product_{product_id}/",
    "critical/org_{org_id}/assets/",
]

DEFAULT_EXCLUDE_PREFIXES = [
    "screenshots/",
    "thumbnails/",
    "previews/",
    "cache/",
    "logs/",
    "debug/",
    "tmp/",
    "temp/",
]


def get_include_prefixes():
    return getattr(settings, "BACKUP_INCLUDE_PREFIXES", DEFAULT_INCLUDE_PREFIXES)


def get_exclude_prefixes():
    return getattr(settings, "BACKUP_EXCLUDE_PREFIXES", DEFAULT_EXCLUDE_PREFIXES)


def build_org_product_prefixes(org_id, product_id):
    return [
        f"critical/org_{org_id}/product_{product_id}/",
        f"critical/org_{org_id}/assets/",
    ]


def expand_include_prefixes(org_id, product_id):
    prefixes = []
    for prefix in get_include_prefixes():
        if "{org_id}" in prefix or "{product_id}" in prefix:
            prefixes.append(prefix.format(org_id=org_id, product_id=product_id))
    prefixes.extend(build_org_product_prefixes(org_id, product_id))
    # De-dupe while preserving order
    seen = set()
    ordered = []
    for item in prefixes:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def should_include_path(path: str, include_prefixes: Iterable[str], exclude_prefixes: Iterable[str]) -> bool:
    if not path:
        return False
    for prefix in exclude_prefixes:
        if path.startswith(prefix):
            return False
    if not include_prefixes:
        return True
    return any(path.startswith(prefix) for prefix in include_prefixes)
