"""Copy group metadata and processing IDs, never message bodies, over SQL."""
from core.db import pg_db
from core.exceptions import BadRequestError
from services.line_source import direct_enabled, expected_source, fetch_page


def apply_page(conn, page, saved_cursor, source, bootstrap_watermark):
    """Caller holds the local sync-state lock; rows and cursor commit together."""
    if page["source_id"] != source or page["watermark"] < saved_cursor:
        raise ValueError("Unexpected source or regressed source watermark")
    previous = saved_cursor
    with conn.cursor() as cur:
        for item in page["items"]:
            version = item["source_version"]
            if not previous < item["change_id"] <= version <= page["watermark"]:
                raise ValueError("Invalid change ordering")
            previous = item["change_id"]
            if item["entity"] == "group":
                group = item["group_data"] or {}
                cur.execute("""INSERT INTO line_group_refs
                    (group_id,display_name,picture_url,is_active,deleted,source_version,created_at,updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,COALESCE(%s::timestamptz,now()),COALESCE(%s::timestamptz,now()))
                    ON CONFLICT(group_id) DO UPDATE SET display_name=EXCLUDED.display_name,
                    picture_url=EXCLUDED.picture_url,is_active=EXCLUDED.is_active,deleted=EXCLUDED.deleted,
                    source_version=EXCLUDED.source_version,updated_at=EXCLUDED.updated_at
                    WHERE line_group_refs.source_version < EXCLUDED.source_version""",
                    (item["entity_id"],group.get("display_name"),group.get("picture_url"),
                     group.get("is_active",False),not group,version,group.get("created_at"),group.get("updated_at")))
            elif item["entity"] == "message":
                # Legacy is_read has no extraction version. Preserve it only
                # at bootstrap and flag its unknown provenance for review.
                if item["message_group_id"] is None:
                    cur.execute("""UPDATE line_message_processing SET eligible=false,source_version=%s,
                        needs_review=needs_review OR processed_version IS NOT NULL
                        WHERE message_id=%s AND source_version<%s""",
                        (version,item["entity_id"],version))
                    continue
                legacy_read = item["legacy_is_read"] and version <= bootstrap_watermark
                cur.execute("""INSERT INTO line_message_processing
                    (message_id,group_id,source_version,eligible,processed_version,needs_review)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    ON CONFLICT(message_id) DO UPDATE SET
                    group_id=COALESCE(EXCLUDED.group_id,line_message_processing.group_id),
                    source_version=EXCLUDED.source_version,eligible=EXCLUDED.eligible,
                    processed_version=CASE WHEN line_message_processing.legacy_read
                        AND line_message_processing.source_version=0
                        AND EXCLUDED.source_version<=%s THEN EXCLUDED.source_version
                        ELSE line_message_processing.processed_version END,
                    legacy_read=false,
                    needs_review=line_message_processing.needs_review OR line_message_processing.legacy_read
                        OR line_message_processing.processed_version IS NOT NULL
                    WHERE line_message_processing.source_version < EXCLUDED.source_version""",
                    (item["entity_id"],item["message_group_id"],version,item["eligible"],
                     version if legacy_read else None,legacy_read,bootstrap_watermark))
            else:
                raise ValueError("Unexpected change entity")
        if previous != page["next_cursor"] or (page["has_more"] and not page["items"]):
            raise ValueError("Invalid cursor boundary")
        cur.execute("""UPDATE line_direct_sync_state SET source_id=%s,cursor=%s,
                       bootstrap_watermark=%s,synced_at=now(),caught_up=%s WHERE id=true""",
                    (source,previous,bootstrap_watermark,not page["has_more"]))
    return len(page["items"])


def sync_line(max_pages=10):
    if not direct_enabled():
        raise BadRequestError(message="Enable LINE_DATA_MODE=direct after migration")
    source = expected_source()
    total = 0
    for _ in range(min(max(1,max_pages),10)):
        with pg_db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL lock_timeout='5s'")
                cur.execute("""SELECT source_id::text,cursor,bootstrap_watermark
                               FROM line_direct_sync_state WHERE id=true FOR UPDATE""")
                state = cur.fetchone()
                if not state or (state[0] and state[0] != source):
                    raise BadRequestError(message="LINE processing state belongs to another source")
            page = fetch_page(state[1])
            watermark = page["watermark"] if state[2] is None else state[2]
            total += apply_page(conn,page,state[1],source,watermark)
            conn.commit()
        if not page["has_more"]:
            break
    return {"synced":total,"cursor":page["next_cursor"],"has_more":page["has_more"]}
