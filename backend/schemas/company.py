from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import DocumentStatus
from pydantic import Field


class CompanyName(ApiBaseModel):
    company_th: str | None = Field(None, description="ชื่อบริษัทภาษาไทย")
    company_en: str | None = Field(None, description="ชื่อบริษัทภาษาอังกฤษ")
    # Nullable, not `default_factory=list`: the UPDATE coalesces on it, so a
    # caller that leaves aliases out keeps the ones already stored instead of
    # silently replacing them with an empty array.
    aliases: list[str] | None = Field(None, description="ชื่อเล่นบริษัท")

class Company(CompanyName, BaseTimestamp):
    id: int
    group_id: str | None
    is_linked: bool
    