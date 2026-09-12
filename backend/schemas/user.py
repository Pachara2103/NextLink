from pydantic import Field

from schemas.api import ApiBaseModel


class LoginRequest(ApiBaseModel):
    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=1024)


class AuthUser(ApiBaseModel):
    """Identity confirmed by an active, revocable backend session."""

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
