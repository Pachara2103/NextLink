from fastapi import APIRouter, Depends

from api.deps import current_user
from schemas.coordinator import Coordinator, CoordinatorCreate
from schemas.base import ListResponse, StatusResponse
from schemas.user import AuthUser
from services.coordinator import get_coordinators, sync_approve_and_create, decline, update_coordinator_pg

router = APIRouter(prefix="/coordinators", tags=["coordinator"])

@router.get("", response_model=ListResponse[Coordinator])
def get_coordinators_api(user: AuthUser = Depends(current_user)):
    return get_coordinators()

@router.post("/{id}/approve", response_model=StatusResponse)
def approve_coordinator_api(id: int, user: AuthUser = Depends(current_user)):
    sync_approve_and_create(id, user.id)
    return StatusResponse()

@router.delete("/{id}", response_model=StatusResponse)
def decline_coordinator_api(id: int, user: AuthUser = Depends(current_user)):
    decline(id)
    return StatusResponse()

@router.put("/{id}", response_model=StatusResponse)
def update_coordinator_api(payload: CoordinatorCreate, id: int, user: AuthUser = Depends(current_user)):
    update_coordinator_pg(payload, id=id, user_id=user.id)
    return StatusResponse()
