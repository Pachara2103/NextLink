from pydantic import Field
from schemas.company import CompanyName
from schemas.employee import EmployeeExtraction


class ExtractionList(CompanyName):
    contacts: list[EmployeeExtraction] = Field(
        default_factory=list,
        description="รายการข้อมูลผู้ประสานงานทั้งหมดที่พบในแชท",
    )