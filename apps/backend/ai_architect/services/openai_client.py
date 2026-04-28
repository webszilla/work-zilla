from __future__ import annotations

import json
import re
import requests


class OpenAIClient:
    def __init__(self, api_key: str, model: str, timeout_seconds: int = 25):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def test_connection(self) -> dict:
        resp = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=self.timeout_seconds,
        )
        ok = resp.status_code == 200
        return {"ok": ok, "status_code": resp.status_code, "error": None if ok else _safe_error_text(resp)}

    def chat(self, messages: list[dict], max_tokens: int = 900) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.2,
        }
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=self.timeout_seconds,
        )
        if resp.status_code != 200:
            return {"ok": False, "status_code": resp.status_code, "error": _safe_error_text(resp), "text": ""}
        data = resp.json()
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return {"ok": True, "status_code": 200, "error": None, "text": text, "raw": {"usage": data.get("usage", {})}}


_KEY_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{8,}\b")


def _safe_error_text(resp) -> str:
    raw = ""
    try:
        raw = resp.text or ""
    except Exception:
        raw = ""
    # Prefer OpenAI JSON error message when present.
    try:
        payload = json.loads(raw) if raw else {}
        message = (
            payload.get("error", {}).get("message")
            or payload.get("message")
            or ""
        )
        if message:
            raw = message
    except Exception:
        pass
    raw = _KEY_RE.sub("sk-****masked", raw)
    return str(raw).strip()[:500]
