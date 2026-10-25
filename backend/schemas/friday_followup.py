"""Facts/comments and assigned work use their activity's shared revision."""
from datetime import date, datetime
import re
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator

from schemas.friday_activity import FridayActivity, FridayModel, _identifier


class FollowupWrite(FridayModel):
    expected_revision: int = Field(strict=True, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=200)
    reason: str | None = Field(default=None, max_length=2000)


class NoteFields(FridayModel):
    kind: Literal["fact", "comment"]
    body: str = Field(min_length=1, max_length=10000)
    reference: str | None = Field(default=None, max_length=2000)
    occurred_at: AwareDatetime | None = None

    @field_validator("occurred_at", mode="before")
    @classmethod
    def explicit_time(cls, value):
        if value is not None and not isinstance(value, datetime) and (
            not isinstance(value, str) or not re.match(r"^\d{4}-\d{2}-\d{2}T", value)
        ):
            raise ValueError("occurredAt must be an ISO datetime with an explicit timezone")
        return value


class NoteWrite(NoteFields, FollowupWrite):
    pass


class FollowupRecord(FridayModel):
    id: str
    activity_id: str
    author_user_id: str
    author_name: str
    updated_by_user_id: str
    updated_by_name: str
    version: int
    recorded_at: datetime
    updated_at: datetime


class FridayNote(NoteFields, FollowupRecord):
    pass


class TaskFields(FridayModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    assignee_user_id: str
    due_date: date
    status: Literal["open", "done", "cancelled"] = "open"

    _assignee = field_validator("assignee_user_id")(_identifier)

    @field_validator("due_date", mode="before")
    @classmethod
    def iso_date(cls, value):
        if not isinstance(value, date) and (not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)):
            raise ValueError("dueDate must be an ISO date")
        return value


class TaskWrite(TaskFields, FollowupWrite):
    pass


class FridayTask(TaskFields, FollowupRecord):
    assignee_name: str


class FollowupResult(FridayModel):
    activity: FridayActivity
    item: FridayNote | FridayTask


class NoteList(FridayModel):
    items: list[FridayNote]
    next_cursor: str | None


class TaskList(FridayModel):
    items: list[FridayTask]
    next_cursor: str | None


class NoteVersion(FridayModel):
    version: int
    editor_user_id: str
    editor_name: str
    reason: str | None
    snapshot: FridayNote
    recorded_at: datetime


class NoteVersionList(FridayModel):
    items: list[NoteVersion]
    next_cursor: int | None
