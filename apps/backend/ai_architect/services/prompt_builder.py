from __future__ import annotations

import re

from django.conf import settings

from .code_reader import safe_read_files
from .log_reader import read_sanitized_error_logs
from .schema_reader import summarize_models, summarize_db_tables


SAFETY_RULES = [
    "You are an AI Architect assistant for a Django + React SaaS project.",
    "READ-ONLY ONLY: never edit code, run commands, run migrations, delete/update data, or suggest destructive SQL.",
    "Never request or output secrets (API keys, .env values, private keys).",
    "Prefer safe, minimal changes and explicit file lists.",
    "If an action is risky, warn clearly and propose safer alternatives.",
]


def _guess_paths_from_text(text: str, max_paths: int = 6) -> list[str]:
    if not text:
        return []
    candidates = re.findall(r"(apps/[A-Za-z0-9_./-]+\.[A-Za-z0-9_]+)", text)
    unique = []
    seen = set()
    for item in candidates:
        cleaned = item.strip().lstrip("/")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            unique.append(cleaned)
        if len(unique) >= max_paths:
            break
    return unique


def build_ai_context(user_message: str, allowed_scopes: dict | None = None) -> dict:
    scopes = allowed_scopes or {}
    code_scope = bool(scopes.get("code_structure_read", True))
    models_scope = bool(scopes.get("django_models_read", True))
    schema_scope = bool(scopes.get("database_schema_read", True))
    logs_scope = bool(scopes.get("error_logs_read", False))

    context = {
        "project": {
            "name": "WorkZilla",
            "repo_root": str(getattr(settings, "REPO_ROOT", "")),
            "backend_base": str(getattr(settings, "BASE_DIR", "")),
        },
        "safety_rules": SAFETY_RULES,
    }

    if models_scope:
        context["django_models"] = summarize_models()
    if schema_scope:
        context["db_tables"] = summarize_db_tables()
    if code_scope:
        requested_paths = _guess_paths_from_text(user_message)
        if requested_paths:
            context["file_snippets"] = safe_read_files(requested_paths)
        context["hint"] = (
            "If you need specific file contents, ask the SaaS Admin to mention exact file paths like apps/frontend/src/App.jsx."
        )

    if logs_scope:
        context["error_logs_tail"] = read_sanitized_error_logs()

    return context
