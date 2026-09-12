"""Atomic login budgets; no reliance on frontend throttling or process memory."""
import hashlib
from ipaddress import ip_address, ip_network

from fastapi import Request
from core import config
from core.db import pg_db
from core.exceptions import TooManyAttemptsError


def client_address(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    trusted = [ip_network(value) for value in config.TRUSTED_PROXY_CIDRS]
    def is_trusted(value: str) -> bool:
        try:
            return any(ip_address(value) in network for network in trusted)
        except ValueError:
            return False
    if not is_trusted(peer):
        return peer
    # Strip only trusted hops from right to left, never trust the leftmost
    # caller-supplied value simply because a proxy also supplied a header.
    forwarded = request.headers.get("x-forwarded-for", "")
    if len(forwarded) > 2048:
        return peer
    for hop in reversed([part.strip() for part in forwarded.split(",")]):
        try:
            hop = str(ip_address(hop))
        except ValueError:
            return peer
        if not is_trusted(hop):
            return hop
    return peer


def enforce_login_budget(username: str, address: str) -> None:
    def key(kind: str, value: str) -> str:
        # Stable across processes and signing-key rotations. This is an opaque
        # counter key, not an authentication credential.
        return kind + ":" + hashlib.sha256(value.encode()).hexdigest()
    budgets = [
        ("global", config.LOGIN_GLOBAL_LIMIT, 60),
        (key("client", address), config.LOGIN_CLIENT_LIMIT, config.LOGIN_WINDOW_SECONDS),
        (key("account", username.strip().casefold()), config.LOGIN_ACCOUNT_LIMIT, config.LOGIN_WINDOW_SECONDS),
    ]
    retry_after = 0
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            # Global first bounds both hashing work and creation of account keys.
            for bucket, limit, window in budgets:
                cursor.execute(
                    """INSERT INTO auth_login_buckets(bucket_key, attempts, expires_at)
                       VALUES (%s, 1, now() + %s * interval '1 second')
                       ON CONFLICT(bucket_key) DO UPDATE SET
                         attempts = CASE WHEN auth_login_buckets.expires_at <= now()
                           THEN 1 ELSE LEAST(auth_login_buckets.attempts + 1, %s + 1) END,
                         expires_at = CASE WHEN auth_login_buckets.expires_at <= now()
                           THEN EXCLUDED.expires_at ELSE auth_login_buckets.expires_at END
                       RETURNING attempts, GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - now())))::int;""",
                    (bucket, window, limit),
                )
                attempts, remaining = cursor.fetchone()
                if attempts > limit:
                    retry_after = remaining
                    break
            cursor.execute("DELETE FROM auth_login_buckets WHERE bucket_key IN (SELECT bucket_key FROM auth_login_buckets WHERE expires_at <= now() LIMIT 100);")
        conn.commit()
    if retry_after:
        raise TooManyAttemptsError(retry_after)
