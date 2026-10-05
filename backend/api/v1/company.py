from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile

from api.deps import current_user
from schemas.company import Company, CompanyName
from schemas.user import AuthUser
from schemas.base import ListResponse, StatusResponse
from schemas.mou import ImportResult
from core.exceptions import BadRequestError
from services.import_data import MAX_FILE_BYTES, flush_imported, import_mou_xlsx

from services.company import get_companies, sync_create_company, sync_update_company, sync_unlink_company, sync_link_company

router = APIRouter(prefix="/companies", tags=["company"])


@router.get("", response_model=ListResponse[Company])
def get_companies_api(user: AuthUser = Depends(current_user)):
    return get_companies()

# ต้องประกาศก่อน POST /{group_id} - ไม่งั้น "import" จะถูกจับเป็น group_id
@router.post("/import", response_model=ImportResult)
def import_companies_api(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: AuthUser = Depends(current_user),
):
    """นำเข้าไฟล์ MoU (.xlsx) -> companies + mous + employees ทีละแถว

    แถวไหนพังก็ rollback ทั้งแถว แล้วคืน No ของแถวนั้นใน failed
    งานเขียนกราฟ (บริษัท/คน) ยิงต่อเป็น background หลังตอบกลับแล้ว
    """
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise BadRequestError(message="รองรับเฉพาะไฟล์ .xlsx")
    content = file.file.read(MAX_FILE_BYTES + 1)
    result, imported = import_mou_xlsx(content, user_id=user.id)
    if imported:
        background_tasks.add_task(flush_imported, imported)
    return result


@router.post("/{group_id}", response_model=StatusResponse)
def create_company_api(payload: CompanyName, group_id: str, user: AuthUser = Depends(current_user)):
    sync_create_company(payload, group_id=group_id)
    return StatusResponse()


@router.put("/{id}", response_model=StatusResponse)
def update_company_api(payload: CompanyName, id: int, user: AuthUser = Depends(current_user)):
    sync_update_company(payload, id=id)
    return StatusResponse()

@router.post("/{id}/unlink", response_model=StatusResponse)
def unlink_company_api(id: int, user: AuthUser = Depends(current_user)):
    sync_unlink_company(id)
    return StatusResponse()

@router.post("/{id}/link", response_model=StatusResponse)
def link_company_api(id: int, group_id: str, user: AuthUser = Depends(current_user)):
    sync_link_company(id=id, group_id=group_id)
    return StatusResponse()