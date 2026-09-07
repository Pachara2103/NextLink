from schemas.ai import QuestionAnalysis
from ai.services.prompt import QUESTION_CLASSIFY_PROMPT
from langchain_core.prompts import ChatPromptTemplate
from core.ai import get_llm

prompt_template = ChatPromptTemplate.from_messages([
    ("system", QUESTION_CLASSIFY_PROMPT),
    ("user", "Question:\n{question}")
])

_chain = None

def get_classify_chain():
    global _chain
    if _chain is None:
        _chain = prompt_template | get_llm().with_structured_output(
            QuestionAnalysis, include_raw=True
        )
    return _chain
