import base64
import hashlib

from django.conf import settings

from cryptography.fernet import Fernet, InvalidToken


def _fernet():
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_text(plain_text: str) -> str:
    if not plain_text:
        return ""
    token = _fernet().encrypt(plain_text.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_text(token: str) -> str:
    if not token:
        return ""
    try:
        value = _fernet().decrypt(token.encode("utf-8"))
        return value.decode("utf-8")
    except InvalidToken:
        return ""


def mask_api_key(api_key: str) -> str:
    raw = str(api_key or "").strip()
    if not raw:
        return ""
    tail = raw[-4:] if len(raw) >= 4 else raw
    return f"sk-****{tail}"

