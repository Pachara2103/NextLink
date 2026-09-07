from pydantic import Field
from schemas.company import CompanyName
from schemas.coordinator import CoordinatorCreate


class ExtractionList(CompanyName):
    contacts: list[CoordinatorCreate] = Field(
        default_factory=list,
        description="รายการข้อมูลผู้ประสานงานทั้งหมดที่พบในแชท",
    )