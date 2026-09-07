from schemas.api import ApiBaseModel
from schemas.enums import ChatRole
from datetime import datetime
    
class ChatHistoryCreate(ApiBaseModel):
    user_id: int
    role: ChatRole
    message: str

class ChatHistory(ChatHistoryCreate):
    id: int
    created_at: datetime