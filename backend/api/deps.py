"""Dependencies shared by every versioned router."""

from fastapi import Depends, Header
from psycopg2 import errors

from core.auth import TokenError
from core.db import nl_db
from core.exceptions import AppException, InvalidTokenError, MissingTokenError
from schemas.user import AuthUser
from services.sessions import SessionIdentity, authenticate_session


def current_session(authorization: str | None = Header(default=None)) -> SessionIdentity:
    """Every data endpoint depends on this. No token, no data.

    401 (not 403) on every failure, because the client's answer is always the
    same: throw the session away and go back to the login page.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise MissingTokenError()

    try:
        return authenticate_session(authorization.split(" ", 1)[1].strip())
    except TokenError as e:
        raise InvalidTokenError() from e


def current_user(session: SessionIdentity = Depends(current_session)) -> AuthUser:
    return AuthUser(id=session.id, username=session.username)


def friday_staff(session: SessionIdentity = Depends(current_session)) -> SessionIdentity:
    """Assigned active staff/admin share Friday data; account roles stay server-side."""
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            try:
                cursor.execute("SELECT role, is_active FROM users WHERE id=%s;", (session.id,))
                row = cursor.fetchone()
            except (errors.UndefinedColumn, errors.UndefinedTable) as exc:
                raise AppException(
                    message="Friday ยังไม่พร้อมใช้งาน กรุณาให้ผู้ดูแลรัน migration ที่ตรงกับรุ่นนี้", status_code=503,
                ) from exc
        conn.rollback()
    if row is None or not row[1]:
        raise InvalidTokenError()
    if row[0] not in {"staff", "admin"}:
        raise AppException(message="บัญชีนี้ยังไม่ได้รับสิทธิ์เจ้าหน้าที่ Friday กรุณาติดต่อผู้ดูแล", status_code=403)
    return session
