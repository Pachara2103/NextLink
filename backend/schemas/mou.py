from datetime import date

from pydantic import Field

from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp
from schemas.enums import DocumentStatus


class MouBase(ApiBaseModel):
    """หนึ่งแถวของตาราง mous (หนึ่งบริษัทมีได้หนึ่งแถว - uq_mous_company_id)"""

    company_id: int
    document_status: DocumentStatus = Field(..., description="สถานะเอกสาร")
    is_authorized: bool | None = Field(None, description="สถานะมอบอำนาจ")

    is_edited: bool | None = Field(None, description="แก้ไข")
    mou_template: str | None = Field(None, description="อว. (Template MoU)")

    company_revision_doc: str | None = Field(None, description="คพ.บันทึกขอตรวจแก้ MoU")
    company_revision_date: date | None = Field(None, description="วันที่ บันทึกขอตรวจแก้ MoU")

    legal_review_result: str | None = Field(None, description="อว.ผลพิจารณาจากศูนย์กฎหมาย")
    legal_review_date: date | None = Field(None, description="วันที่ อว.ผลพิจารณาจากศูนย์กฎหมาย")

    pre_auth_approval_doc: str | None = Field(None, description="คพ.บันทึกส่งอนุมัติก่อนมอบอำนาจ")
    pre_auth_approval_date: date | None = Field(None, description="วันที่ บันทึกส่งอนุมัติก่อนมอบอำนาจ")

    pre_auth_status: str | None = Field(None, description="อว.อนุมัติก่อนมอบอำนาจ")
    pre_auth_status_date: date | None = Field(None, description="วันที่ อว.อนุมัติก่อนมอบอำนาจ")

    power_of_attorney_doc: str | None = Field(None, description="คพ.ขอมอบอำนาจ")
    power_of_attorney_date: date | None = Field(None, description="วันที่ บันทึกขอมอบอำนาจ")


class Mou(MouBase, BaseTimestamp):
    id: int


class ImportRowError(ApiBaseModel):
    """แถวที่นำเข้าไม่สำเร็จ - no คือค่าในคอลัมน์ No ของไฟล์ (ไม่มีก็เป็นเลขแถวใน excel)"""

    no: str
    message: str


class ImportResult(ApiBaseModel):
    total: int = Field(0, description="จำนวนแถวที่มีข้อมูลในไฟล์")
    success: int = Field(0, description="จำนวนแถวที่เพิ่มสำเร็จครบทั้ง 3 ตาราง")
    failed: list[ImportRowError] = Field(default_factory=list)
