
from schemas.api import ApiBaseModel
from pydantic import Field
from schemas.enums import RelevantType
from datetime import datetime
from pydantic import BaseModel
from schemas.enums import QuestionCategory, ChatRole
from typing import Literal

class ExtractedEntities(BaseModel):
    person_name: str | None = Field(None, description="ชื่อบุคคลที่ถูกกล่าวถึงในคำถาม")
    company_name: str | None  = Field(None, description="ชื่อบริษัทหรือองค์กรที่ถูกกล่าวถึง")

class QuestionAnalysis(ExtractedEntities):
    category: QuestionCategory = Field(QuestionCategory.OTHER, description="หมวดหมู่ของคำถาม")


class ChatAsk(ApiBaseModel):
    question: str = Field(..., min_length=1, max_length=1000)

AgentStepKey = Literal["classify", "search", "agent"]

#   pending  — not started
#   active   — running right now
#   done     — finished
#   skipped  — the route did not go through this step at all
AgentStepState = Literal["pending", "active", "done", "skipped"]


class AgentStep(ApiBaseModel):
    """One line of the checklist the console shows while the agent thinks."""

    key: AgentStepKey
    label: str
    state: AgentStepState = "pending"


class AgentPlan(ApiBaseModel):
    """The whole checklist, sent once before the first step starts."""

    steps: list[AgentStep]


class AgentError(ApiBaseModel):
    message: str
