from langchain_core.prompts import ChatPromptTemplate
from schemas.extraction import ExtractionList
from ai.services.prompt import GET_CONTACT_PROMPT
from core.ai import get_llm

contact_prompt = ChatPromptTemplate.from_messages([
    ("system", GET_CONTACT_PROMPT),
    ("user", "Chat History:\n{chat_history}")
])

_chain = None

def get_extract_contact_chain():
    global _chain
    if _chain is None:
        _chain = contact_prompt | get_llm().with_structured_output(ExtractionList)
    return _chain
