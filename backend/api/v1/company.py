from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.company import Company, CompanyName
from schemas.user import AuthUser
from schemas.base import ListResponse, StatusResponse

from services.company import get_companies, sync_create_company, sync_update_company, sync_unlink_company, sync_link_company

router = APIRouter(prefix="/companies", tags=["company"])


@router.get("", response_model=ListResponse[Company])
def get_companies_api(user: AuthUser = Depends(current_user)):
    return get_companies()

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