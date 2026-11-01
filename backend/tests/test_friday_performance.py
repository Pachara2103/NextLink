"""Real PostgreSQL read budgets and result parity, without timing thresholds."""
from contextlib import contextmanager

import psycopg2
from psycopg2.extensions import connection as PgConnection, cursor as PgCursor
import pytest

from conftest import TEST_URL
from core.db import nl_db
from services import friday_activity, friday_reporting
from test_friday_core import execute, friday_client


@contextmanager
def measured_reads(monkeypatch):
    statements = []
    cursors = {}

    class MeasuredConnection(PgConnection):
        def cursor(self, *args, **kwargs):
            base = kwargs.get("cursor_factory", PgCursor)
            if base not in cursors:
                class MeasuredCursor(base):
                    def execute(self, sql, params=None):
                        statements.append(sql)
                        return super().execute(sql, params)
                cursors[base] = MeasuredCursor
            kwargs["cursor_factory"] = cursors[base]
            return super().cursor(*args, **kwargs)

    conn = psycopg2.connect(TEST_URL, connection_factory=MeasuredConnection)

    @contextmanager
    def borrow():
        try:
            yield conn
        finally:
            conn.rollback()

    try:
        with monkeypatch.context() as patch:
            patch.setattr(nl_db, "get_connection", borrow)
            yield statements
    finally:
        conn.close()


def bulk_activities():
    execute("""INSERT INTO academic_periods(academic_year,term) VALUES(2026,'FIRST');
        INSERT INTO friday_activities(period_id,title,status,format,owner_user_id,updated_at)
            SELECT p.id,'Bulk '||n,CASE WHEN mod(n,5)=0 THEN 'cancelled' ELSE 'draft' END,'talk',1,'2026-11-01T00:00:00Z'
            FROM academic_periods p CROSS JOIN generate_series(1,100) n;
        INSERT INTO friday_activity_companies(activity_id,company_id)
            SELECT id,1 FROM friday_activities UNION ALL SELECT id,2 FROM friday_activities WHERE mod(id,2)=0;
        INSERT INTO friday_activity_people(activity_id,namespace,employee_id,name_snapshot,role)
            SELECT id,'employee',1,'Speaker snapshot','speaker' FROM friday_activities;
        INSERT INTO friday_activity_people(activity_id,namespace,contact_id,name_snapshot,role)
            SELECT id,'contact',1,'Coordinator snapshot','coordinator' FROM friday_activities WHERE mod(id,2)=0;
        INSERT INTO friday_activity_people(activity_id,namespace,name_snapshot,role)
            SELECT id,'guest','Guest snapshot','speaker' FROM friday_activities WHERE mod(id,3)=0;
        INSERT INTO friday_sessions(activity_id,status,attended)
            SELECT id,'held',0 FROM friday_activities UNION ALL SELECT id,'held',NULL FROM friday_activities
            UNION ALL SELECT id,'planned',NULL FROM friday_activities WHERE mod(id,2)=0;
        DELETE FROM friday_sessions WHERE activity_id=100;
        DELETE FROM friday_activity_companies WHERE activity_id=100;
        DELETE FROM friday_activity_people WHERE activity_id=100;""")


@pytest.mark.parametrize("page_size", [25, 100])
def test_registry_query_budget_is_constant_and_matches_single_reads(friday_client, monkeypatch, page_size):
    bulk_activities()
    canonical = [friday_activity.get_activity(str(i)) for i in range(100, 0, -1)]
    with measured_reads(monkeypatch) as statements:
        result = friday_activity.list_activities(academic_year=2026, term="FIRST", page_size=page_size)
        assert len(statements) <= 6, "Registry reads must not grow per activity"
        assert result.items == canonical[:page_size]
        assert result.total == 100
        assert result.summary.attended == 0 and result.summary.unknown_attendance == 80
        statements.clear()
        filtered = friday_activity.list_activities(academic_year=2026, term="FIRST", company_id="2", search="Bulk", page_size=page_size)
        assert len(statements) <= 6
        expected = [item for item in canonical if "2" in item.company_ids]
        assert filtered.items == expected[:page_size] and filtered.total == len(expected)
        statements.clear()
        beyond = friday_activity.list_activities(academic_year=2026, term="FIRST", page=5, page_size=page_size)
        assert len(statements) <= 3 and beyond.items == []
        assert beyond.summary == result.summary


@pytest.mark.parametrize("filters", [{}, {"company_id": "2"}, {"status": "cancelled"}, {"search": "missing"}])
def test_analytics_single_query_matches_registry_summary(friday_client, monkeypatch, filters):
    bulk_activities()
    # A present but filtered-out comparison period is zero; an absent one is null.
    execute("INSERT INTO academic_periods(academic_year,term) VALUES(2025,'FIRST'),(2024,'SECOND')")
    listed = friday_activity.list_activities(academic_year=2026, term="FIRST", **filters)
    with measured_reads(monkeypatch) as statements:
        result = friday_reporting.analytics(academic_year=2026, term="FIRST", **filters)
        assert len(statements) <= 2
    assert result.summary == listed.summary and result.last_updated == listed.last_updated
    assert result.trend[0].summary is None and result.trend[1].summary is None
    assert result.trend[2].summary.total == 0 and result.trend[2].summary.attended is None
    assert result.trend[3].summary == result.summary
    assert sum(item.count for item in result.status_counts) == listed.total


def test_empty_analytics_keeps_missing_periods_and_no_invented_attendance(friday_client, monkeypatch):
    with measured_reads(monkeypatch) as statements:
        result = friday_reporting.analytics(academic_year=2000, term="FIRST")
        assert len(statements) <= 2
    assert result.summary.total == 0 and result.summary.attended is None
    assert result.last_updated is None and result.undated_sessions == 0
    assert result.companies == result.months == result.status_counts == result.format_counts == []
    assert len(result.trend) == 1 and result.trend[0].summary is None
