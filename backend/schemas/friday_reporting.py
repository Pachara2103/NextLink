"""Read-only Friday reports; no individual student identities cross this API."""
from datetime import datetime
from typing import Literal

from schemas.friday_activity import FridayModel, FridaySummary


class CountBucket(FridayModel):
    key: str
    count: int


class CompanyFrequency(FridayModel):
    id: str
    name: str
    count: int


class MonthSessions(FridayModel):
    month: str
    held: int
    planned: int


class FridayTrend(FridayModel):
    academic_year: int
    summary: FridaySummary | None


class FridayAnalytics(FridayModel):
    source: Literal["postgresql"] = "postgresql"
    summary: FridaySummary
    status_counts: list[CountBucket]
    format_counts: list[CountBucket]
    companies: list[CompanyFrequency]
    months: list[MonthSessions]
    undated_sessions: int
    trend: list[FridayTrend]
    last_updated: datetime | None


class ScoreCount(FridayModel):
    score: int
    count: int


class EvaluationDimension(FridayModel):
    key: str
    label: str
    count: int
    total: float
    mean: float | None
    distribution: list[ScoreCount]


class EvaluationReport(FridayModel):
    id: str
    note_id: str
    activity_id: str | None
    title: str
    companies: list[dict[str, str]]
    kind: Literal["student", "company", "reported", "unmatched"]
    mapping: Literal["confirmed", "provisional", "conflict", "invalid", "unmatched"]
    counted: bool
    excluded_reason: str | None = None
    reference: str
    response_count: int | None = None
    dimensions: list[EvaluationDimension] = []
    reported_score: float | None = None
    feedback: str | None = None
    updated_at: datetime


class EvaluationSummary(FridayModel):
    student_responses: int
    student_activities: int
    company_responses: int
    company_activities: int
    provisional_reports: int
    invalid_reports: int
    duplicate_reports: int
    unmatched_reports: int
    dimensions: list[EvaluationDimension]


class FridayEvaluations(FridayModel):
    source: Literal["postgresql"] = "postgresql"
    format: Literal["legacy-workbook-notes-v1"] = "legacy-workbook-notes-v1"
    summary: EvaluationSummary
    items: list[EvaluationReport]
    total: int
    page: int
    page_size: int
    include_provisional: bool
    last_updated: datetime | None
