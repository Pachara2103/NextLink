from schemas.base import BaseTimestamp
from schemas.company import CompanyName
from schemas.employee import Employee, EmployeeExtraction
from schemas.api import ApiBaseModel
from pydantic import Field, model_validator
from datetime import datetime
from typing import Literal


class LineGroup(BaseTimestamp):
    group_id: str
    display_name: str | None
    picture_url: str | None


class GroupInfo(BaseTimestamp, CompanyName):
    group_id: str
    display_name: str | None
    has_company: bool
    company_id: int | None
    picture_url: str | None


class UpdateInformationRequest(ApiBaseModel):
    """body ของ POST /line/update-information

    group_data: key = group_id, value = GroupInfo ของกลุ่มนั้น กลุ่มที่ไม่ได้
    ส่งมาจะไม่ถูกสรุปในรอบนี้
    """

    group_data: dict[str, GroupInfo] = Field(
        default_factory=dict, description="ข้อมูลกลุ่มไลน์ที่ merge กับบริษัทแล้ว key = groupId"
    )


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


# --------------------------------------------------------------------------- #
# line_summary_drafts - ผลสรุปของกลุ่มที่ยังไม่ได้ผูกบริษัท รอ user ตัดสินใจ
# (ดู migrations/line_summary_drafts.sql และ services/line_draft.py)
# --------------------------------------------------------------------------- #

DraftStatus = Literal["pending", "committed", "discarded"]


class DraftPayload(CompanyName):
    """สิ่งที่เก็บใน line_summary_drafts.payload (JSONB)

    ชื่อบริษัทกับรายชื่อผู้ประสานงานตามที่ AI สรุปได้ + ชื่อกลุ่มไลน์ตอนที่สรุป
    (ไว้ใช้เดาบริษัทเดิม และแสดงบนจอโดยไม่ต้องข้ามไปอ่าน line_db)
    """

    group_name: str | None = None
    contacts: list[EmployeeExtraction] = Field(default_factory=list)


class CompanyCandidate(ApiBaseModel):
    """บริษัทที่มีอยู่แล้วซึ่งน่าจะเป็นบริษัทเดียวกับในร่าง"""

    company_id: int
    company_th: str | None
    company_en: str | None
    aliases: list[str] | None = None
    # ไม่ null = บริษัทนี้ผูกกับกลุ่มไลน์อื่นอยู่ ถ้าเลือกจะย้ายมาผูกกลุ่มนี้แทน
    group_id: str | None = None
    score: float = Field(description="0-1 ยิ่งสูงยิ่งน่าจะเป็นบริษัทเดียวกัน")
    reasons: list[str] = Field(default_factory=list)


class LineSummaryDraft(BaseTimestamp):
    id: int
    group_id: str
    status: DraftStatus
    group_name: str | None = None
    company_th: str | None = None
    company_en: str | None = None
    aliases: list[str] | None = None
    contacts: list[EmployeeExtraction] = Field(default_factory=list)
    candidates: list[CompanyCandidate] = Field(default_factory=list)
    created_by: int | None = None


CoordinatorAction = Literal["create", "link", "skip"]


class CoordinatorDecision(ApiBaseModel):
    """สิ่งที่ user เลือกให้ผู้ประสานงานคนหนึ่งในร่าง (อ้างด้วยลำดับใน contacts)

    create: บันทึกเป็น employee ใหม่ (status pending)
    link:   เป็นคนเดียวกับ employee_id ที่มีอยู่แล้วในบริษัทนั้น - ไม่สร้างแถวใหม่
            เติมเฉพาะช่องที่แถวเดิมยังว่าง (ไม่ทับข้อมูลที่มีอยู่)
    skip:   ไม่บันทึกคนนี้
    data:   ข้อมูลที่ user แก้บนจอ (ถ้าไม่ส่ง ใช้ตามที่ AI สรุปไว้ในร่าง)
    """

    index: int = Field(ge=0, description="ลำดับของคนใน contacts ของร่าง เริ่มที่ 0")
    action: CoordinatorAction
    employee_id: int | None = None
    data: EmployeeExtraction | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.action == "link" and not self.employee_id:
            raise ValueError("ต้องระบุ employeeId เมื่อเลือกว่าเป็นคนเดิม")
        return self


class CommitDraftRequest(ApiBaseModel):
    """body ของ POST /line/summary-drafts/{id}/commit

    mode = "existing": ผูกกลุ่มไลน์ + ผู้ประสานงานเข้ากับ company_id ที่เลือก
    mode = "new": สร้างบริษัทใหม่ ใช้ชื่อใน company ถ้าส่งมา (user แก้บนจอ)
    ไม่งั้นใช้ชื่อที่ AI สรุปไว้ในร่าง

    coordinators: การตัดสินใจรายคน คนที่ไม่ได้ระบุ -> ระบบตัดสินเอง
    (ซ้ำกับคนในบริษัทด้วยอีเมล/เบอร์/ชื่อ = ข้าม, ไม่ซ้ำ = สร้าง)
    """

    mode: Literal["existing", "new"]
    company_id: int | None = None
    company: CompanyName | None = None
    coordinators: list[CoordinatorDecision] | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.mode == "existing" and not self.company_id:
            raise ValueError("ต้องระบุ companyId เมื่อเลือกผูกกับบริษัทเดิม")
        decisions = self.coordinators or []
        if len({d.index for d in decisions}) != len(decisions):
            raise ValueError("ผู้ประสานงานคนเดียวกันถูกระบุซ้ำ")
        if self.mode == "new" and any(d.action == "link" for d in decisions):
            raise ValueError("บริษัทใหม่ยังไม่มีผู้ประสานงานเดิมให้ผูก")
        return self


class ContactMatch(ApiBaseModel):
    """ผู้ประสานงานในร่างหนึ่งคน เทียบกับคนที่มีอยู่แล้วในบริษัทที่เลือก"""

    index: int
    contact: EmployeeExtraction
    # employee ที่น่าจะเป็นคนเดียวกัน (null = ไม่พบ น่าจะเป็นคนใหม่)
    employee_id: int | None = None
    matched_by: list[str] = Field(default_factory=list, description="อีเมล / เบอร์โทร / ชื่อ ที่ตรงกัน")
    suggested_action: CoordinatorAction


class DraftComparison(ApiBaseModel):
    """GET /line/summary-drafts/{id}/compare?companyId= - ใช้ตอน user เลือกบริษัทเดิม"""

    draft_id: int
    company_id: int
    existing: list[Employee] = Field(default_factory=list)
    matches: list[ContactMatch] = Field(default_factory=list)


class CommitDraftResult(ApiBaseModel):
    draft_id: int
    company_id: int
    company_created: bool
    created_employees: int
    linked_employees: int = Field(0, description="ผูกกับคนเดิมในบริษัท (เติมช่องที่ว่าง) ไม่สร้างแถวใหม่")
    skipped_duplicates: int = Field(
        description="ผู้ประสานงานที่ไม่ได้บันทึก: ซ้ำกับคนในบริษัทนั้น หรือ user เลือกข้าม"
    )
