"""Run only against an explicitly supplied, disposable local database."""
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

import bcrypt
import psycopg2
import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
TEST_URL = os.environ.get("TEST_DATABASE_URL", "")
parsed = urlparse(TEST_URL)
if parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or not parsed.path.startswith("/nextlink_security_test"):
    raise RuntimeError("TEST_DATABASE_URL must name a disposable local nextlink_security_test database")
os.environ["DATABASE_PUBLIC_URL"] = TEST_URL
os.environ["AUTH_SECRET"] = "security-regression-fixture-key-not-a-production-secret"
os.environ["PG_POOL_MAX"] = "20"
os.environ["PYTHON_DOTENV_DISABLED"] = "1"

from core import config
from core.db import pg_db


@pytest.fixture(scope="session", autouse=True)
def database_schema():
    with psycopg2.connect(TEST_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute("""CREATE TABLE IF NOT EXISTS users (
              id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
              password TEXT NOT NULL, display_name TEXT, updated_at TIMESTAMPTZ DEFAULT now()
            );""")
    # Run the actual migration twice to test a repeated deployment safely.
    migration = (BACKEND / "migrations/security.sql").read_text()
    with psycopg2.connect(TEST_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute(migration)
            cursor.execute(migration)
    yield
    pg_db.close()


@pytest.fixture(autouse=True)
def clean_database(database_schema, monkeypatch):
    with psycopg2.connect(TEST_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute("TRUNCATE auth_sessions, auth_login_buckets, users RESTART IDENTITY CASCADE;")
            # Low cost only in this isolated test fixture.
            hashed = bcrypt.hashpw(b"correct-password", bcrypt.gensalt(rounds=4)).decode()
            cursor.execute("INSERT INTO users(username,password) VALUES ('alice',%s),('bob',%s);", (hashed, hashed))
    monkeypatch.setattr(config, "LOGIN_ACCOUNT_LIMIT", 5)
    monkeypatch.setattr(config, "LOGIN_CLIENT_LIMIT", 20)
    monkeypatch.setattr(config, "LOGIN_GLOBAL_LIMIT", 50)
    monkeypatch.setattr(config, "LOGIN_WINDOW_SECONDS", 60)
    monkeypatch.setattr(config, "TRUSTED_PROXY_CIDRS", [])


@pytest.fixture
def client():
    from fastapi import Depends, FastAPI
    from fastapi.testclient import TestClient
    from api.deps import current_user
    from api.v1.auth import router
    from core.exception_handlers import app_exception_handler
    from core.exceptions import AppException
    from schemas.user import AuthUser

    app = FastAPI()
    app.add_exception_handler(AppException, app_exception_handler)
    app.include_router(router, prefix="/api/v1")

    @app.get("/protected")
    def read_protected(user: AuthUser = Depends(current_user)):
        return {"id": user.id}

    @app.delete("/protected")
    def mutate_protected(user: AuthUser = Depends(current_user)):
        return {"authorizedMutation": user.id}

    with TestClient(app) as value:
        yield value
