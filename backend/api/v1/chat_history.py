
from fastapi import APIRouter, Depends
from api.deps import current_user
from schemas.user import AuthUser
from schemas.base import ListResponse
from schemas.chat_history import ChatHistory
from services.chat_history import get_chat_histories

router = APIRouter(prefix="/chat_histories", tags=["agent"])

@router.get("", response_model=ListResponse[ChatHistory])
def get_chat_histories_api(user: AuthUser = Depends(current_user)):
    return get_chat_histories(user.id)
