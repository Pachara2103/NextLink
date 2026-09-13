"""Bounded, read-only SQL reads from the separate LINE database.

Only sync metadata is persisted in NextLink. Message bodies live in memory
for extraction and are never included in the metadata change feed.
"""
from contextlib import contextmanager
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor

from core import config
from core.db import PostgresPool
from core.exceptions import BadRequestError, DatabaseError


def expected_source():
    try:
        return str(UUID(config.LINE_SOURCE_ID or ""))
    except ValueError:
        raise BadRequestError(message="Configure the verified LINE_SOURCE_ID") from None


class LineSourcePool(PostgresPool):
    def _create_pool(self):
        if not config.LINE_DATABASE_URL:
            raise BadRequestError(message="Configure a read-only LINE_DATABASE_URL")
        try:
            return psycopg2.pool.ThreadedConnectionPool(
                1, config.LINE_PG_POOL_MAX, dsn=config.LINE_DATABASE_URL,
                connect_timeout=5, application_name="nextlink-line-reader",
            )
        except psycopg2.Error:
            raise DatabaseError(message="LINE source connection failed") from None

    @contextmanager
    def get_connection(self):
        with super().get_connection() as conn:
            # Transaction-local settings work with Neon's transaction pooler.
            # Release the snapshot and connection before any LLM work.
            conn.rollback()
            try:
                with conn.cursor() as cur:
                    cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                    cur.execute("SET LOCAL statement_timeout='10s'")
                    cur.execute("SET LOCAL lock_timeout='3s'")
                yield conn
            finally:
                conn.rollback()


line_db = LineSourcePool()


def source_identity(cur):
    # Reject an accidentally configured owner credential, even though our
    # transactions are read-only. The reader must have view-only permissions.
    cur.execute("""SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=current_schema() AND c.relkind IN ('r','p')
          AND starts_with(c.relname,'line_') AND has_table_privilege(current_user,c.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        ) AS unsafe""")
    if cur.fetchone()["unsafe"]:
        raise BadRequestError(message="LINE_DATABASE_URL must use the dedicated view-only reader")
    cur.execute("SELECT source_id::text,contract_version,watermark FROM line_read_identity")
    identity = cur.fetchone()
    if not identity or identity["source_id"] != expected_source() or identity["contract_version"] != 2:
        raise BadRequestError(message="LINE source identity or SQL contract mismatch")
    return identity


def fetch_page(cursor):
    with line_db.get_connection() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        identity = source_identity(cur)
        if cursor > identity["watermark"]:
            raise BadRequestError(message="LINE source is behind the saved cursor; verify restore target")
        cur.execute("""SELECT change_id,entity,entity_id,source_version,group_data,
                       message_group_id,eligible,legacy_is_read
                       FROM line_read_changes WHERE change_id>%s
                       ORDER BY change_id LIMIT 101""", (cursor,))
        rows = cur.fetchall()
        return {"source_id": identity["source_id"], "watermark": identity["watermark"],
                "items": rows[:100], "has_more": len(rows) > 100,
                "next_cursor": rows[min(len(rows),100)-1]["change_id"] if rows else cursor}


def read_messages(group_id, versions):
    """Read exactly the selected IDs/versions. Missing/edited/unsent => retry."""
    if not versions or len(versions) > 200:
        raise ValueError("Expected 1..200 message versions")
    with line_db.get_connection() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        source_identity(cur)
        cur.execute("""SELECT message_id,source_version,text_content,created_at
                       FROM line_read_messages WHERE group_id=%s AND message_id=ANY(%s)
                       ORDER BY created_at,message_id""",
                    (group_id, list(versions)))
        rows = cur.fetchall()
        if {row["message_id"]:row["source_version"] for row in rows} != versions:
            raise BadRequestError(message="LINE messages changed; synchronize and retry")
        return rows
