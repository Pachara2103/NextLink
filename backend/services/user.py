import logging

import bcrypt

from core.db import pg_db
from core.exceptions import (
    BadRequestError,
    InvalidCredentialsError,
    NotFoundError,
    PasswordHashError,
)
from schemas.user import UserProfile

logger = logging.getLogger(__name__)

GET_USER_BY_USERNAME = (
    "SELECT id, username, display_name, password FROM users WHERE username = %s;"
)
GET_PROFILE_BY_ID = "SELECT id, username, display_name FROM users WHERE id = %s;"


def _profile(row: tuple) -> UserProfile:
    user_id, username, display_name = row
    return UserProfile(id=str(user_id), username=username, display_name=display_name)


def login(username: str, password: str) -> UserProfile:
    if not username or not password:
        raise InvalidCredentialsError()

    try:
        # get_connection, not the get_cursor helper that used to live in
        # core/db.py — that name is gone, and calling it here raised
        # AttributeError inside the try, which surfaced as a 500 on every login.
        with pg_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(GET_USER_BY_USERNAME, (username,))
                result = cursor.fetchone()
    except Exception as e:
        logger.error("[Login Error] user lookup failed: %s", e)
        raise e

    if not result:
        raise InvalidCredentialsError()

    user_id, found_username, display_name, stored_hash = result

    try:
        matched = bcrypt.checkpw(
            password.encode("utf-8"), stored_hash.encode("utf-8")
        )
    except (ValueError, TypeError, AttributeError) as e:
        # A row whose password column is not a bcrypt hash. Not the caller's
        # fault, and not something a retry fixes.
        logger.error("[Login Error] stored hash for %s is unusable: %s", username, e)
        raise PasswordHashError() from e

    if not matched:
        raise InvalidCredentialsError()

    return _profile((user_id, found_username, display_name))


def get_profile(user_id: str) -> UserProfile:
    """Read the profile fresh rather than trusting the token.

    The token is signed once at login and never reissued, so a display name the
    user changed afterwards only shows up if it is read from the database.
    """
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(GET_PROFILE_BY_ID, (user_id,))
            row = cursor.fetchone()
            if not row:
                raise NotFoundError(message="ไม่พบข้อมูลผู้ใช้")
            return _profile(row)


def update_display_name(user_id: str, display_name: str | None) -> UserProfile:
    """Blank collapses to NULL, which the console renders as "ยังไม่มีชื่อ" —
    so clearing the field is a real choice, not a validation error."""
    cleaned = (display_name or "").strip() or None

    if cleaned is not None and len(cleaned) > 80:
        raise BadRequestError(message="ชื่อยาวเกินไป (ไม่เกิน 80 ตัวอักษร)")

    query = """
        UPDATE users
        SET display_name = %(display_name)s,
            updated_at = now()
        WHERE id = %(id)s
        RETURNING id, username, display_name;
    """

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, {"id": user_id, "display_name": cleaned})
            row = cursor.fetchone()
            if not row:
                raise NotFoundError(message="ไม่พบข้อมูลผู้ใช้")
        conn.commit()

    return _profile(row)
