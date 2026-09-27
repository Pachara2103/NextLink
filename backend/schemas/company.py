from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import DocumentStatus
from pydantic import Field


class CompanyName(ApiBaseModel):
    company_th: str | None = Field(None, description="ชื่อบริษัทภาษาไทย")
    company_en: str | None = Field(None, description="ชื่อบริษัทภาษาอังกฤษ")
    aliases: list[str] | None = Field(None, description="ชื่อเล่นบริษัท")
    
class Company(CompanyName, BaseTimestamp):
    id: int
    group_id: str | None
    