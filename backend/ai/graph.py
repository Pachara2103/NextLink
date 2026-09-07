# ไม่มี sys.path.append("..") และ load_dotenv() ที่นี่แล้ว: อันแรกผูกกับ CWD
# (รันจากโฟลเดอร์อื่นแล้ว import เพี้ยน) อันหลังย้ายไปอยู่ core/config.py
# ซึ่ง core.ai import ให้อยู่แล้ว
import operator
from typing import TypedDict, Dict, Any, Annotated
from langgraph.graph import StateGraph, START, END
from ai.chains.classify import get_classify_chain
from schemas.enums import QuestionCategory
from ai.services.search import get_person_contact,search_company, get_mou_status
from core.ai import get_llm
from ai.services.prompt import get_rag_prompt, get_other_prompt
import logging
import threading

logger = logging.getLogger(__name__)

# retry เฉพาะของที่พังชั่วคราว (429 quota / 503 / timeout)
LLM_RETRY = {"stop_after_attempt": 3, "wait_exponential_jitter": True}


def _llm():
    """LLM + retry

    เรียกทุกครั้งที่ใช้ได้ ไม่แพง: get_llm() คืน instance เดิมของ process
    และ with_retry() เป็น wrapper บาง ๆ ไม่ได้โหลดโมเดลใหม่

    ที่ไม่เก็บไว้เป็นตัวแปร module-level เพราะการเรียก get_llm() ตอน import
    ทำให้ไฟล์นี้ import ไม่ผ่านเมื่อไม่มี GOOGLE_API_KEY ซึ่งลากทั้ง API ล้ม
    """
    return get_llm().with_retry(**LLM_RETRY)

class AgentState(TypedDict):
    question: str

    category: QuestionCategory | None
    person_name: str | None
    company_name: str | None
    context: list[Any] | None
    answer: str | None
    total_tokens: Annotated[int, operator.add]


def _token_count(usage: Any) -> int:
    if not usage:
        return 0
    if isinstance(usage, dict):
        return int(usage.get("total_tokens") or 0)
    return int(getattr(usage, "total_tokens", 0) or 0)

def _answer_text(response: Any) -> str:
    content = response.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):  
        return "".join(
            b.get("text", "") if isinstance(b, dict) else str(b) for b in content
        ).strip()
    return str(content).strip()

def classify_node(state: AgentState) ->  Dict[str, Any]:
    response = get_classify_chain().invoke({"question": state["question"]})
    result = response["parsed"].model_dump()
    usage = response["raw"].usage_metadata

    return {
        "category": result["category"],
        "person_name": result["person_name"],
        "company_name": result["company_name"],
        "total_tokens": _token_count(usage),
    }

def search_contact_node(state: AgentState) -> Dict[str, Any]:
    person_name = state.get("person_name")
    if not person_name:
        return {"context": None}

    try:
        return {"context": get_person_contact(person_name)}
    except Exception:
        logger.exception("search_contact failed (person_name=%s)", person_name)
        return {"context": None}


def search_mou_node(state: AgentState) -> Dict[str, Any]:
    company_name = state.get("company_name")
    if not company_name:
        return {"context": None}

    try:
        company_list  = search_company(company_name)
        return {"context":  get_mou_status(company_list)}
    except Exception:
        logger.exception("search_mou_node failed (company_name=%s)", company_name)
        return {"context": None}

def agent_node(state: AgentState) -> Dict[str, Any]:
    question = state["question"]
    context = state.get("context")
    
    if context:
        prompt = get_rag_prompt(context, question)
    else:
        prompt = get_other_prompt(question)
        
    response = _llm().invoke(prompt)
    return {
        "answer": _answer_text(response), 
        "total_tokens": _token_count(response.usage_metadata)
    }

def route_category(state: AgentState):
    if state.get("category") == QuestionCategory.PERSONAL_CONTACT:
        return "search_contact"
    elif state.get("category") == QuestionCategory.MOU:
        return "mou"
    elif state.get("category") == QuestionCategory.OTHER:
        return "agent"

    return "agent"

def _build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("classify", classify_node)
    workflow.add_node("search_contact", search_contact_node)
    workflow.add_node("agent", agent_node)
    # route_category can return "mou", so the node it names has to exist - with it
    # commented out, every MOU question died in the router instead of being answered.
    workflow.add_node("mou", search_mou_node)

    workflow.add_edge(START, "classify")
    workflow.add_edge("search_contact", "agent")
    workflow.add_edge("mou", "agent")

    workflow.add_conditional_edges(
        "classify",
        route_category,
        {
            "search_contact": "search_contact",
            "mou": "mou",
            "other": "agent",
            "agent": "agent",
        },
    )
    workflow.add_edge("agent", END)

    # checkpointer = MemorySaver()
    return workflow.compile()


_graph = None
_graph_lock = threading.Lock()


def get_graph():
    global _graph
    if _graph is None:
        with _graph_lock:
            if _graph is None:
                logger.info("compiling agent graph...")
                _graph = _build_graph()
                logger.info("agent graph ready")
    return _graph
