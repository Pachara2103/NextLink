# Explicit database changes

The application never applies migrations at startup. Use a dedicated operator
connection to the **NextLink PostgreSQL database**, not the LINE database.
The command does not load `.env` or read `NEXTLINK_DATABASE_URL`.

Select a target explicitly with `NEXTLINK_MIGRATION_DATABASE_URL` or the
`--database-url` argument. Keep credentials outside shell history when possible.
For a new, empty database:

```sh
python backend/scripts/migrate.py --bootstrap
```

For a database that already has `init.sql` and `security.sql`:

```sh
python backend/scripts/migrate.py
```

`--bootstrap` explicitly includes the legacy initialization and security files.
Normal upgrades include only numbered SQL files, ordered by filename. The
runner applies all selected pending files in one transaction while holding a
transaction-scoped PostgreSQL advisory lock. `nextlink_schema_migrations` stores
SHA-256 checksums. A repeated run does nothing; changed or missing applied files
stop the upgrade. Do not edit an applied migration: add a new numbered file.
Numbered SQL files must not contain their own `BEGIN` or `COMMIT` statements.

The Friday migration adds nullable `users.role` (`staff` or `admin`) and
`users.is_active` (default `true`). Existing users receive no Friday role.
Only an operator may select accounts to grant access:

```sh
python backend/scripts/grant_friday_access.py --user-id 12 --user-id 34 --role staff
```

The script validates every selected ID before changing any role and preserves
`is_active`. No default account is promoted. Active assigned staff and admins
share Friday business data. Every protected API rejects inactive accounts,
including previously issued sessions. Deploy the schema before this backend
release; an older schema returns a readable 503 instead of granting access.

Friday foreign keys restrict deletion of referenced companies, people, users,
and activities, preserving historical provenance. Use cancellation and status
changes through the application instead of deleting business history.

Regression tests require `TEST_DATABASE_URL` and `NEXTLINK_DATABASE_URL` pointing
to the same disposable loopback database named `nextlink_security_test*`, with
`PYTHON_DOTENV_DISABLED=1`. The test suite must never target an application or
LINE database. Schema, checksum, rollback, concurrency, authorization, and
existing session tests run with:

```sh
python -m pytest backend/tests/test_friday_migrations.py backend/tests/test_auth_security.py -q
```
