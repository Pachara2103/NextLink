"""Adapt the existing LINE extraction flow to two PostgreSQL databases.

Only group/message metadata is local. Bodies stay in the LINE source and are
read into the same per-group input the existing AI flow already consumes.
"""
from collections import defaultdict

from core.exceptions import BadRequestError
from services.line_source import read_messages


class GroupMessages(defaultdict):
    def __init__(self):
        super().__init__(list)
        self.versions = defaultdict(dict)


def _read_group(group_id, versions):
    # The SQL transport is paged; the AI still receives the whole pending group.
    items = list(versions.items())
    rows = []
    for offset in range(0, len(items), 200):
        rows.extend(read_messages(group_id, dict(items[offset:offset + 200])))
    return sorted(rows, key=lambda row: (row["created_at"], row["message_id"]))


def get_direct_group_messages(conn):
    batch = GroupMessages()
    with conn.cursor() as cursor:
        cursor.execute("SELECT cutover_ready FROM line_direct_sync_state WHERE id=true")
        state = cursor.fetchone()
        if not state or not state[0]:
            raise BadRequestError(message="Apply line_direct_cutover.sql before extraction")
        # The source is read-only, so the existing FOR UPDATE claims move to
        # the local work rows. Transaction ownership stays with the caller.
        cursor.execute("""SELECT group_id,message_id,source_version
            FROM line_message_processing
            WHERE group_id IS NOT NULL AND eligible AND processed_version IS NULL
            ORDER BY group_id,source_version,message_id FOR UPDATE SKIP LOCKED""")
        for group_id, message_id, version in cursor.fetchall():
            batch.versions[group_id][message_id] = version
    for group_id, versions in batch.versions.items():
        texts = [row["text_content"] for row in _read_group(group_id, versions) if row["text_content"]]
        if texts:
            batch[group_id].extend(texts)
    return batch


def acknowledge_direct_group(conn, group_id, batch):
    if not isinstance(batch, GroupMessages) or group_id not in batch.versions:
        raise BadRequestError(message="The selected LINE message IDs are required")
    versions = batch.versions[group_id]
    # Acknowledgements refer to this source version, never to messages that
    # arrived after selection. Source failure leaves the local transaction open
    # for the existing caller to roll back, including its PostgreSQL inserts.
    _read_group(group_id, versions)
    with conn.cursor() as cursor:
        cursor.executemany("""UPDATE line_message_processing
            SET processed_version=source_version
            WHERE group_id=%s AND message_id=%s AND source_version=%s
                AND eligible AND processed_version IS NULL""",
            [(group_id, message_id, version) for message_id, version in versions.items()])
