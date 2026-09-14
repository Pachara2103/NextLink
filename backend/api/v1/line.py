from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.line import LineGroup, UpdateInformationRequest, UpdateLog
from schemas.user import AuthUser
from schemas.base import ListResponse
from services.line import get_line_groups, update_information, get_update_logs

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