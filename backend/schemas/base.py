
from schemas.api import ApiBaseModel
from pydantic import Field
from schemas.enums import RelevantType
from datetime import datetime
from typing import Literal

class BasePersonName(ApiBaseModel):
    name_th: str | None = Field(None, description="ชื่อภาษาไทย")
    name_en: str | None = Field(None, description="ชื่อภาษาอังกฤษ")
    nickname: str | None = Field(None, description="ชื่อเล่น")

class BaseContactInfo(ApiBaseModel):
    relevant: RelevantType | None = Field(None, description="ความเกี่ยวข้องกับบริษัท")
    job_title: str | None = Field(None, description="ตำแหน่งงาน")
    phone: str | None = Field(None, description="เบอร์โทรศัพท์")
    email: str | None = Field(None, description="อีเมล")

class ListResponse[T](ApiBaseModel):
    items: list[T]
    total: int | None = None

class BaseTimestamp(ApiBaseModel):
    created_at: datetime | None 
    updated_at: datetime | None

class StatusResponse(ApiBaseModel):
    """The one shape every write that has nothing to return answers with.
    `response_model=dict` told OpenAPI nothing, so the client had to guess."""
    status: Literal["success"] = "success"
