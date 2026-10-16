"""Friday's PostgreSQL wire contract. All identifiers stay strings in JSON."""
from datetime import date, datetime
import re
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from schemas.api import ApiBaseModel

Term = Literal["FIRST", "SECOND", "SUMMER"]
ActivityStatus = Literal["draft", "contacting", "invited", "confirmed", "in_progress", "completed", "cancelled"]
ActivityFormat = Literal["talk", "workshop", "visit", "hackathon", "other", "unknown"]
SessionStatus = Literal["planned", "held", "cancelled"]
Namespace = Literal["employee", "contact", "guest"]
PersonRole = Literal["speaker", "coordinator"]
Count = Annotated[int, Field(strict=True, ge=0, le=2147483647)]


class FridayModel(ApiBaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _identifier(value: str | None) -> str | None:
    if value is not None and (not re.fullmatch(r"[1-9][0-9]{0,18}", value) or int(value) > 9223372036854775807):
        raise ValueError("ID must be a positive BIGINT encoded as a string")
    return value


class FridayPersonInput(FridayModel):
    id: str | None = None
    namespace: Namespace
    source_id: str | None = None
    name: str = ""
    role: PersonRole

    _ids = field_validator("id", "source_id")(_identifier)

    @model_validator(mode="after")
    def identity_matches_namespace(self):
        if self.namespace == "guest":
            if self.source_id is not None or not self.name:
                raise ValueError("Guests need a name and cannot have a CRM source ID")
            if len(self.name) > 500:
                raise ValueError("Guest names must be at most 500 characters")
        elif self.source_id is None:
            raise ValueError("CRM people require sourceId")
        return self


class FridaySessionInput(FridayModel):
    id: str | None = None
    session_date: date | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = Field(default=None, max_length=1000)
    status: SessionStatus = "planned"
    capacity: Count | None = None
    booked: Count | None = None
    attended: Count | None = None

    _id = field_validator("id")(_identifier)

    @field_validator("session_date", mode="before")
    @classmethod
    def iso_date(cls, value):
        if value is not None and not isinstance(value, date) and (not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)):
            raise ValueError("sessionDate must be an ISO date")
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def local_clock(cls, value):
        if value is not None and not re.fullmatch(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]", value):
            raise ValueError("Time must be HH:MM in Asia/Bangkok")
        return value

    @model_validator(mode="after")
    def ordered_times(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("endTime must be after startTime on the session date")
        return self


class FridayActivityFields(FridayModel):
    academic_year: int = Field(strict=True, ge=2000, le=2100)
    term: Term
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=20000)
    domain: str | None = Field(default=None, max_length=200)
    format: ActivityFormat = "unknown"
    owner_user_id: str
    company_ids: list[str] = Field(default_factory=list, max_length=100)
    people: list[FridayPersonInput] = Field(default_factory=list, max_length=200)
    sessions: list[FridaySessionInput] = Field(default_factory=list, max_length=200)

    _owner = field_validator("owner_user_id")(_identifier)

    @field_validator("company_ids")
    @classmethod
    def company_identifiers(cls, values):
        for value in values:
            _identifier(value)
        if len(values) != len(set(values)):
            raise ValueError("companyIds must be unique")
        return values

    @model_validator(mode="after")
    def unique_children(self):
        for children in (self.people, self.sessions):
            ids = [child.id for child in children if child.id is not None]
            if len(ids) != len(set(ids)):
                raise ValueError("Child IDs must be unique within an activity")
        refs = [(p.namespace, p.source_id, p.role) for p in self.people if p.namespace != "guest"]
        if len(refs) != len(set(refs)):
            raise ValueError("A CRM person cannot have the same role twice")
        return self


class FridayActivityCreate(FridayActivityFields):
    idempotency_key: str = Field(min_length=1, max_length=200)


class FridayActivityUpdate(FridayActivityFields):
    expected_revision: int = Field(strict=True, ge=1)
    reason: str | None = Field(default=None, max_length=2000)


class FridayTransition(FridayModel):
    expected_revision: int = Field(strict=True, ge=1)
    status: ActivityStatus
    reason: str | None = Field(default=None, max_length=2000)


class FridayCompany(FridayModel):
    id: str
    name: str


class FridayPerson(FridayPersonInput):
    id: str


class FridaySession(FridaySessionInput):
    id: str


class FridayActivity(FridayActivityFields):
    id: str
    status: ActivityStatus
    companies: list[FridayCompany]
    people: list[FridayPerson]
    sessions: list[FridaySession]
    revision: int
    created_at: datetime
    updated_at: datetime


class FridaySummary(FridayModel):
    total: int
    completed: int
    companies: int
    attended: int | None
    unknown_attendance: int


class FridayActivityList(FridayModel):
    items: list[FridayActivity]
    total: int
    page: int
    page_size: int
    summary: FridaySummary
    source: Literal["postgresql"] = "postgresql"
    last_updated: datetime | None


class FridayPersonOption(FridayModel):
    namespace: Literal["employee", "contact"]
    source_id: str
    name: str
    company_id: str


class FridayPeriod(FridayModel):
    academic_year: int
    term: Term


class FridayOptions(FridayModel):
    companies: list[FridayCompany]
    people: list[FridayPersonOption]
    owners: list[FridayCompany]
    periods: list[FridayPeriod]


class FridayAuditEvent(FridayModel):
    id: str
    activity_id: str
    actor_user_id: str
    actor_name: str
    operation: str
    reason: str | None
    before: dict | None
    after: dict | None
    occurred_at: datetime
    recorded_at: datetime


class FridayHistory(FridayModel):
    items: list[FridayAuditEvent]
