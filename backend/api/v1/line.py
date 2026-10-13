from fastapi import APIRouter, Depends, Query

from api.deps import current_user
from schemas.line import (
    CommitDraftRequest,
    CommitDraftResult,
    DraftComparison,
    LineGroup,
    LineSummaryDraft,
    UpdateInformationRequest,
    UpdateLog,
)
from schemas.user import AuthUser
from schemas.base import ListResponse, StatusResponse
from services.line import get_line_groups, update_information, get_update_logs
from services.line_draft import commit_draft, compare_draft, discard_draft, list_pending_drafts

router = APIRouter(prefix="/line", tags=["line"])

@router.get("/groups", response_model=ListResponse[LineGroup])
def get_line_groups_api(user: AuthUser = Depends(current_user)):
    return  get_line_groups()


@router.get("/update_logs", response_model=ListResponse[UpdateLog])
def get_update_logs_api(user: AuthUser = Depends(current_user)):
    return get_update_logs()

@router.post("/update-information", response_model=ListResponse[str])
def update_information_api(
    payload: UpdateInformationRequest, user: AuthUser = Depends(current_user)
):
    """สรุปข้อมูลจากแชตของกลุ่มที่ console ส่งมาใน groupData

    body ไม่ใช่ของเสริม: กลุ่มที่ไม่อยู่ใน groupData จะไม่ถูกสรุป จอเป็นคน
    ตัดสินว่ารอบนี้ทำกลุ่มไหนบ้าง เพราะมันถือข้อมูลกลุ่ม+บริษัทอยู่แล้ว
    """
    return update_information(user.id, payload.group_data)


@router.get("/summary-drafts", response_model=ListResponse[LineSummaryDraft])
def list_summary_drafts_api(user: AuthUser = Depends(current_user)):
    """ร่างผลสรุปของกลุ่มที่ยังไม่ได้ผูกบริษัท ที่รอ user ตัดสินใจ

    แต่ละร่างแนบ candidates = บริษัทเดิมที่น่าจะเป็นบริษัทเดียวกัน (เรียงคะแนนมากไปน้อย)
    """
    return list_pending_drafts()


@router.get("/summary-drafts/{draft_id}/compare", response_model=DraftComparison)
def compare_summary_draft_api(
    draft_id: int,
    company_id: int = Query(..., alias="companyId"),
    user: AuthUser = Depends(current_user),
):
    """ผู้ประสานงานในร่าง เทียบกับคนที่มีอยู่แล้วในบริษัทที่เลือก (ไม่เขียนอะไร)

    แต่ละคนมี suggestedAction = link (น่าจะเป็นคนเดิม) / create (คนใหม่)
    ให้จอแสดงให้ user ติ๊กก่อนส่ง coordinators ไปกับ commit
    """
    return compare_draft(draft_id, company_id)


@router.post("/summary-drafts/{draft_id}/commit", response_model=CommitDraftResult)
def commit_summary_draft_api(
    draft_id: int, payload: CommitDraftRequest, user: AuthUser = Depends(current_user)
):
    """ผูกกับบริษัทเดิม (mode=existing) หรือสร้างใหม่ (mode=new) แล้วบันทึก
    ผู้ประสานงานในร่างเป็น employees สถานะ pending - ทั้งหมดใน transaction เดียว
    """
    return commit_draft(draft_id, payload, user.id)


@router.post("/summary-drafts/{draft_id}/discard", response_model=StatusResponse)
def discard_summary_draft_api(draft_id: int, user: AuthUser = Depends(current_user)):
    discard_draft(draft_id, user.id)
    return StatusResponse()

