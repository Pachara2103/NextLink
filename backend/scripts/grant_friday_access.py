"""Assign a Friday role only to explicitly selected, existing user IDs."""
from __future__ import annotations

import argparse
import sys

import psycopg2

try:
    from scripts.migrate import MigrationError, selected_database_url
except ModuleNotFoundError:  # Direct execution: python backend/scripts/...
    from migrate import MigrationError, selected_database_url


def grant_access(connection, user_ids: list[int], role: str) -> list[int]:
    if role not in {"staff", "admin"} or not user_ids or any(type(value) is not int or value <= 0 for value in user_ids):
        raise MigrationError("Choose staff/admin and at least one positive existing user ID.")
    selected = sorted(set(user_ids))
    with connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = ANY(%s) ORDER BY id FOR UPDATE;", (selected,))
            existing = [int(row[0]) for row in cursor.fetchall()]
            if existing != selected:
                raise MigrationError("At least one selected user ID does not exist; no roles changed.")
            # Deliberately preserves is_active. Granting a role cannot reactivate
            # an account whose sessions an operator has disabled.
            cursor.execute("UPDATE users SET role=%s, updated_at=now() WHERE id = ANY(%s);", (role, selected))
    return selected


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", help="Explicit target database")
    parser.add_argument("--user-id", action="append", type=int, required=True, help="Repeat for each selected account")
    parser.add_argument("--role", choices=("staff", "admin"), required=True)
    args = parser.parse_args(argv)
    try:
        url = selected_database_url(args.database_url)
        connection = psycopg2.connect(url, connect_timeout=15)
        try:
            selected = grant_access(connection, args.user_id, args.role)
        finally:
            connection.close()
    except (MigrationError, psycopg2.Error) as exc:
        detail = str(exc) if isinstance(exc, MigrationError) else f"Role assignment failed ({exc.pgcode or 'connection error'}); run the matching migrations first."
        print(detail, file=sys.stderr)
        return 1
    print(f"Assigned {args.role} to selected user IDs: " + ", ".join(map(str, selected)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
