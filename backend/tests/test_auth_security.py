import ast
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from uuid import uuid4

import psycopg2
import pytest
from fastapi import Request

from conftest import BACKEND, TEST_URL
from core import config
from core.auth import _b64encode, _sign, issue_token
from services.login_limits import client_address, enforce_login_budget
from core.exceptions import TooManyAttemptsError


def sign_in(client, username="alice"):
    response = client.post("/api/v1/auth/login", json={"username": username, "password": "correct-password"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"accessToken", "tokenType", "user"}
    assert set(body["user"]) == {"id", "username", "displayName"}
    return {"Authorization": "Bearer " + body["accessToken"]}


def execute(sql, params=()):
    with psycopg2.connect(TEST_URL) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)


def second_worker(operation, value):
    code = """import json,sys
from services.sessions import authenticate_session
from services.login_limits import enforce_login_budget
from core.exceptions import AppException
operation,value=json.load(sys.stdin)
try:
    if operation=='session': authenticate_session(value)
    else: enforce_login_budget(*value)
except AppException as exc: print(exc.status_code)
else: print(200)
"""
    result = subprocess.run([sys.executable, "-c", code], input=json.dumps([operation, value]), text=True,
                            capture_output=True, cwd=BACKEND, env=os.environ.copy(), timeout=20, check=True)
    return int(result.stdout.strip())


def test_logout_revokes_copied_token_on_all_protected_operations_and_workers(client):
    headers = sign_in(client)
    token = headers["Authorization"][7:]
    assert client.get("/protected", headers=headers).status_code == 200
    assert second_worker("session", token) == 200
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200
    for method, path in [("get", "/protected"), ("delete", "/protected"), ("get", "/api/v1/auth/me")]:
        assert getattr(client, method)(path, headers=headers).status_code == 401
    assert second_worker("session", token) == 401


def test_logout_preserves_other_sessions_and_profile_workflow(client):
    first, second = sign_in(client), sign_in(client)
    assert client.put("/api/v1/auth/me", headers=second, json={"displayName": "Alice"}).json()["displayName"] == "Alice"
    assert client.post("/api/v1/auth/logout", headers=first).status_code == 200
    assert client.get("/api/v1/auth/me", headers=second).json()["displayName"] == "Alice"
    assert client.delete("/protected", headers=second).status_code == 200


def test_upstream_password_change_revokes_old_sessions_and_allows_new_login(client):
    from services.user import update_password
    from core.exceptions import InvalidCredentialsError

    first, second = sign_in(client), sign_in(client)
    other_user = sign_in(client, "bob")
    with pytest.raises(InvalidCredentialsError):
        update_password(1, "replacement-password", "incorrect-current-password")
    assert client.get("/api/v1/auth/me", headers=first).status_code == 200

    update_password(1, "replacement-password", "correct-password")
    for headers in (first, second):
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert client.get("/api/v1/auth/me", headers=other_user).status_code == 200
    assert client.post("/api/v1/auth/login", json={
        "username": "alice", "password": "correct-password",
    }).status_code == 401
    response = client.post("/api/v1/auth/login", json={
        "username": "alice", "password": "replacement-password",
    })
    assert response.status_code == 200
    assert client.get("/api/v1/auth/me", headers={
        "Authorization": "Bearer " + response.json()["accessToken"],
    }).status_code == 200


@pytest.mark.parametrize("change", ["delete", "password", "expiry"])
def test_session_lifecycle_fails_closed(client, change):
    headers = sign_in(client)
    if change == "delete":
        execute("DELETE FROM users WHERE username='alice'")
    elif change == "password":
        execute("UPDATE users SET password='replacement-hash' WHERE username='alice'")
    else:
        execute("UPDATE auth_sessions SET expires_at=now()-interval '1 second'")
    assert client.get("/protected", headers=headers).status_code == 401


def test_signed_tokens_require_an_actual_active_session(client):
    tokens = [issue_token("1", str(uuid4()), int(time.time()) + 300)]
    for payload in [{"sub": "1", "username": "alice", "exp": int(time.time()) + 300},
                    {"sub": "1", "sid": "bad", "exp": int(time.time()) + 300},
                    {"sub": "1", "sid": str(uuid4()), "exp": "nan"}]:
        encoded = _b64encode(json.dumps(payload).encode())
        tokens.append(encoded + "." + _sign(encoded))
    for token in tokens:
        assert client.get("/protected", headers={"Authorization": "Bearer " + token}).status_code == 401
    assert client.get("/protected").status_code == 401


def test_password_change_between_check_and_issue_cannot_create_a_session():
    from services.user import login
    from services.sessions import create_session
    from core.exceptions import InvalidTokenError
    user, checked_hash = login("alice", "correct-password")
    execute("UPDATE users SET password='new-credential' WHERE id=%s", (user.id,))
    with pytest.raises(InvalidTokenError):
        create_session(user.id, checked_hash)


def test_session_id_cannot_be_rebound_to_another_account(client):
    from core.auth import verify_token
    headers = sign_in(client)
    claims = verify_token(headers["Authorization"][7:])
    mismatched = issue_token("2", claims["sid"], claims["exp"])
    assert client.get("/protected", headers={"Authorization": "Bearer " + mismatched}).status_code == 401


def test_expired_or_modified_signature_cannot_reach_protected_api(client):
    from core.auth import verify_token
    headers = sign_in(client)
    token = headers["Authorization"][7:]
    claims = verify_token(token)
    expired = issue_token("1", claims["sid"], int(time.time()) - 1)
    for invalid in (expired, token + "x"):
        assert client.get("/protected", headers={"Authorization": "Bearer " + invalid}).status_code == 401


def test_login_budget_blocks_before_bcrypt_and_recovers(client, monkeypatch):
    import services.user as users
    original = users.bcrypt.checkpw
    checks = []
    monkeypatch.setattr(users.bcrypt, "checkpw", lambda password, hashed: (checks.append(1), original(password, hashed))[1])
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json={"username": "alice", "password": "wrong"}).status_code == 401
    blocked = client.post("/api/v1/auth/login", json={"username": "alice", "password": "correct-password"})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert len(checks) == 5
    sign_in(client, "bob")
    execute("UPDATE auth_login_buckets SET expires_at=now()-interval '1 second'")
    sign_in(client)


def test_atomic_account_budget_across_concurrent_calls_and_separate_worker(monkeypatch):
    monkeypatch.setattr(config, "LOGIN_ACCOUNT_LIMIT", 10)
    def attempt(_):
        try:
            enforce_login_budget("alice", "192.0.2.1")
            return 200
        except TooManyAttemptsError:
            return 429
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(attempt, range(20)))
    assert results.count(200) == 10
    assert results.count(429) == 10
    # A separate interpreter uses default account budget 10 and the same DB.
    assert second_worker("budget", ["ALICE", "192.0.2.2"]) == 429


def test_client_and_global_budgets_bound_username_spraying(monkeypatch):
    monkeypatch.setattr(config, "LOGIN_CLIENT_LIMIT", 2)
    for i in range(2):
        enforce_login_budget(f"unknown-{i}", "192.0.2.1")
    with pytest.raises(TooManyAttemptsError):
        enforce_login_budget("unknown-3", "192.0.2.1")
    monkeypatch.setattr(config, "LOGIN_GLOBAL_LIMIT", 3)
    with pytest.raises(TooManyAttemptsError):
        enforce_login_budget("unknown-4", "192.0.2.2")


def test_only_explicitly_trusted_proxy_chain_is_used(monkeypatch):
    def request(peer, forwarded):
        return Request({"type": "http", "client": (peer, 1234), "headers": [(b"x-forwarded-for", forwarded.encode())]})
    assert client_address(request("192.0.2.9", "1.1.1.1")) == "192.0.2.9"
    monkeypatch.setattr(config, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    assert client_address(request("10.0.0.2", "1.1.1.1, 192.0.2.9, 10.0.0.3")) == "192.0.2.9"
    assert client_address(request("10.0.0.2", "invalid")) == "10.0.0.2"


def test_builtin_server_does_not_trust_spoofed_forwarded_addresses(client, monkeypatch):
    import uvicorn
    from fastapi.testclient import TestClient

    monkeypatch.setattr(config, "LOGIN_CLIENT_LIMIT", 2)
    launched = []

    def configure_server(app, **options):
        server = uvicorn.Config(app, log_config=None, **options)
        server.load()
        launched.append(server.loaded_app)

    # Execute the real launch block with the auth-only application. This uses
    # Uvicorn's actual middleware stack without importing AI or starting a socket.
    launch = ast.parse((BACKEND / "app.py").read_text()).body[-1]
    exec(compile(ast.Module(body=[launch], type_ignores=[]), str(BACKEND / "app.py"), "exec"),
         {"__name__": "__main__", "app": client.app, "config": config,
          "uvicorn": SimpleNamespace(run=configure_server)})
    with TestClient(launched[0], client=("127.0.0.1", 4321)) as proxied:
        results = [proxied.post(
            "/api/v1/auth/login",
            headers={"X-Forwarded-For": f"192.0.2.{index}"},
            json={"username": f"unknown-{index}", "password": "wrong"},
        ) for index in range(1, 4)]
    assert [response.status_code for response in results] == [401, 401, 429]
    assert int(results[-1].headers["retry-after"]) > 0


def test_oversized_credentials_are_rejected_before_verification(client):
    response = client.post("/api/v1/auth/login", json={"username": "alice", "password": "x" * 1025})
    assert response.status_code == 422


def test_database_failure_does_not_fall_back_to_signature_only(client, monkeypatch):
    import services.sessions as sessions
    from core.exceptions import DatabaseError
    headers = sign_in(client)
    def unavailable():
        raise DatabaseError()
    monkeypatch.setattr(sessions.pg_db, "get_connection", unavailable)
    assert client.get("/protected", headers=headers).status_code == 500


def test_login_budget_database_failure_never_reaches_bcrypt(client, monkeypatch):
    import services.login_limits as limits
    import services.user as users
    from core.exceptions import DatabaseError
    def unavailable():
        raise DatabaseError()
    def unexpected_check(*args):
        pytest.fail("bcrypt must not run if the shared budget cannot be checked")
    monkeypatch.setattr(limits.pg_db, "get_connection", unavailable)
    monkeypatch.setattr(users.bcrypt, "checkpw", unexpected_check)
    response = client.post("/api/v1/auth/login", json={"username": "alice", "password": "correct-password"})
    assert response.status_code == 500
