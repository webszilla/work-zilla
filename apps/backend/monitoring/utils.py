import secrets

from django.contrib.auth.hashers import check_password, make_password

from .models import ServerNode


def hash_token(raw_token: str) -> str:
    return make_password(raw_token)


def verify_token(raw_token: str, token_hash: str) -> bool:
    if not raw_token or not token_hash:
        return False
    return check_password(raw_token, token_hash)


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def get_server_from_token(raw_token: str):
    if not raw_token:
        return None
    for server in ServerNode.objects.filter(is_active=True).only("id", "token_hash"):
        if verify_token(raw_token, server.token_hash):
            return server
    return None
