"""Loopback-only Friday browser harness using real auth and PostgreSQL routes.

Run with ``uvicorn friday_live_app:app --app-dir backend/tests --host 127.0.0.1``.
The selected TEST_DATABASE_URL must also be NEXTLINK_DATABASE_URL and name a
disposable local nextlink_security_test database. Bootstrap/seed explicitly with
the migration runner before starting; this app never changes the schema.

Only the unrelated LINE-group directory is an empty ancillary fixture. Health
reports this harness' PostgreSQL connectivity, not model or Neo4j availability.
All company/contact/employee/note reads and Friday/auth mutations use real DB
services. No production application lifespan or AI modules are imported.
"""
from __future__ import annotations

import os
from pathlib import Path
import sys
from urllib.parse import urlparse

_url = os.environ.get("TEST_DATABASE_URL", "")
_parsed = urlparse(_url)
if (
    _parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
    or not _parsed.path.startswith("/nextlink_security_test")
    or os.environ.get("NEXTLINK_DATABASE_URL") != _url
    or os.environ.get("PYTHON_DOTENV_DISABLED") != "1"
):
    raise RuntimeError("Use matching explicit loopback disposable TEST/NEXTLINK database URLs with dotenv disabled")
if not os.environ.get("AUTH_SECRET"):
    raise RuntimeError("Supply a fixture-only AUTH_SECRET explicitly")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from api.deps import current_user
from api.v1.auth import router as auth_router
from api.v1.friday_activity import router as friday_router
from api.v1.friday_import import router as friday_import_router
from core.db import nl_db
from core.exception_handlers import app_exception_handler
from core.exceptions import AppException
from schemas.base import ListResponse
from schemas.company import Company
from schemas.contact import Contact
from schemas.employee import Employee
from schemas.note import Note
from schemas.user import AuthUser
from services.company import get_companies
from services.contact import get_contacts
from services.employee import get_employees
from services.note import get_notes

app = FastAPI(title="Friday local PostgreSQL browser QA", docs_url=None, redoc_url=None)
app.add_exception_handler(AppException, app_exception_handler)


@app.middleware("http")
async def reject_remote_client(request: Request, call_next):
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"}:
        return JSONResponse(status_code=403, content={"detail": "Loopback QA harness only"})
    return await call_next(request)


app.include_router(auth_router, prefix="/api/v1")
app.include_router(friday_import_router, prefix="/api/v1")
app.include_router(friday_router, prefix="/api/v1")


@app.get("/api/v1/companies", response_model=ListResponse[Company])
def companies(user: AuthUser = Depends(current_user)):
    return get_companies()


@app.get("/api/v1/contacts", response_model=ListResponse[Contact])
def contacts(user: AuthUser = Depends(current_user)):
    return get_contacts()


@app.get("/api/v1/employees", response_model=ListResponse[Employee])
def employees(user: AuthUser = Depends(current_user)):
    return get_employees()


@app.get("/api/v1/notes", response_model=ListResponse[Note])
def notes(user: AuthUser = Depends(current_user)):
    return get_notes()


@app.get("/api/v1/line/groups")
def ancillary_empty_line_directory(user: AuthUser = Depends(current_user)):
    return {"items": [], "total": 0}


@app.get("/api/v1/line/update_logs")
def update_logs(user: AuthUser = Depends(current_user)):
    with nl_db.get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM update_logs")
            assert cursor.fetchone()[0] == 0, "This harness expects no LINE extraction logs"
    return {"items": [], "total": 0}


@app.get("/api/v1/health")
def health():
    with nl_db.get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), inet_server_port()")
            database_name, database_port = cursor.fetchone()
    return {"status": "ok", "ready": True, "models": False,
            "bootId": "local-friday-postgres-qa", "startedAt": "2026-10-15T00:00:00Z",
            "testHarness": True, "postgresql": True,
            "testDatabase": database_name, "testDatabasePort": database_port}
