import base64
import hashlib
import hmac
import json
import logging
import secrets
import time

# Not left to import order: importing core.config is what guarantees .env has
# been read, so whether the secret is found does not depend on some other
# module having called load_dotenv() first.
from core.config import AUTH_SECRET, ENV_PATH
from uuid import UUID


class TokenError(Exception):
    """Raised when a token is missing, malformed, forged or expired."""


def _load_secret() -> bytes:
    if AUTH_SECRET:
        return AUTH_SECRET.encode("utf-8")

    # Without a configured secret every restart invalidates every session, and
    # uvicorn --reload restarts constantly. Loud, because it is a misconfig.
    logging.warning(
        "AUTH_SECRET is not set — generating an ephemeral one. Every restart "
        "will sign users out. Set AUTH_SECRET in %s.",
        ENV_PATH,
    )
    return secrets.token_bytes(32)


_SECRET = _load_secret()


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _sign(payload_b64: str) -> str:
    digest = hmac.new(_SECRET, payload_b64.encode("ascii"), hashlib.sha256).digest()
    return _b64encode(digest)


def issue_token(user_id: str, session_id: str, expires: int) -> str:
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "exp": expires,
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def verify_token(token: str) -> dict:
    """Return the payload, or raise TokenError. Never returns for a bad token."""
    if not token or len(token) > 2048 or not token.isascii() or token.count(".") != 1:
        raise TokenError("Malformed token")

    payload_b64, signature = token.split(".")

    # compare_digest, not ==, so a forged signature cannot be found byte by byte.
    if not hmac.compare_digest(signature, _sign(payload_b64)):
        raise TokenError("Bad signature")

    try:
        payload = json.loads(_b64decode(payload_b64))
    except (ValueError, json.JSONDecodeError) as e:
        raise TokenError("Unreadable payload") from e

    if not isinstance(payload, dict):
        raise TokenError("Unreadable payload")
    try:
        if not isinstance(payload["sub"], str) or not payload["sub"].isascii() or not payload["sub"].isdigit() or not 0 < int(payload["sub"]) < 2**63:
            raise ValueError()
        UUID(payload["sid"])
        if type(payload["exp"]) is not int:
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        raise TokenError("Unreadable payload") from None
    if payload["exp"] <= time.time():
        raise TokenError("Token expired")

    return payload
