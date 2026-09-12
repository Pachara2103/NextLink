"""Sign in, identity check, profile edit, sign out."""

from fastapi import APIRouter, Depends, Request

from api.deps import current_session, current_user
from schemas.base import StatusResponse
from schemas.user import AuthUser, LoginRequest, LoginResponse, ProfileUpdate, UserProfile
from services.user import get_profile, login, update_display_name
from services.login_limits import client_address
from services.sessions import SessionIdentity, create_session, revoke_session

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login_api(payload: LoginRequest, request: Request):
    """Bad credentials and a broken lookup have to stay distinguishable — see
    the docstring on login(). Both leave here as AppException subclasses with
    their own status, so no try/except is needed."""
    user, password_hash = login(payload.username, payload.password, client_address(request))

    return LoginResponse(
        access_token=create_session(user.id, password_hash),
        user=user,
    )


@router.get("/me", response_model=UserProfile)
def me_api(user: AuthUser = Depends(current_user)):
    """Lets the console check a stored token before it renders anything.

    Reads the row rather than echoing the token, because the token is signed
    once at login: a display name changed since then would otherwise never
    reach a client that reloads with a still-valid token.
    """
    return get_profile(user.id)


@router.put("/me", response_model=UserProfile)
def update_me_api(payload: ProfileUpdate, user: AuthUser = Depends(current_user)):
    """The signed-in user renames itself. The id comes from the token, never
    from the body, so this cannot be pointed at somebody else's row."""
    return update_display_name(user.id, payload.display_name)


@router.post("/logout", response_model=StatusResponse)
def logout_api(session: SessionIdentity = Depends(current_session)):
    """Revoke only the presented session, including copies held elsewhere."""
    revoke_session(session.session_id)
    return StatusResponse()
