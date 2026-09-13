from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
import os

import psycopg2
import pytest

from core import config
from core.db import pg_db
from services.line_sync import apply_page, sync_line

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "deaaaaff-80b5-4832-aeca-e83e988e1c38"


@pytest.fixture
def projection(monkeypatch):
    schema = "line_test_" + uuid4().hex
    url = os.environ["TEST_DATABASE_URL"]
    with psycopg2.connect(url) as admin:
        with admin.cursor() as cur:
            cur.execute(f"CREATE SCHEMA {schema}")
    def connect():
        return psycopg2.connect(url, options=f"-c search_path={schema}")
    conn = connect()
    with conn.cursor() as cur:
        cur.execute((ROOT / "migrations/init.sql").read_text())
        cur.execute((ROOT / "migrations/line_projection.sql").read_text())
        cur.execute((ROOT / "migrations/line_projection.sql").read_text())
        cur.execute("INSERT INTO users(id,username,password) VALUES (1,'synthetic','unused')")
    conn.commit()
    @contextmanager
    def get_connection():
        current = connect()
        try:
            yield current
        except Exception:
            current.rollback()
            raise
        finally:
            current.close()
    monkeypatch.setattr(pg_db, "get_connection", get_connection)
    monkeypatch.setattr(config, "LINE_DATA_MODE", "api")
    monkeypatch.setattr(config, "LINE_INTEGRATION_SOURCE_ID", SOURCE)
    yield conn, connect
    conn.close()
    with psycopg2.connect(url) as admin:
        with admin.cursor() as cur:
            cur.execute(f"DROP SCHEMA {schema} CASCADE")


def record(version, entity="message", text="synthetic text", read=False):
    data = {"message_id":"message-1","group_id":"group-1","message_type":"text",
            "direction":"inbound","text_content":text,"legacy_is_read":read,"unsent_at":None}
    if entity == "group":
        data = {"group_id":"group-1","display_name":"Synthetic group","is_active":True}
    return {"version":str(version),"entity":entity,"entity_id":data["group_id" if entity == "group" else "message_id"],"data":data}


def page(*items, cursor=None):
    return {"version":1,"source_id":SOURCE,"items":list(items),"next_cursor":str(cursor if cursor is not None else int(items[-1]["version"])),"has_more":False}


def value(conn, query):
    with conn.cursor() as cur:
        cur.execute(query)
        return cur.fetchone()


def test_preserves_read_state_and_redacts_processed_text_with_review_flag(projection):
    conn, _ = projection
    apply_page(conn,page(record(1,"group"),record(2,read=True)),0,SOURCE)
    conn.commit()
    assert value(conn,"SELECT is_read,text_content FROM line_message_refs") == (True,"synthetic text")
    apply_page(conn,page(record(3,read=False)),2,SOURCE)
    assert value(conn,"SELECT is_read FROM line_message_refs") == (True,)
    retracted = record(4,text=None)
    retracted["data"]["unsent_at"] = "2026-09-13T00:00:00Z"
    apply_page(conn,page(retracted),3,SOURCE)
    conn.commit()
    assert value(conn,"SELECT is_read,text_content,needs_review FROM line_message_refs") == (True,None,True)
    assert value(conn,"SELECT cursor FROM line_sync_state") == (4,)


def test_invalid_page_rolls_back_records_and_cursor(projection):
    conn, _ = projection
    with pytest.raises(ValueError):
        try:
            apply_page(conn,page(record(2,"group"),record(1)),0,SOURCE)
        except Exception:
            conn.rollback()
            raise
    assert value(conn,"SELECT count(*) FROM line_group_refs") == (0,)
    assert value(conn,"SELECT cursor FROM line_sync_state") == (0,)
    with pytest.raises(ValueError):
        apply_page(conn,page(record(1)),0,str(uuid4()))


def test_cutover_preserves_company_ids_and_targets_only_local_projection(projection):
    conn, _ = projection
    apply_page(conn,page(record(1,"group")),0,SOURCE)
    with conn.cursor() as cur:
        cur.execute("INSERT INTO line_groups(group_id) VALUES ('group-1')")
        cur.execute("INSERT INTO companies(group_id,company_th) VALUES ('group-1','Synthetic company')")
        cur.execute((ROOT / "migrations/line_projection_cutover.sql").read_text())
        cur.execute((ROOT / "migrations/line_projection_cutover.sql").read_text())
        cur.execute("DELETE FROM line_groups WHERE group_id='group-1'")
    conn.commit()
    assert value(conn,"SELECT group_id FROM companies") == ("group-1",)
    assert value(conn,"SELECT count(*) FROM pg_constraint WHERE conrelid='companies'::regclass AND confrelid='line_group_refs'::regclass") == (1,)


def test_sync_advances_only_after_validated_page_and_retries_without_reprocessing(projection, monkeypatch):
    conn, _ = projection
    import services.line_sync as service
    pages = {0:page(record(1,"group"),record(2,read=True)),2:page(cursor=2)}
    monkeypatch.setattr(service,"fetch_page",lambda cursor: pages[cursor])
    assert sync_line()["synced"] == 2
    assert sync_line()["synced"] == 0
    assert value(conn,"SELECT is_read FROM line_message_refs") == (True,)


def test_ai_acknowledges_only_selected_rows_even_when_new_message_arrives(projection,monkeypatch):
    conn, connect = projection
    import services.line as service
    apply_page(conn,page(record(1,"group"),record(2)),0,SOURCE)
    conn.commit()
    monkeypatch.setattr(service,"sync_line",lambda: {"has_more":False})
    def summarize(*args):
        with connect() as other:
            with other.cursor() as cur:
                cur.execute("INSERT INTO line_message_refs(message_id,group_id,message_type,direction,text_content,source_version) VALUES ('message-2','group-1','text','inbound','arrived during extraction',3)")
        return {"contacts":[]}
    monkeypatch.setattr(service,"summarize_line_group_messages",summarize)
    assert service.update_projected_information(1).total == 0
    assert value(conn,"SELECT is_read FROM line_message_refs WHERE message_id='message-1'") == (True,)
    assert value(conn,"SELECT is_read FROM line_message_refs WHERE message_id='message-2'") == (False,)


def test_ai_queues_graph_updates_in_the_same_transaction(projection,monkeypatch):
    conn, _ = projection
    import services.line as service
    apply_page(conn,page(record(1,"group"),record(2)),0,SOURCE)
    with conn.cursor() as cur:
        cur.execute((ROOT / "migrations/line_projection_cutover.sql").read_text())
    conn.commit()
    monkeypatch.setattr(service,"sync_line",lambda: {"has_more":False})
    monkeypatch.setattr(service,"summarize_line_group_messages",lambda *args: {
        "company_th":"Synthetic company","contacts":[{"name_th":"Synthetic person"}]})
    assert service.update_projected_information(1).total == 0
    assert value(conn,"SELECT count(*) FROM companies") == (1,)
    assert value(conn,"SELECT count(*) FROM employees") == (1,)
    assert value(conn,"SELECT count(*) FROM graph_outbox WHERE status='pending'") == (2,)
    assert value(conn,"SELECT is_read FROM line_message_refs") == (True,)
