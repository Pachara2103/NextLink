from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.line import LineGroup, UpdateLog
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
def update_information_api(user: AuthUser = Depends(current_user)):
    return update_information(user.id)