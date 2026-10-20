"""Explicit, transactional NextLink schema upgrades.

The dedicated URL deliberately does not read .env, NEXTLINK_DATABASE_URL, or
application configuration. Operators must select the target themselves.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import sys

import psycopg2

MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"
MIGRATION_LOCK = 669194293635796846  # One transaction-scoped lock for this schema.


class MigrationError(RuntimeError):
    """Safe operator-facing diagnostic, without connection details."""


def selected_database_url(argument: str | None = None) -> str:
    value = argument or os.environ.get("NEXTLINK_MIGRATION_DATABASE_URL", "")
    if not value.strip():
        raise MigrationError("Supply --database-url or NEXTLINK_MIGRATION_DATABASE_URL explicitly.")
    return value


def migration_files(directory: Path = MIGRATIONS, bootstrap: bool = False) -> list[tuple[str, Path]]:
    files = []
    if bootstrap:
        files.extend(("bootstrap:" + name, directory / name) for name in ("init.sql", "security.sql"))
    files.extend((path.name, path) for path in sorted(directory.glob("[0-9]*.sql")))
    if not files:
        raise MigrationError("No upgrade migration files were found.")
    return files


def _sql_body(raw: str, bootstrap: bool) -> str:
    # Legacy bootstrap files own a BEGIN/COMMIT pair. Remove exactly those
    # standalone wrappers so the ledger, bootstrap, and upgrades commit together.
    if bootstrap:
        raw = re.sub(r"(?im)^\s*(BEGIN|COMMIT)\s*;\s*$", "", raw)
    if re.search(r"(?im)^\s*(BEGIN|COMMIT|ROLLBACK)\s*;", raw):
        raise MigrationError("Migration files must not contain transaction-control statements.")
    return raw


def apply_migrations(connection, *, bootstrap: bool = False, directory: Path = MIGRATIONS) -> list[str]:
    """Apply selected files and their checksums atomically on a dedicated connection.

    A checksum mismatch or unknown applied upgrade stops the entire transaction.
    The caller owns the connection; this function owns and closes its transaction.
    """
    files = migration_files(directory, bootstrap)
    applied: list[str] = []
    with connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s);", (MIGRATION_LOCK,))
            cursor.execute("""CREATE TABLE IF NOT EXISTS nextlink_schema_migrations (
                version TEXT PRIMARY KEY,
                checksum TEXT NOT NULL CHECK (length(checksum) = 64),
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );""")
            cursor.execute("SELECT version, checksum FROM nextlink_schema_migrations ORDER BY version;")
            recorded = dict(cursor.fetchall())
            known_upgrades = {path.name for path in directory.glob("[0-9]*.sql")}
            unknown = [version for version in recorded if not version.startswith("bootstrap:") and version not in known_upgrades]
            if unknown:
                raise MigrationError("Database has an unknown applied upgrade; use the matching migration release.")
            # Validate every previously recorded checksum, including bootstrap
            # when doing a normal upgrade, before running any new SQL.
            for version, checksum in recorded.items():
                path = directory / version.removeprefix("bootstrap:")
                if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
                    raise MigrationError(f"Checksum mismatch for migration {version}.")
            for version, path in files:
                if version in recorded:
                    continue
                if not path.is_file():
                    raise MigrationError(f"Missing migration file {version}.")
                raw = path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(path.read_bytes()).hexdigest()
                cursor.execute(_sql_body(raw, version.startswith("bootstrap:")))
                cursor.execute(
                    "INSERT INTO nextlink_schema_migrations(version, checksum) VALUES (%s, %s);",
                    (version, checksum),
                )
                applied.append(version)
    return applied


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="Explicit target; never inferred from application configuration")
    parser.add_argument("--bootstrap", action="store_true", help="Explicitly apply init.sql and security.sql before upgrades")
    args = parser.parse_args(argv)
    try:
        url = selected_database_url(args.database_url)
        connection = psycopg2.connect(url, connect_timeout=15)
        try:
            applied = apply_migrations(connection, bootstrap=args.bootstrap)
        finally:
            connection.close()
    except (MigrationError, psycopg2.Error, OSError) as exc:
        # psycopg2 connection exceptions can contain a DSN, password, or host.
        # Print only our own diagnostics; SQLSTATE is safe and still actionable.
        detail = str(exc) if isinstance(exc, MigrationError) else f"Database operation failed ({getattr(exc, 'pgcode', None) or 'connection/file error'})."
        print(detail, file=sys.stderr)
        return 1
    print("Applied: " + (", ".join(applied) if applied else "none; schema already current"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
