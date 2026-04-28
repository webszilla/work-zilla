from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings


ALLOWED_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
}

ALLOWED_FILENAMES = {
    "requirements.txt",
    "package.json",
    ".env.example",
}

BLOCKED_DIR_PARTS = {
    ".git",
    "node_modules",
    "venv",
    ".venv",
    "env",
    "__pycache__",
    "media",
    "staticfiles",
    "frontend_dist",
    "dist",
    "build",
}

BLOCKED_SUFFIXES = {
    ".sqlite3",
    ".sqlite3-journal",
    ".sqlite3-wal",
    ".sqlite3-shm",
    ".pem",
    ".key",
    ".crt",
    ".p12",
    ".pfx",
    ".cer",
}


@dataclass(frozen=True)
class ReadLimits:
    max_file_bytes: int = 80_000
    max_files: int = 8


def _repo_root() -> Path:
    root = getattr(settings, "REPO_ROOT", None)
    if root:
        return Path(root)
    return Path(settings.BASE_DIR).parent.parent


def _is_blocked_path(path: Path) -> bool:
    parts = {part.lower() for part in path.parts}
    if parts & {p.lower() for p in BLOCKED_DIR_PARTS}:
        return True
    suffix = path.suffix.lower()
    if suffix in BLOCKED_SUFFIXES:
        return True
    lowered = path.name.lower()
    if lowered in {".env", "id_rsa", "id_ed25519"}:
        return True
    return False


def _is_allowed_path(path: Path) -> bool:
    if _is_blocked_path(path):
        return False
    if path.name in ALLOWED_FILENAMES:
        return True
    if path.suffix.lower() in ALLOWED_EXTENSIONS:
        if path.name.lower().endswith(".env.example"):
            return True
        if path.suffix.lower() == ".env":
            return False
        return True
    return False


def safe_read_files(relative_paths: list[str], limits: ReadLimits | None = None) -> list[dict]:
    limits = limits or ReadLimits()
    root = _repo_root().resolve()
    results: list[dict] = []
    seen = set()

    for raw in relative_paths[: limits.max_files]:
        rel = str(raw or "").strip().lstrip("/").replace("\\", "/")
        if not rel or rel in seen:
            continue
        seen.add(rel)
        if rel.startswith(".env") and rel != ".env.example":
            continue
        target = (root / rel).resolve()
        if root not in target.parents and target != root:
            continue
        if not target.is_file():
            continue
        if _is_blocked_path(target):
            continue
        if not _is_allowed_path(target):
            continue
        try:
            size = target.stat().st_size
        except OSError:
            continue
        if size > limits.max_file_bytes:
            continue
        try:
            content = target.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        results.append({"path": rel, "bytes": size, "content": content})

    return results


def list_allowed_files(max_files: int = 500) -> list[str]:
    root = _repo_root().resolve()
    allowed: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dir_path = Path(dirpath)
        rel_dir = dir_path.relative_to(root)
        if any(part.lower() in {p.lower() for p in BLOCKED_DIR_PARTS} for part in rel_dir.parts):
            dirnames[:] = []
            continue
        for name in filenames:
            candidate = dir_path / name
            rel_path = str(candidate.relative_to(root)).replace("\\", "/")
            if _is_allowed_path(candidate) and not _is_blocked_path(candidate):
                allowed.append(rel_path)
                if len(allowed) >= max_files:
                    return allowed
    return allowed
