# P2 authentication fixes

This patch addresses only session revocation (CWE-613) and unrestricted login
attempts (CWE-307). Username timing, cross-tab frontend state and LINE extraction
remain separate P3 work. No production database or deployment was changed.

## Deployment order

1. Back up the database and apply `backend/migrations/security.sql` with the
   migration owner's role after `init.sql`. The script is transactional and
   repeatable. It adds only `auth_sessions` and `auth_login_buckets`; it does not
   alter LINE tables, users or business records. Grant the backend role
   SELECT/INSERT/UPDATE/DELETE on the new tables if it is not their owner.
2. Keep `AUTH_SECRET` identical on every backend instance and set the same
   `DATABASE_PUBLIC_URL`. All serving instances must use this new code: an old
   instance still accepts old stateless tokens. Drain/replace old instances before
   declaring revocation enabled; a mixed-version rolling deployment is insufficient.
3. Deploy the backend. Existing tokens without a session ID intentionally receive
   401; everyone signs in once. New tokens retain the existing camelCase
   `accessToken`, `tokenType`, `user` response and default 12-hour expiry.
4. Verify successful login, `/auth/me`, logout, and rejection of the same token
   after logout through both the frontend proxy and direct backend routes.
   Verify 429 plus `Retry-After` after the configured login budget is exceeded.

Logout deletes only the presented session. Other active sessions remain valid.
Account deletion and password-hash replacement also invalidate existing sessions.
Every protected request checks the PostgreSQL session; an unavailable database
does not fall back to signature-only authentication. Requests admitted before
logout may finish. If logout cannot reach the backend, browser-only logout cannot
revoke the server session; its token retains the configured expiry.

## Login budgets and proxies

The database atomically counts **all attempts**, including successful attempts,
before bcrypt. Denials do not extend the current window. Defaults:

| Variable | Default | Meaning |
| --- | ---: | --- |
| `LOGIN_ACCOUNT_LIMIT` | 10 | Attempts per normalized account per window |
| `LOGIN_CLIENT_LIMIT` | 100 | Attempts per client address per window |
| `LOGIN_WINDOW_SECONDS` | 900 | Account/client window duration |
| `LOGIN_GLOBAL_LIMIT` | 120 | Attempts across all instances per 60 seconds |
| `TRUSTED_PROXY_CIDRS` | empty | Comma-separated trusted proxy networks |

Account keys use trimmed, case-folded names; credential lookup itself preserves
its existing exact username behavior. Global admission also bounds creation of
counter rows during username spraying. Expired counters/sessions are cleaned in
bounded batches on login. Budget enforcement fails closed if its database fails.

By default, forwarded headers are ignored and the ASGI client address is used.
The built-in `python backend/app.py` launcher disables Uvicorn's automatic proxy
header handling so it preserves the socket peer. If starting Uvicorn separately,
use `uvicorn app:app --no-proxy-headers` from `backend/`. With a proxy, configure
only the proxy CIDRs actually controlled by the deployment. The application walks
`X-Forwarded-For` from right to left until the first untrusted hop. Never configure
`0.0.0.0/0` or `::/0` as trusted proxies. If the hosting adapter supplies an already
verified client address, leave `TRUSTED_PROXY_CIDRS` empty. If it supplies only a
shared proxy address, requests share the client budget; account/global budgets
still apply. Coordinate this topology with the backend host owner.

The schema keeps bcrypt hashes in session rows solely to detect credential
changes; it never stores plaintext passwords or bearer tokens. Treat both new
tables as backend-only data. Do not grant browser or public database access.

## Regression tests

Use Python 3.13, install `backend/requirements-test.txt`, and create a disposable
local PostgreSQL database whose name starts with `nextlink_security_test`.

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/nextlink_security_test \
  python -m pytest backend/tests -q
```

The suite uses real PostgreSQL and the production auth router, dependencies and
error handler. It does not start the AI application or contact LINE, Neo4j or an
LLM. It checks copied-token replay across processes, per-session logout, account
lifecycle, malformed/legacy tokens, concurrent budgets, window recovery,
forwarded-header spoofing through the built-in launcher's actual Uvicorn
middleware, database failure and the existing profile flow.
Only this explicitly named disposable local database is accepted by the fixture.

## Local verification on 2026-09-12

- 17 regression cases passed against disposable native PostgreSQL. The Uvicorn
  forwarded-header regression failed before the launcher fix (three 401 responses)
  and passed afterward (401, 401, 429), confirming the bypass and its correction.
- Python compilation and `git diff --check` passed. All 30 protected versioned
  routes retain the shared session dependency; frontend and LINE code are unchanged.
- The test runner emitted two dependency deprecation warnings, with no failures.
- GitHub Actions is configured but has not run remotely. Production migration,
  proxy topology and deployment behavior have not been verified. The full AI
  application's startup and unrelated frontend workflows were outside these tests.
