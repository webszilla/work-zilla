import json
import uuid
import re
import hashlib

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Max

from .models import AiArchitectSettings, AiArchitectChatMessage, AiArchitectUsageEvent
from .permissions import require_saas_admin
from .services.crypto import decrypt_text, encrypt_text, mask_api_key
from .services.openai_client import OpenAIClient
from .services.business_reader import build_direct_business_answer
from .services.prompt_builder import build_ai_context
from .services.usage import estimate_cost_inr_from_tokens, get_usage_summary


MIN_MAX_TOKENS = 300
MAX_MAX_TOKENS = 3000
DEFAULT_MAX_TOKENS = 900
RESPONSE_MODE_TOKENS = {
    "quick": 500,
    "standard": 900,
    "deep": 1800,
}

_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")
_WHITESPACE_RE = re.compile(r"\s+")
_OPENAI_ORG_RE = re.compile(r"^org_[A-Za-z0-9_-]{6,}$")
_OPENAI_PROJECT_RE = re.compile(r"^proj_[A-Za-z0-9_-]{6,}$")


def _get_settings() -> AiArchitectSettings:
    obj = AiArchitectSettings.objects.first()
    if not obj:
        obj = AiArchitectSettings.objects.create(
            provider="openai",
            enabled=False,
            response_mode="standard",
            model_name="gpt-4o-mini",
            max_tokens=DEFAULT_MAX_TOKENS,
            monthly_budget_inr=5000,
            warning_threshold_percent=80,
            hard_stop_enabled=True,
            allow_error_logs_read=False,
            allowed_scopes={
                "code_structure_read": True,
                "django_models_read": True,
                "database_schema_read": True,
                "error_logs_read": False,
                "business_metrics_read": True,
            },
        )
    if not obj.allowed_scopes:
        obj.allowed_scopes = {
            "code_structure_read": True,
            "django_models_read": True,
            "database_schema_read": True,
            "error_logs_read": False,
            "business_metrics_read": True,
        }
        obj.save(update_fields=["allowed_scopes"])
    return obj


def _parse_json(request):
    try:
        raw = request.body.decode("utf-8") if request.body else ""
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


def _clamp_max_tokens(value):
    try:
        parsed = int(value)
    except Exception:
        parsed = DEFAULT_MAX_TOKENS
    if parsed < MIN_MAX_TOKENS:
        return MIN_MAX_TOKENS
    if parsed > MAX_MAX_TOKENS:
        return MAX_MAX_TOKENS
    return parsed


def _normalize_response_mode(mode: str) -> str:
    raw = str(mode or "").strip().lower().replace("-", "_")
    if raw in {"quick_answer", "quick"}:
        return "quick"
    if raw in {"deep_analysis", "deep"}:
        return "deep"
    return "standard"


def _coerce_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _normalize_api_key(raw: str) -> str:
    """
    Copy/paste from browsers sometimes includes whitespace / zero-width chars.
    OpenAI keys should not contain any whitespace, so remove it safely.
    """
    value = str(raw or "")
    value = _ZERO_WIDTH_RE.sub("", value)
    value = _WHITESPACE_RE.sub("", value)
    return value.strip()


def _validate_api_key_length(api_key: str) -> tuple[bool, str]:
    # Safety guard: avoid storing extremely large pasted blobs.
    # 180 chosen to match the SaaS Admin UI input limit.
    if len(api_key or "") > 180:
        return False, "API key is too long. Please paste only the secret key (no extra text)."
    return True, ""

def _normalize_openai_id(raw: str) -> str:
    value = str(raw or "")
    value = _ZERO_WIDTH_RE.sub("", value)
    value = _WHITESPACE_RE.sub("", value)
    value = value.strip()
    # Treat placeholder-like values as empty.
    if not value:
        return ""
    lowered = value.lower()
    if lowered in {"org_...", "proj_...", "org...", "proj..."} or lowered.endswith("..."):
        return ""
    return value

def _validate_openai_headers(obj: AiArchitectSettings, api_key: str) -> tuple[bool, str]:
    """
    Returns (ok, message). Does not log secrets.
    """
    org_id = _normalize_openai_id(getattr(obj, "openai_organization_id", ""))
    proj_id = _normalize_openai_id(getattr(obj, "openai_project_id", ""))
    if org_id and not _OPENAI_ORG_RE.match(org_id):
        return False, "Invalid OpenAI Organization ID. Expected format like org_XXXXXXXX."
    if proj_id and not _OPENAI_PROJECT_RE.match(proj_id):
        return False, "Invalid OpenAI Project ID. Expected format like proj_XXXXXXXX."
    key_prefix = str(api_key or "")
    if (key_prefix.startswith("sk-proj-") or key_prefix.startswith("sk-svcacct-")) and not proj_id:
        return (
            False,
            "This API key is project-scoped. Set OpenAI Project ID (proj_...) and try again.",
        )
    return True, ""


@login_required
@require_saas_admin
@require_http_methods(["GET"])
def ai_status(request):
    obj = _get_settings()
    has_key = bool(obj.encrypted_api_key)
    usage = get_usage_summary(
        request.user,
        budget_inr=obj.monthly_budget_inr,
        warning_percent=obj.warning_threshold_percent,
        hard_stop_enabled=obj.hard_stop_enabled,
    )
    return JsonResponse(
        {
            "backend_build": "ai_architect_v2026-05-12_2",
            "enabled": bool(obj.enabled),
            "configured": has_key,
            "provider": obj.provider,
            "response_mode": obj.response_mode,
            "model_name": obj.model_name,
            "max_tokens": obj.max_tokens,
            "openai_organization_id": obj.openai_organization_id,
            "openai_project_id": obj.openai_project_id,
            "monthly_budget_inr": obj.monthly_budget_inr,
            "warning_threshold_percent": obj.warning_threshold_percent,
            "hard_stop_enabled": bool(obj.hard_stop_enabled),
            "allowed_scopes": obj.allowed_scopes,
            "usage": usage,
        }
    )


@login_required
@require_saas_admin
@require_http_methods(["GET", "POST"])
def ai_settings(request):
    obj = _get_settings()
    if request.method == "GET":
        api_key_plain = decrypt_text(obj.encrypted_api_key)
        key_kind = ""
        key_prefix = str(api_key_plain or "")
        if key_prefix.startswith("sk-proj-") or key_prefix.startswith("sk-svcacct-"):
            key_kind = "project_scoped"
        elif key_prefix.startswith("sk-"):
            key_kind = "standard"
        api_key_len = len(api_key_plain or "")
        api_key_fingerprint = ""
        if api_key_plain:
            # Non-reversible fingerprint to confirm which key is saved (never show the key itself).
            api_key_fingerprint = hashlib.sha256(api_key_plain.encode("utf-8")).hexdigest()[:12]
        return JsonResponse(
            {
                "provider": obj.provider,
                "enabled": bool(obj.enabled),
                "response_mode": obj.response_mode,
                "model_name": obj.model_name,
                "max_tokens": obj.max_tokens,
                "openai_organization_id": obj.openai_organization_id,
                "openai_project_id": obj.openai_project_id,
                "monthly_budget_inr": obj.monthly_budget_inr,
                "warning_threshold_percent": obj.warning_threshold_percent,
                "hard_stop_enabled": bool(obj.hard_stop_enabled),
                "allow_error_logs_read": bool(obj.allow_error_logs_read),
                "allowed_scopes": obj.allowed_scopes,
                "api_key_masked": mask_api_key(api_key_plain),
                "has_api_key": bool(api_key_plain),
                "api_key_kind": key_kind,
                "api_key_len": api_key_len,
                "api_key_fingerprint": api_key_fingerprint,
            }
        )

    payload = _parse_json(request)
    obj.provider = str(payload.get("provider") or obj.provider or "openai").strip().lower()
    obj.enabled = bool(payload.get("enabled"))
    obj.response_mode = _normalize_response_mode(payload.get("response_mode") or obj.response_mode)
    obj.model_name = str(payload.get("model_name") or obj.model_name or "gpt-4o-mini").strip()
    obj.openai_organization_id = _normalize_openai_id(payload.get("openai_organization_id") or obj.openai_organization_id or "")
    obj.openai_project_id = _normalize_openai_id(payload.get("openai_project_id") or obj.openai_project_id or "")
    max_tokens_raw = payload.get("max_tokens")
    if max_tokens_raw in (None, ""):
        max_tokens_raw = RESPONSE_MODE_TOKENS.get(obj.response_mode, DEFAULT_MAX_TOKENS)
    obj.max_tokens = _clamp_max_tokens(max_tokens_raw)
    obj.monthly_budget_inr = max(0, _coerce_int(payload.get("monthly_budget_inr"), obj.monthly_budget_inr or 5000))
    obj.warning_threshold_percent = max(
        0,
        min(100, _coerce_int(payload.get("warning_threshold_percent"), obj.warning_threshold_percent or 80)),
    )
    obj.hard_stop_enabled = bool(payload.get("hard_stop_enabled", obj.hard_stop_enabled))
    obj.allow_error_logs_read = bool(payload.get("allow_error_logs_read", obj.allow_error_logs_read))
    scopes = payload.get("allowed_scopes")
    if isinstance(scopes, dict):
        cleaned = {
            "code_structure_read": scopes.get("code_structure_read", True) is not False,
            "django_models_read": scopes.get("django_models_read", True) is not False,
            "database_schema_read": scopes.get("database_schema_read", True) is not False,
            "error_logs_read": bool(scopes.get("error_logs_read", False)),
            "business_metrics_read": bool(scopes.get("business_metrics_read", True)),
        }
        if not obj.allow_error_logs_read:
            cleaned["error_logs_read"] = False
        obj.allowed_scopes = cleaned
    api_key = _normalize_api_key(payload.get("api_key") or "")
    if api_key:
        if api_key.startswith("*") or api_key.startswith("sk-****"):
            return JsonResponse({"ok": False, "error": "invalid_api_key"}, status=400)
        ok_len, msg_len = _validate_api_key_length(api_key)
        if not ok_len:
            return JsonResponse({"ok": False, "error": "invalid_api_key", "message": msg_len}, status=400)
        obj.encrypted_api_key = encrypt_text(api_key)
    obj.save()
    return JsonResponse({"ok": True})


@login_required
@require_saas_admin
@require_http_methods(["POST"])
def ai_test(request):
    obj = _get_settings()
    payload = _parse_json(request)
    api_key_plain = decrypt_text(obj.encrypted_api_key)
    api_key = _normalize_api_key(payload.get("api_key") or api_key_plain or "")
    if not api_key:
        return JsonResponse({"ok": False, "error": "missing_api_key"}, status=400)
    ok, message = _validate_openai_headers(obj, api_key)
    if not ok:
        return JsonResponse({"ok": False, "error": "invalid_openai_headers", "message": message}, status=400)
    client = OpenAIClient(
        api_key=api_key,
        model=obj.model_name,
        organization_id=obj.openai_organization_id,
        project_id=obj.openai_project_id,
    )
    result = client.test_connection()
    if result.get("ok"):
        return JsonResponse(result, status=200)
    error_text = str(result.get("error") or "").strip()
    status_code = int(result.get("status_code") or 400)
    lowered = error_text.lower()
    # Prefer showing the real OpenAI error message (masked by _safe_error_text)
    # so SaaS admins can correct org/project/quota issues without guesswork.
    if status_code in (401, 403) and ("api key" in lowered or "authentication" in lowered or "unauthorized" in lowered):
        return JsonResponse(
            {
                "ok": False,
                "error": "invalid_api_key",
                "message": error_text
                or "OpenAI rejected this API key. Ensure you pasted the full key (no spaces/newlines). If the key was shared publicly, rotate it and try again.",
                "status_code": status_code,
            },
            status=400,
        )
    return JsonResponse(
        {
            "ok": False,
            "error": "openai_error",
            "message": error_text or f"OpenAI request failed (status {status_code}).",
            "status_code": status_code,
        },
        status=400,
    )


@login_required
@require_saas_admin
@require_http_methods(["GET"])
def ai_usage(request):
    obj = _get_settings()
    usage = get_usage_summary(
        request.user,
        budget_inr=obj.monthly_budget_inr,
        warning_percent=obj.warning_threshold_percent,
        hard_stop_enabled=obj.hard_stop_enabled,
    )
    return JsonResponse({"ok": True, "usage": usage})


@login_required
@require_saas_admin
@require_http_methods(["GET"])
def ai_history(request):
    session_id = str(request.GET.get("session_id") or "").strip()
    try:
        session_uuid = uuid.UUID(session_id) if session_id else None
    except ValueError:
        session_uuid = None
    qs = AiArchitectChatMessage.objects.filter(user=request.user)
    if session_uuid:
        qs = qs.filter(session_id=session_uuid)
    rows = list(qs.order_by("-created_at")[:40])
    rows.reverse()
    return JsonResponse(
        {
            "messages": [
                {
                    "id": str(row.id),
                    "session_id": str(row.session_id),
                    "role": row.role,
                    "content": row.content,
                    "created_at": row.created_at.isoformat(),
                }
                for row in rows
            ]
        }
    )


def _session_title_from_messages(messages: list[AiArchitectChatMessage]) -> str:
    for row in messages:
        if row.role == "user" and str(row.content or "").strip():
            text = re.sub(r"\s+", " ", str(row.content or "").strip())
            return text[:60]
    for row in messages:
        if str(row.content or "").strip():
            text = re.sub(r"\s+", " ", str(row.content or "").strip())
            return text[:60]
    return "New chat"


@login_required
@require_saas_admin
@require_http_methods(["GET"])
def ai_sessions(request):
    """
    Returns recent chat sessions for the current user.
    """
    # Get recent sessions based on latest message timestamp.
    rows = (
        AiArchitectChatMessage.objects.filter(user=request.user)
        .values("session_id")
        .annotate(last_created_at=Max("created_at"))
        .order_by("-last_created_at")[:40]
    )
    session_ids = [r["session_id"] for r in rows]
    # Load a small window per session to derive a title.
    sessions = []
    for sid in session_ids:
        msgs = list(
            AiArchitectChatMessage.objects.filter(user=request.user, session_id=sid)
            .order_by("created_at")[:6]
        )
        sessions.append(
            {
                "session_id": str(sid),
                "title": _session_title_from_messages(msgs),
            }
        )
    return JsonResponse({"sessions": sessions})


@login_required
@require_saas_admin
@require_http_methods(["DELETE"])
def ai_session_delete(request, session_id):
    AiArchitectChatMessage.objects.filter(user=request.user, session_id=session_id).delete()
    AiArchitectUsageEvent.objects.filter(user=request.user, session_id=session_id).delete()
    return JsonResponse({"ok": True})


@login_required
@require_saas_admin
@require_http_methods(["POST"])
def ai_chat(request):
    obj = _get_settings()
    if not obj.enabled:
        return JsonResponse({"ok": False, "error": "ai_architect_disabled"}, status=403)

    api_key = _normalize_api_key(decrypt_text(obj.encrypted_api_key))
    if not api_key:
        return JsonResponse({"ok": False, "error": "missing_api_key"}, status=400)
    ok, message = _validate_openai_headers(obj, api_key)
    if not ok:
        return JsonResponse({"ok": False, "error": "invalid_openai_headers", "message": message}, status=400)

    usage = get_usage_summary(
        request.user,
        budget_inr=obj.monthly_budget_inr,
        warning_percent=obj.warning_threshold_percent,
        hard_stop_enabled=obj.hard_stop_enabled,
    )
    if usage.get("exceeded") and obj.hard_stop_enabled:
        return JsonResponse(
            {"ok": False, "error": "monthly_budget_exceeded", "usage": usage},
            status=403,
        )

    payload = _parse_json(request)
    user_message = str(payload.get("message") or "").strip()
    if not user_message:
        return JsonResponse({"ok": False, "error": "missing_message"}, status=400)

    session_id_raw = str(payload.get("session_id") or "").strip()
    try:
        session_uuid = uuid.UUID(session_id_raw) if session_id_raw else uuid.uuid4()
    except ValueError:
        session_uuid = uuid.uuid4()

    scopes = dict(obj.allowed_scopes or {})
    if not obj.allow_error_logs_read:
        scopes["error_logs_read"] = False
    context = build_ai_context(user_message, allowed_scopes=scopes)
    direct_answer = build_direct_business_answer(user_message, context)

    system_message = {
        "role": "system",
        "content": (
            "You are the WorkZilla SaaS Admin AI Architect assistant.\n"
            "Follow the safety rules strictly.\n\n"
            "Language:\n"
            "- Reply in the user's language. If the user writes in Tamil (or Tanglish), reply in Tamil.\n\n"
            "What you can answer:\n"
            "- You MAY answer general product questions about WorkZilla and this AI Architect feature (e.g., chat memory, what is stored, budgets, scopes).\n"
            "- If the context includes `saas_admin_metrics`, use it to answer business questions like \"this month sales\".\n"
            "- If the context includes `saas_admin_business_lookup`, use it to answer user/account questions for emails mentioned in the query.\n"
            "- You MAY answer technical/architecture questions about the Django + React codebase (read-only).\n"
            "- Do NOT refuse a question just because it is not code-related.\n\n"
            "Response format:\n"
            "- If the user asks for code/architecture changes, return answers in this structure:\n"
            "  1) Summary\n  2) Affected files\n  3) Affected DB tables\n  4) Risk level\n  5) Suggested plan\n  6) Codex prompt\n  7) Warnings\n"
            "- If the user asks a general or business question, answer directly and briefly.\n"
            "- Do not produce SQL examples when the answer is already available in the provided context.\n\n"
            f"Safety rules:\n- " + "\n- ".join(context.get("safety_rules", []))
        ),
    }

    # Lightweight short history for continuity (read-only).
    history = list(
        AiArchitectChatMessage.objects.filter(user=request.user, session_id=session_uuid)
        .order_by("-created_at")[:10]
    )
    history.reverse()
    history_messages = [
        {"role": row.role, "content": row.content[:6000]} for row in history if row.role in {"user", "assistant"}
    ]

    messages = [
        system_message,
        {"role": "system", "content": "Project context (JSON):\n" + json.dumps(context)[:14000]},
        *history_messages,
        {"role": "user", "content": user_message},
    ]

    AiArchitectChatMessage.objects.create(
        session_id=session_uuid, user=request.user, role="user", content=user_message
    )

    if direct_answer:
        assistant_text = str(direct_answer).strip()
        AiArchitectChatMessage.objects.create(
            session_id=session_uuid,
            user=request.user,
            role="assistant",
            content=assistant_text,
            meta={"source": "local_business_context"},
        )
        return JsonResponse(
            {
                "ok": True,
                "text": assistant_text,
                "model": "local-business-context",
                "usage": get_monthly_usage_snapshot(),
                "session_id": str(session_uuid),
            }
        )

    client = OpenAIClient(
        api_key=api_key,
        model=obj.model_name,
        organization_id=obj.openai_organization_id,
        project_id=obj.openai_project_id,
    )
    result = client.chat(messages=messages, max_tokens=_clamp_max_tokens(obj.max_tokens or DEFAULT_MAX_TOKENS))
    if not result.get("ok"):
        return JsonResponse({"ok": False, "error": "openai_error", "details": result.get("error", "")}, status=502)

    assistant_text = str(result.get("text") or "").strip()
    usage_meta = result.get("raw", {}).get("usage", {}) if isinstance(result.get("raw", {}), dict) else {}
    total_tokens = int(usage_meta.get("total_tokens") or 0)
    cost_inr = estimate_cost_inr_from_tokens(total_tokens)
    AiArchitectChatMessage.objects.create(
        session_id=session_uuid,
        user=request.user,
        role="assistant",
        content=assistant_text,
        meta={"usage": result.get("raw", {}).get("usage", {})},
    )
    AiArchitectUsageEvent.objects.create(
        user=request.user,
        session_id=session_uuid,
        total_tokens=max(0, total_tokens),
        cost_inr=cost_inr,
    )

    updated_usage = get_usage_summary(
        request.user,
        budget_inr=obj.monthly_budget_inr,
        warning_percent=obj.warning_threshold_percent,
        hard_stop_enabled=obj.hard_stop_enabled,
    )
    return JsonResponse(
        {
            "ok": True,
            "session_id": str(session_uuid),
            "text": assistant_text,
            "usage": updated_usage,
        }
    )
