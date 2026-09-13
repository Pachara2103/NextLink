"""Authenticated, replayable LINE projection; never connects to the source DB."""
import json
from urllib.parse import urlparse
from uuid import UUID

import httpx

from core import config
from core.db import pg_db
from core.exceptions import BadRequestError


def projection_enabled():
    if config.LINE_DATA_MODE not in {"shared", "api"}:
        raise BadRequestError(message="LINE_DATA_MODE must be shared or api")
    return config.LINE_DATA_MODE == "api"


def fetch_page(cursor):
    url = config.LINE_INTEGRATION_URL or ""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise BadRequestError(message="Configure an HTTPS LINE_INTEGRATION_URL without credentials")
    if not config.LINE_INTEGRATION_API_KEY or len(config.LINE_INTEGRATION_API_KEY) < 32:
        raise BadRequestError(message="Configure LINE_INTEGRATION_API_KEY")
    try:
        # Do not forward credentials through redirects; cap response memory.
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            with client.stream("GET", url.rstrip("/") + "/api/v1/integration/changes",
                               params={"cursor": str(cursor), "limit": 100},
                               headers={"x-api-key": config.LINE_INTEGRATION_API_KEY}) as response:
                response.raise_for_status()
                data = bytearray()
                for chunk in response.iter_bytes():
                    data.extend(chunk)
                    if len(data) > 4_000_000:
                        raise ValueError("oversized response")
                return json.loads(data)
    except (httpx.HTTPError, ValueError):
        raise BadRequestError(message="LINE synchronization failed; retry later") from None


def apply_page(conn, page, expected_cursor, expected_source):
    """Apply records and cursor atomically. Caller must hold the sync-state lock."""
    if page.get("version") != 1 or str(UUID(page.get("source_id", ""))) != str(UUID(expected_source)):
        raise ValueError("Unexpected LINE source or protocol")
    items = page.get("items")
    next_cursor = int(page["next_cursor"])
    if not isinstance(items, list) or len(items) > 100 or next_cursor < expected_cursor:
        raise ValueError("Invalid LINE page")
    previous = expected_cursor
    with conn.cursor() as cursor:
        for item in items:
            version = int(item["version"])
            if version <= previous or version > next_cursor:
                raise ValueError("LINE page is not ordered")
            previous = version
            entity_id, data = item["entity_id"], item["data"]
            if item["entity"] == "group":
                if data is not None and data["group_id"] != entity_id:
                    raise ValueError("Group identity mismatch")
                row = data or {}
                cursor.execute("""INSERT INTO line_group_refs(group_id,display_name,is_active,deleted,source_version,created_at,updated_at)
                    VALUES (%s,%s,%s,%s,%s,COALESCE(%s::timestamptz,now()),COALESCE(%s::timestamptz,now()))
                    ON CONFLICT(group_id) DO UPDATE SET display_name=EXCLUDED.display_name,
                    is_active=EXCLUDED.is_active,deleted=EXCLUDED.deleted,source_version=EXCLUDED.source_version,
                    updated_at=EXCLUDED.updated_at WHERE line_group_refs.source_version < EXCLUDED.source_version""",
                    (entity_id,row.get("display_name"),row.get("is_active",False),data is None,version,row.get("created_at"),row.get("updated_at")))
            elif item["entity"] == "message":
                if data is not None and data["message_id"] != entity_id:
                    raise ValueError("Message identity mismatch")
                row = data or {}
                text = row.get("text_content") if row.get("direction") == "inbound" and row.get("message_type") == "text" and not row.get("unsent_at") else None
                cursor.execute("""INSERT INTO line_message_refs(message_id,group_id,message_type,direction,text_content,
                    unsent_at,sent_at,created_at,source_version,deleted,is_read)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,COALESCE(%s::timestamptz,now()),%s,%s,%s)
                    ON CONFLICT(message_id) DO UPDATE SET
                    group_id=COALESCE(EXCLUDED.group_id,line_message_refs.group_id),message_type=EXCLUDED.message_type,
                    direction=EXCLUDED.direction,text_content=EXCLUDED.text_content,unsent_at=EXCLUDED.unsent_at,
                    sent_at=EXCLUDED.sent_at,source_version=EXCLUDED.source_version,deleted=EXCLUDED.deleted,
                    needs_review=line_message_refs.needs_review OR (line_message_refs.is_read AND line_message_refs.text_content IS NOT NULL
                        AND line_message_refs.text_content IS DISTINCT FROM EXCLUDED.text_content),
                    is_read=CASE WHEN EXCLUDED.text_content IS NULL THEN true
                        WHEN line_message_refs.text_content IS DISTINCT FROM EXCLUDED.text_content THEN false
                        ELSE line_message_refs.is_read END
                    WHERE line_message_refs.source_version < EXCLUDED.source_version""",
                    (entity_id,row.get("group_id"),row.get("message_type"),row.get("direction"),text,row.get("unsent_at"),
                     row.get("sent_at"),row.get("created_at"),version,data is None,text is None or row.get("legacy_is_read",False)))
            else:
                raise ValueError("Unknown LINE entity")
        if previous != next_cursor or (page.get("has_more") and not items):
            raise ValueError("Invalid cursor boundary")
        cursor.execute("UPDATE line_sync_state SET source_id=%s,cursor=%s,synced_at=now() WHERE id=true",
                       (expected_source,next_cursor))
    return len(items)


def sync_line(max_pages=10):
    if not projection_enabled():
        raise BadRequestError(message="Enable LINE_DATA_MODE=api after migration")
    try:
        expected_source = str(UUID(config.LINE_INTEGRATION_SOURCE_ID or ""))
    except ValueError:
        raise BadRequestError(message="Configure the verified LINE_INTEGRATION_SOURCE_ID") from None
    total = 0
    for _ in range(min(max(1,max_pages),10)):
        with pg_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout='5s'")
                cursor.execute("SELECT source_id::text,cursor FROM line_sync_state WHERE id=true FOR UPDATE")
                state = cursor.fetchone()
                if not state or (state[0] and state[0] != expected_source):
                    raise BadRequestError(message="LINE projection source does not match configuration")
            page = fetch_page(state[1])
            try:
                total += apply_page(conn,page,state[1],expected_source)
            except (ValueError,KeyError,TypeError):
                raise BadRequestError(message="Invalid LINE synchronization response; cursor unchanged") from None
            conn.commit()
        if not page.get("has_more"):
            return {"synced":total,"cursor":page["next_cursor"],"has_more":False}
    return {"synced":total,"cursor":page["next_cursor"],"has_more":True}
