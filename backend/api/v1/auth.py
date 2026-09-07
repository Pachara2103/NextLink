"""Sign in, identity check, profile edit, sign out."""

from fastapi import APIRouter, Depends

from api.deps import current_user
from core.auth import issue_token
from schemas.base import StatusResponse
from schemas.user import AuthUser, LoginRequest, LoginResponse, ProfileUpdate, UserProfile
from services.user import get_profile, login, update_display_name

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login_api(payload: LoginRequest):
    """Bad credentials and a broken lookup have to stay distinguishable — see
    the docstring on login(). Both leave here as AppException subclasses with
    their own status, so no try/except is needed."""
    user = login(payload.username, payload.password)

    return LoginResponse(
        access_token=issue_token(user.id, user.username),
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
def logout_api(user: AuthUser = Depends(current_user)):
    """Tokens are stateless and self-expiring, so there is nothing to revoke
    here — the client dropping the token IS the logout. This endpoint exists so
    that stays true from one place, and so a future denylist has a home."""
    return StatusResponse()
