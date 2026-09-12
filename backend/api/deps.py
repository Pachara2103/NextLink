"""Dependencies shared by every versioned router."""

from fastapi import Depends, Header

from core.auth import TokenError
from core.exceptions import InvalidTokenError, MissingTokenError
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
