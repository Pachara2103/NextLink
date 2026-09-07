import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional
from pydantic import BaseModel
from ai.graph import get_graph, route_category
from core.exceptions import BadRequestError
from schemas.ai import AgentStep
from schemas.chat_history import ChatHistory
from schemas.enums import ChatRole
from services.chat_history import save_chat_history
from datetime import datetime
 
logger = logging.getLogger(__name__)


node_mapping = {
    "classify": "กำลังทำความเข้าใจคำถาม",
    "search_contact": "กำลังค้นหาข้อมูลผู้ติดต่อ",
    "mou": "กำลังค้นหาสถานะ MOU",
    "agent": "กำลังเรียบเรียงคำตอบ",
}

NODE_STEP = {
    "classify": "classify",
    "search_contact": "search",
    "mou": "search",
    "agent": "agent",
}

STEP_LABELS = {
    "classify": "กำลังทำความเข้าใจคำถาม",
    "search": "กำลังค้นหาข้อมูลในระบบ",
    "agent": "กำลังเรียบเรียงคำตอบ",
}
SKIPPED_SEARCH_LABEL = "ข้ามการค้นหาข้อมูลในระบบ"

STEP_ORDER = ("classify", "search", "agent")

FAILED_ANSWER = "เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้งอีกครั้งค่ะ"
EMPTY_QUESTION = "กรุณาพิมพ์คำถามก่อนส่งนะคะ"

@dataclass
class AgentEvent:
    """One thing worth telling the console about.

    type is one of:
      "plan"   — the whole checklist, once, before the first step
      "step"   — one line of it changed state
      "answer" — the saved ChatHistory; always the last event of a good run
      "error"  — the run cannot continue; nothing else follows
    """

    type: str
    data: Any


def _step_event(key: str, label: str, state: str) -> AgentEvent:
    return AgentEvent("step", AgentStep(key=key, label=label, state=state))


def _initial_plan() -> AgentEvent:
    steps = [AgentStep(key=k, label=STEP_LABELS[k], state="pending") for k in STEP_ORDER]
    return AgentEvent("plan", {"steps": [s.model_dump(by_alias=True) for s in steps]})


async def _save(user_id: int, role: ChatRole, message: str) -> Optional[ChatHistory]:
    
    try:
        return await asyncio.to_thread(save_chat_history, user_id, role, message)
    except Exception:
        logger.exception("chat_histories insert failed (user_id=%s, role=%s)", user_id, role)
        return None

async def stream_agent(user_id: int, question: str) -> AsyncIterator[AgentEvent]:
    question = (question or "").strip()
    if not question:
        yield AgentEvent("error", {"message": EMPTY_QUESTION})
        return

    await _save(user_id, ChatRole.USER, question)

    yield _initial_plan()
    yield _step_event("classify", node_mapping["classify"], "active")

    answer: str | None = None
    total_tokens = 0
    config = {"configurable": {"thread_id": str(user_id)}}

    try:
        graph = get_graph()
        async for chunk in graph.astream({"question": question}, config=config, stream_mode="updates"):
            for node_name, update in (chunk or {}).items():
                if not isinstance(update, dict):
                    update = {}

                total_tokens += int(update.get("total_tokens") or 0)
                if update.get("answer"):
                    answer = update["answer"]

                step = NODE_STEP.get(node_name)
                if step:
                    label = node_mapping.get(node_name, STEP_LABELS[step])
                    yield _step_event(step, label, "done")

                if node_name == "classify":
                    nxt = route_category(update)
                    if nxt == "agent":
                        yield _step_event("search", SKIPPED_SEARCH_LABEL, "skipped")
                        yield _step_event("agent", STEP_LABELS["agent"], "active")
                    else:
                        yield _step_event("search", node_mapping.get(nxt, STEP_LABELS["search"]), "active")
                elif step == "search":
                    yield _step_event("agent", STEP_LABELS["agent"], "active")

    except Exception:
        logger.exception("agent run failed (user_id=%s)", user_id)
        answer = None

    if not answer:
        answer = FAILED_ANSWER

    saved = await _save(user_id, ChatRole.AI, answer)
    if saved is None:
        saved = ChatHistory(
            id=0,
            user_id=user_id,
            role=ChatRole.AI,
            message=answer,
            # total_tokens=total_tokens,
            created_at=datetime.now(),
        )
    # else:
    #     saved.total_tokens = total_tokens

    yield AgentEvent("answer", saved)


def _payload(data: Any) -> Any:
    if isinstance(data, BaseModel):
        return data.model_dump(by_alias=True, mode="json")
    return data


async def sse_agent(user_id: int, question: str) -> AsyncIterator[str]:
    yield ": ok\n\n"

    try:
        async for event in stream_agent(user_id, question):
            data = json.dumps(_payload(event.data), ensure_ascii=False, default=str)
            yield f"event: {event.type}\ndata: {data}\n\n"
    except asyncio.CancelledError:
        # The user pressed หยุด, or closed the tab. Nothing to report.
        raise
    except Exception:
        logger.exception("agent stream failed (user_id=%s)", user_id)
        data = json.dumps({"message": FAILED_ANSWER}, ensure_ascii=False)
        yield f"event: error\ndata: {data}\n\n"


