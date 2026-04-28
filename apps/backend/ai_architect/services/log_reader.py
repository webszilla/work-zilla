from __future__ import annotations

import re
from pathlib import Path

from django.conf import settings


DEFAULT_MAX_LINES = 100
ABSOLUTE_MAX_LINES = 300


_EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
_PHONE_RE = re.compile(r"\b(\+?\d[\d\s().-]{7,}\d)\b")
_OPENAI_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9]{8,}\b")
_BEARER_RE = re.compile(r"(?i)\bBearer\s+([A-Za-z0-9._=-]{8,})\b")
_AUTH_HEADER_RE = re.compile(r"(?i)\bAuthorization:\s*([^\n\r]+)")
_COOKIE_RE = re.compile(r"(?i)\bCookie:\s*([^\n\r]+)")
_PASSWORD_KV_RE = re.compile(r"(?i)\b(password|passwd|pwd)\s*=\s*([^\s&]+)")
_DATABASE_URL_RE = re.compile(r"(?i)\b(database_url|db_url|postgres(ql)?://)[^\s]+")
_SECRET_KEY_RE = re.compile(r"(?i)\b(secret_key|django_secret_key)\s*=\s*([^\s&]+)")
_API_KEY_KV_RE = re.compile(r"(?i)\b(api_key|openai_api_key)\s*=\s*([^\s&]+)")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")


def _repo_root() -> Path:
    root = getattr(settings, "REPO_ROOT", None)
    if root:
        return Path(root)
    return Path(settings.BASE_DIR).parent.parent


def _mask_email(match: re.Match) -> str:
    first = match.group(1)
    domain = match.group(2)
    return f"{first}***@{domain}"


def sanitize_log_text(text: str) -> str:
    if not text:
        return ""
    value = str(text)
    value = _OPENAI_KEY_RE.sub("sk-****masked", value)
    value = _JWT_RE.sub("****masked.jwt", value)
    value = _BEARER_RE.sub("Bearer ****masked", value)
    value = _AUTH_HEADER_RE.sub("Authorization: ****masked", value)
    value = _COOKIE_RE.sub("Cookie: ****masked", value)
    value = _PASSWORD_KV_RE.sub(lambda m: f"{m.group(1)}=****masked", value)
    value = _SECRET_KEY_RE.sub(lambda m: f"{m.group(1)}=****masked", value)
    value = _API_KEY_KV_RE.sub(lambda m: f"{m.group(1)}=****masked", value)
    value = _DATABASE_URL_RE.sub("****masked.database_url", value)
    value = _EMAIL_RE.sub(_mask_email, value)
    value = _PHONE_RE.sub("****masked.phone", value)
    return value


def _tail_lines(path: Path, max_lines: int) -> list[str]:
    max_lines = max(1, min(int(max_lines), ABSOLUTE_MAX_LINES))
    try:
        data = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    if len(data) <= max_lines:
        return data
    return data[-max_lines:]


def read_sanitized_error_logs(max_lines: int = DEFAULT_MAX_LINES) -> dict:
    """
    Read last N lines from a configured log file and sanitize them.
    This is intentionally limited and read-only: no download, no full file dump.
    """
    configured = str(getattr(settings, "AI_ARCHITECT_LOG_PATH", "") or "").strip()
    candidates = []
    if configured:
        candidates.append(Path(configured))
    # Safe defaults if project defines them later; only if they exist.
    candidates.extend(
        [
            _repo_root() / "env" / "logs" / "app.log",
            _repo_root() / "env" / "logs" / "django.log",
        ]
    )
    path = next((p for p in candidates if p.is_file()), None)
    if not path:
        return {"path": "", "lines": 0, "content": ""}

    lines = _tail_lines(path, max_lines=max_lines)
    content = "\n".join(lines)
    return {"path": str(path), "lines": len(lines), "content": sanitize_log_text(content)}

