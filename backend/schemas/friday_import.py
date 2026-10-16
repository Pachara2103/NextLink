"""Reviewed activity/session imports; roster and evaluations are separate work."""
from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field

from schemas.api import ApiBaseModel


class ImportModel(ApiBaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportNormalized(ImportModel):
    source_key: str | None = None
    academic_year: int | None = None
    term: str | None = None
    title: str = ""
    company_ids: list[str] = Field(default_factory=list)
    company_name: str = ""
    session_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    location: str | None = None
    format: str = "unknown"
    status: str | None = None
    capacity: int | None = None
    booked: int | None = None
    attended: int | None = None


class ImportCorrection(ImportModel):
    source_key: str | None = Field(default=None, max_length=200)
    academic_year: int | None = None
    term: str | None = Field(default=None, max_length=30)
    title: str | None = Field(default=None, max_length=500)
    session_date: str | None = Field(default=None, max_length=30)
    start_time: str | None = Field(default=None, max_length=20)
    end_time: str | None = Field(default=None, max_length=20)
    location: str | None = Field(default=None, max_length=1000)
    format: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, max_length=50)
    capacity: int | None = Field(default=None, strict=True)
    booked: int | None = Field(default=None, strict=True)
    attended: int | None = Field(default=None, strict=True)


class ImportReview(ImportModel):
    expected_batch_revision: int = Field(strict=True, ge=1)
    decision: Literal["create", "update", "skip"]
    company_ids: list[str] = Field(default_factory=list, max_length=100)
    target_activity_id: str | None = None
    target_activity_revision: int | None = Field(default=None, strict=True, ge=1)
    normalized: ImportCorrection | None = None


class ImportCommit(ImportModel):
    expected_batch_revision: int = Field(strict=True, ge=1)
    idempotency_key: str = Field(min_length=1, max_length=200)


class ImportCandidate(ImportModel):
    id: str
    title: str
    revision: int


class ImportRow(ImportModel):
    id: str
    row_number: int
    sheet_name: str
    raw: dict[str, str | None]
    normalized: ImportNormalized
    errors: list[str]
    mapping_status: Literal["matched", "needs_mapping"]
    candidate_activities: list[ImportCandidate] = Field(default_factory=list)
    decision: Literal["pending", "create", "update", "skip"]
    target_activity_id: str | None = None
    target_activity_revision: int | None = None
    committed_activity_id: str | None = None


class ImportReceipt(ImportModel):
    id: str
    batch_id: str
    inserted: int
    updated: int
    skipped: int
    pending: int
    rejected: int
    unchanged: int
    activity_ids: list[str]
    committed_at: datetime


class ImportBatch(ImportModel):
    id: str
    filename: str
    revision: int
    status: Literal["preview", "committed"]
    year_convention: Literal["AD", "BE"]
    source_hash: str
    rows: list[ImportRow]
    receipt: ImportReceipt | None = None
    idempotent_replay: bool = False
