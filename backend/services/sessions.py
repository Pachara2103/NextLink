"""Revocable sessions shared by all backend instances through PostgreSQL."""
from dataclasses import dataclass
import time
from uuid import uuid4

from core import config
from core.auth import issue_token, verify_token
from core.db import pg_db
from core.exceptions import InvalidTokenError


@dataclass(frozen=True)
class SessionIdentity:
    id: str
    username: str
    session_id: str


def create_session(user_id: str, password_hash: str) -> str:
    session_id = str(uuid4())
    expires = int(time.time()) + config.TOKEN_TTL_SECONDS
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            # A concurrent password change must not turn an old password check
            # into a session bound to the new credential.
            cursor.execute(
                """INSERT INTO auth_sessions(session_id, user_id, password_hash, expires_at)
                   SELECT %s, id, password, to_timestamp(%s) FROM users
                   WHERE id = %s AND password = %s RETURNING user_id;""",
                (session_id, expires, user_id, password_hash),
            )
            if not cursor.fetchone():
                raise InvalidTokenError()
            cursor.execute("DELETE FROM auth_sessions WHERE session_id IN (SELECT session_id FROM auth_sessions WHERE expires_at <= now() LIMIT 100);")
        conn.commit()
    return issue_token(user_id, session_id, expires)


def authenticate_session(token: str) -> SessionIdentity:
    payload = verify_token(token)
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT u.id, u.username FROM auth_sessions s
                   JOIN users u ON u.id = s.user_id
                   WHERE s.session_id = %s AND s.user_id = %s
                     AND s.expires_at > now() AND s.password_hash = u.password;""",
                (payload["sid"], payload["sub"]),
            )
            row = cursor.fetchone()
        conn.rollback()  # End the read transaction before returning to the pool.
    if row is None:
        raise InvalidTokenError()
    return SessionIdentity(str(row[0]), row[1], payload["sid"])


def revoke_session(session_id: str) -> None:
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM auth_sessions WHERE session_id = %s;", (session_id,))
        conn.commit()
