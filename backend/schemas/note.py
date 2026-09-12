from typing import Literal

from pydantic import Field

from schemas.api import ApiBaseModel
from schemas.base import BaseTimestamp, BasePersonName
from schemas.company import CompanyName
from schemas.enums import NoteSource, NoteType, Sentiment


class NoteBase(ApiBaseModel):
    content: str 
    type: NoteType 
    sentiment: Sentiment 
    source: NoteSource 
    year: int
    semester: Literal[1, 2, 3] 

class NoteCreate(NoteBase):
    company_id: int
    employee_id: int | None

class Note(NoteCreate, BaseTimestamp, CompanyName, BasePersonName):
    id: int