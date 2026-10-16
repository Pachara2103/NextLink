"""Migration and authorization regression checks on the guarded local test DB."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
import shutil
from types import SimpleNamespace
from uuid import uuid4

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import psycopg2
from psycopg2 import sql
import pytest

from conftest import TEST_URL
from api.deps import friday_staff
from api.v1.auth import router as auth_router
from core.exception_handlers import app_exception_handler
from core.exceptions import AppException
from scripts.grant_friday_access import grant_access
from scripts.migrate import MIGRATIONS, MigrationError, _sql_body, apply_migrations, selected_database_url


@contextmanager
def temporary_schema():
    """Each schema test owns only a randomized schema inside the guarded DB."""
    schema = "friday_test_" + uuid4().hex
    control = psycopg2.connect(TEST_URL)
    control.autocommit = True
    with control.cursor() as cursor:
        cursor.execute(sql.SQL("CREATE SCHEMA {};").format(sql.Identifier(schema)))
    connection = psycopg2.connect(TEST_URL, options=f"-csearch_path={schema}")
    try:
        yield connection, schema
    finally:
        connection.close()
        with control.cursor() as cursor:
            cursor.execute(sql.SQL("DROP SCHEMA {} CASCADE;").format(sql.Identifier(schema)))
        control.close()


def run_sql(connection, query, params=(), *, fetch=False):
    with connection:
        with connection.cursor() as cursor:
            cursor.execute(query, params if params else None)
            if fetch:
                return cursor.fetchall()


def test_full_bootstrap_rerun_and_checksum_ledger():
    with temporary_schema() as (connection, _):
        applied = apply_migrations(connection, bootstrap=True)
        assert applied[:3] == ["bootstrap:init.sql", "bootstrap:security.sql", "20261015_001_friday_core.sql"]
        assert apply_migrations(connection, bootstrap=True) == []
        assert apply_migrations(connection) == []
        ledger = run_sql(connection, "SELECT version, length(checksum) FROM nextlink_schema_migrations ORDER BY version", fetch=True)
        assert len(ledger) == len(applied)
        assert all(length == 64 for _, length in ledger)
        tables = {row[0] for row in run_sql(connection, "SELECT tablename FROM pg_tables WHERE schemaname=current_schema()", fetch=True)}
        assert {"users", "companies", "contacts", "employees", "academic_periods", "friday_activities",
                "friday_sessions", "friday_activity_people", "friday_activity_companies",
                "friday_audit_events", "friday_mutation_receipts", "auth_sessions"} <= tables


def test_upgrade_existing_users_does_not_promote_them():
    with temporary_schema() as (connection, _):
        for name in ("init.sql", "security.sql"):
            run_sql(connection, _sql_body((MIGRATIONS / name).read_text(), True))
        run_sql(connection, "INSERT INTO users(username,password) VALUES ('existing','hash'); INSERT INTO companies(company_th) VALUES ('Existing company');")
        applied = apply_migrations(connection)
        assert "bootstrap:init.sql" not in applied
        assert run_sql(connection, "SELECT username, role, is_active FROM users", fetch=True) == [("existing", None, True)]
        assert run_sql(connection, "SELECT company_th FROM companies", fetch=True) == [("Existing company",)]


def test_checksum_drift_stops_upgrade_before_any_new_sql(tmp_path):
    with temporary_schema() as (connection, _):
        apply_migrations(connection, bootstrap=True)
        for source in MIGRATIONS.glob("*.sql"):
            shutil.copy(source, tmp_path / source.name)
        core = tmp_path / "20261015_001_friday_core.sql"
        core.write_text(core.read_text() + "\n-- altered after application\n")
        (tmp_path / "20990101_001_should_not_run.sql").write_text("CREATE TABLE should_not_run(id INTEGER);")
        with pytest.raises(MigrationError, match="Checksum mismatch"):
            apply_migrations(connection, directory=tmp_path)
        assert run_sql(connection, "SELECT to_regclass('should_not_run')", fetch=True) == [(None,)]


def test_bootstrap_and_migrations_roll_back_as_one_transaction(tmp_path):
    for name in ("init.sql", "security.sql", "20261015_001_friday_core.sql"):
        shutil.copy(MIGRATIONS / name, tmp_path / name)
    (tmp_path / "20261015_002_bad.sql").write_text("CREATE TABLE rollback_probe(id INTEGER); SELECT missing_column;")
    with temporary_schema() as (connection, _):
        with pytest.raises(psycopg2.errors.UndefinedColumn):
            apply_migrations(connection, bootstrap=True, directory=tmp_path)
        assert run_sql(connection, "SELECT to_regclass('users'),to_regclass('friday_activities'),to_regclass('nextlink_schema_migrations'),to_regclass('rollback_probe')", fetch=True) == [(None, None, None, None)]


def test_concurrent_runners_serialize_bootstrap():
    with temporary_schema() as (connection, schema):
        def migrate(_):
            worker = psycopg2.connect(TEST_URL, options=f"-csearch_path={schema}")
            try:
                return apply_migrations(worker, bootstrap=True)
            finally:
                worker.close()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(migrate, range(2)))
        assert sorted(map(len, results))[0] == 0
        assert sorted(map(len, results))[1] >= 3
        assert run_sql(connection, "SELECT count(*) FROM nextlink_schema_migrations", fetch=True)[0][0] == max(map(len, results))


def test_counts_preserve_unknown_zero_and_over_capacity_and_identity_namespaces():
    with temporary_schema() as (connection, _):
        apply_migrations(connection, bootstrap=True)
        run_sql(connection, """INSERT INTO users(username,password) VALUES ('owner','hash');
            INSERT INTO companies(company_th) VALUES ('Company');
            INSERT INTO employees(company_id,name_th) VALUES (1,'Employee one');
            INSERT INTO contacts(company_id,name) VALUES (1,'Contact one');
            INSERT INTO academic_periods(academic_year,term) VALUES (2026,'FIRST');
            INSERT INTO friday_activities(period_id,title,owner_user_id) VALUES (1,'Friday',1);
            INSERT INTO friday_activity_companies(activity_id,company_id) VALUES (1,1);
            INSERT INTO friday_sessions(activity_id,capacity,booked,attended) VALUES (1,NULL,0,0),(1,10,0,20);
            INSERT INTO friday_activity_people(activity_id,namespace,employee_id,name_snapshot,role) VALUES (1,'employee',1,'Employee one','speaker');
            INSERT INTO friday_activity_people(activity_id,namespace,contact_id,name_snapshot,role) VALUES (1,'contact',1,'Contact one','coordinator');""")
        assert run_sql(connection, "SELECT capacity,booked,attended FROM friday_sessions ORDER BY id", fetch=True) == [(None, 0, 0), (10, 0, 20)]
        assert run_sql(connection, "SELECT namespace,employee_id,contact_id FROM friday_activity_people ORDER BY id", fetch=True) == [("employee", 1, None), ("contact", None, 1)]
        for statement in (
            "INSERT INTO friday_sessions(activity_id,booked) VALUES (1,-1)",
            "INSERT INTO friday_activity_people(activity_id,namespace,contact_id,name_snapshot,role) VALUES (1,'employee',1,'wrong namespace','speaker')",
            "INSERT INTO academic_periods(academic_year,term) VALUES (2569,'FIRST')",
            "UPDATE users SET role='superuser' WHERE id=1",
        ):
            with pytest.raises(psycopg2.errors.CheckViolation):
                run_sql(connection, statement)
        for statement in ("DELETE FROM companies WHERE id=1", "DELETE FROM users WHERE id=1", "DELETE FROM contacts WHERE id=1", "DELETE FROM employees WHERE id=1", "DELETE FROM friday_activities WHERE id=1"):
            with pytest.raises(psycopg2.errors.ForeignKeyViolation):
                run_sql(connection, statement)


def test_provisioning_requires_explicit_existing_ids_and_preserves_inactive():
    with temporary_schema() as (connection, _):
        apply_migrations(connection, bootstrap=True)
        run_sql(connection, "INSERT INTO users(username,password) VALUES ('first','hash'),('second','hash'); UPDATE users SET is_active=false WHERE id=2")
        with pytest.raises(MigrationError):
            grant_access(connection, [], "staff")
        with pytest.raises(MigrationError):
            grant_access(connection, [1, 999], "admin")
        assert run_sql(connection, "SELECT role FROM users ORDER BY id", fetch=True) == [(None,), (None,)]
        assert grant_access(connection, [2], "staff") == [2]
        assert run_sql(connection, "SELECT role,is_active FROM users ORDER BY id", fetch=True) == [(None, True), ("staff", False)]


def test_migration_url_never_falls_back_to_app_environment(monkeypatch):
    monkeypatch.delenv("NEXTLINK_MIGRATION_DATABASE_URL", raising=False)
    monkeypatch.setenv("NEXTLINK_DATABASE_URL", "postgresql://must-not-use-this")
    with pytest.raises(MigrationError, match="Supply"):
        selected_database_url()


def test_missing_migration_fails_readably_without_legacy_auth_fallback(monkeypatch):
    import api.deps as deps
    import services.sessions as sessions

    with temporary_schema() as (connection, _):
        for name in ("init.sql", "security.sql"):
            run_sql(connection, _sql_body((MIGRATIONS / name).read_text(), True))
        run_sql(connection, "INSERT INTO users(username,password) VALUES ('legacy','hash')")

        @contextmanager
        def get_connection():
            try:
                yield connection
            finally:
                connection.rollback()

        isolated_pool = SimpleNamespace(get_connection=get_connection)
        monkeypatch.setattr(sessions, "nl_db", isolated_pool)
        monkeypatch.setattr(deps, "nl_db", isolated_pool)
        for operation in (
            lambda: sessions.create_session("1", "hash"),
            lambda: deps.friday_staff(sessions.SessionIdentity("1", "legacy", str(uuid4()))),
        ):
            with pytest.raises(AppException) as failure:
                operation()
            assert failure.value.status_code == 503
            assert "migration" in failure.value.message
        assert run_sql(connection, "SELECT count(*) FROM auth_sessions", fetch=True) == [(0,)]


@pytest.fixture
def friday_access_client():
    app = FastAPI()
    app.add_exception_handler(AppException, app_exception_handler)
    app.include_router(auth_router, prefix="/api/v1")

    @app.get("/friday-protected")
    def friday_protected(identity=Depends(friday_staff)):
        return {"id": identity.id}

    with TestClient(app) as client:
        yield client


def test_assigned_active_staff_admin_and_revoked_roles(friday_access_client):
    client = friday_access_client
    response = client.post("/api/v1/auth/login", json={"username": "alice", "password": "correct-password"})
    assert response.status_code == 200
    headers = {"Authorization": "Bearer " + response.json()["accessToken"]}
    connection = psycopg2.connect(TEST_URL)
    try:
        run_sql(connection, "UPDATE users SET role=NULL WHERE username='alice'")
        assert client.get("/friday-protected", headers=headers).status_code == 403
        for role in ("staff", "admin"):
            run_sql(connection, "UPDATE users SET role=%s WHERE username='alice'", (role,))
            assert client.get("/friday-protected", headers=headers).status_code == 200
        # A profile body cannot grant roles, even if a caller forges extra fields.
        run_sql(connection, "UPDATE users SET role=NULL WHERE username='alice'")
        client.put("/api/v1/auth/me", headers=headers, json={"displayName": "Alice", "role": "admin", "isActive": True})
        assert client.get("/friday-protected", headers=headers).status_code == 403
        run_sql(connection, "UPDATE users SET role='staff',is_active=false WHERE username='alice'")
        assert client.get("/friday-protected", headers=headers).status_code == 401
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
        assert client.post("/api/v1/auth/login", json={"username": "alice", "password": "correct-password"}).status_code == 401
    finally:
        connection.close()
