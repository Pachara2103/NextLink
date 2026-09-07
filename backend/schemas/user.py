from pydantic import Field

from schemas.api import ApiBaseModel


class LoginRequest(ApiBaseModel):
    username: str
    password: str


class AuthUser(ApiBaseModel):
    """Who a bearer token says the caller is — nothing more.

    This is what `Depends(current_user)` hands a route, so it holds only what
    the token itself proves. Anything that can change while a token is still
    valid (a display name, say) belongs on UserProfile, which is read from the
    database instead of decoded from the token.
    """

    id: str
    username: str


class UserProfile(AuthUser):
    """The signed-in user as the console shows them."""

    display_name: str | None = Field(None, description="ชื่อที่ผู้ใช้ตั้งเอง")


class ProfileUpdate(ApiBaseModel):
    """Body of `PUT /auth/me`. The only thing a user may change about itself."""

    display_name: str | None = Field(None, description="ชื่อที่ผู้ใช้ตั้งเอง")


class LoginResponse(ApiBaseModel):
    """accessToken/tokenType at the edge, like every other endpoint — the whole
    API speaks camelCase, so auth must not be the one exception the client has
    to special-case."""

    access_token: str
    token_type: str = "bearer"
    user: UserProfile
