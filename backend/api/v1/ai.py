from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ai.services.ai import sse_agent
from api.deps import current_user
from schemas.ai import ChatAsk
from schemas.user import AuthUser

router = APIRouter(prefix="/agent", tags=["agent"])

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

@router.post("/call/stream")
async def stream_agent_api(payload: ChatAsk, user: AuthUser = Depends(current_user)):
    return StreamingResponse(
        sse_agent(user.id, payload.question),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )