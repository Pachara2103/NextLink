from schemas.base import BaseTimestamp
from schemas.company import CompanyName
from schemas.api import ApiBaseModel
from pydantic import Field
from datetime import datetime


class LineGroup(BaseTimestamp, CompanyName):
    group_id: str
    display_name: str | None
    is_linked: bool
    company_id: int | None
    picture_url: str | None
    
class UpdateLog(ApiBaseModel):
    """One press of "อัปเดตข้อมูล", with the groups that pass could not finish.

    display_name is the *user's* name, joined in from users — the console lists
    who ran the update, not which group it ran on. error_groups is never null on
    the way out: the column defaults to '{}', and a run with nothing wrong is
    an empty list rather than a missing field the client has to guard.
    """

    id: int
    user_id: int
    display_name: str | None
    error_groups: list[str] = Field(default_factory=list, description="ชื่อกลุ่มไลน์ที่สรุปข้อมูลไม่สำเร็จ")
    created_at: datetime