"""Real SQL/permissions with two disposable databases; AI is always synthetic."""
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import os

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import make_dsn, STATUS_READY
import pytest

from core import config
from core.db import pg_db
from core.exceptions import AppException
from services import line as service
from services.line_source import line_db, fetch_page, read_messages
from services.line_sync import apply_page, sync_line

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'deaaaaff-80b5-4832-aeca-e83e988e1c38'
TEST_URL = os.environ['TEST_DATABASE_URL']


@pytest.fixture(scope='module')
def source_url():
    name = 'nextlink_security_test_source_' + uuid4().hex[:12]
    admin = psycopg2.connect(TEST_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    yield make_dsn(TEST_URL, dbname=name)
    line_db.close()
    with admin.cursor() as cur:
        cur.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
    admin.close()


@pytest.fixture
def direct(monkeypatch, source_url):
    schema = 'line_test_' + uuid4().hex
    role = 'line_reader_' + uuid4().hex
    for url in (TEST_URL, source_url):
        with psycopg2.connect(url) as conn, conn.cursor() as cur:
            cur.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    app_dsn = make_dsn(TEST_URL, options=f'-c search_path={schema}')
    source_dsn = make_dsn(source_url, options=f'-c search_path={schema}')
    with psycopg2.connect(app_dsn) as conn, conn.cursor() as cur:
        cur.execute((ROOT / 'migrations/init.sql').read_text())
        cur.execute((ROOT / 'migrations/line_direct.sql').read_text())
        cur.execute((ROOT / 'migrations/line_direct.sql').read_text())
        cur.execute("INSERT INTO users(id,username,password) VALUES(1,'synthetic','unused')")
    with psycopg2.connect(source_dsn) as conn, conn.cursor() as cur:
        cur.execute((ROOT / 'tests/fixtures/line-source-v2.sql').read_text())
        cur.execute(sql.SQL("CREATE ROLE {} LOGIN NOINHERIT PASSWORD 'disposable-reader-fixture'").format(sql.Identifier(role)))
        cur.execute(sql.SQL('GRANT USAGE ON SCHEMA {} TO {}').format(sql.Identifier(schema),sql.Identifier(role)))
        cur.execute(sql.SQL('GRANT SELECT ON line_read_identity,line_read_changes,line_read_messages TO {}').format(sql.Identifier(role)))
    reader_dsn = make_dsn(source_dsn,user=role,password='disposable-reader-fixture')
    @contextmanager
    def get_connection():
        conn = psycopg2.connect(app_dsn)
        try:
            yield conn
        finally:
            conn.rollback()
            conn.close()
    line_db.close()
    monkeypatch.setattr(pg_db,'get_connection',get_connection)
    monkeypatch.setattr(config,'LINE_DATA_MODE','direct')
    monkeypatch.setattr(config,'LINE_SOURCE_ID',SOURCE)
    monkeypatch.setattr(config,'LINE_DATABASE_URL',reader_dsn)
    fixture = {'app':app_dsn,'source':source_dsn,'reader':reader_dsn}
    yield fixture
    line_db.close()
    for url in (TEST_URL,source_url):
        with psycopg2.connect(url) as conn, conn.cursor() as cur:
            cur.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
    with psycopg2.connect(source_url) as conn, conn.cursor() as cur:
        cur.execute(sql.SQL('DROP ROLE {}').format(sql.Identifier(role)))


def execute(dsn, statement, params=None):
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(statement,params)
        return cur.fetchall() if cur.description else None


def seed(direct, read=False):
    execute(direct['source'],"INSERT INTO line_groups(group_id,display_name) VALUES('group-1','Synthetic group')")
    execute(direct['source'],"""INSERT INTO line_messages(message_id,group_id,text_content,is_read)
        VALUES('message-1','group-1','Source-only synthetic conversation',%s)""",(read,))


def cutover(direct):
    assert sync_line()['has_more'] is False
    execute(direct['app'],(ROOT / 'migrations/line_direct_cutover.sql').read_text())


def state(direct):
    return execute(direct['app'],"""SELECT message_id,source_version,processed_version,eligible,needs_review
        FROM line_message_processing ORDER BY message_id""")


def test_sync_stores_no_bodies_and_actual_read_only_credentials(direct):
    seed(direct)
    page = fetch_page(0)
    assert 'Source-only' not in str(page)
    cutover(direct)
    assert execute(direct['app'],"SELECT to_regclass('line_message_refs')") == [(None,)]
    assert execute(direct['app'],"""SELECT count(*) FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='line_message_processing'
        AND column_name IN ('text_content','raw_payload','message_type','direction')""") == [(0,)]
    row = state(direct)[0]
    assert read_messages('group-1',{'message-1':row[1]})[0]['text_content'] == 'Source-only synthetic conversation'
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        execute(direct['reader'],"SELECT text_content FROM line_messages")
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        execute(direct['reader'],"UPDATE line_messages SET is_read=true")
    with line_db.get_connection() as conn, conn.cursor() as cur:
        cur.execute('SHOW transaction_read_only')
        assert cur.fetchone() == ('on',)
    conn = line_db.pool.getconn()
    assert conn.status == STATUS_READY
    line_db.pool.putconn(conn)


def test_groups_refresh_and_fk_cutover_preserve_company_mapping(direct):
    seed(direct)
    execute(direct['app'],"INSERT INTO line_groups(group_id) VALUES('group-1')")
    execute(direct['app'],"INSERT INTO companies(group_id,company_th) VALUES('group-1','Existing company')")
    cutover(direct)
    execute(direct['app'],(ROOT/'migrations/line_direct_cutover.sql').read_text())
    execute(direct['app'],"DELETE FROM line_groups WHERE group_id='group-1'")
    execute(direct['source'],"UPDATE line_groups SET display_name='Renamed group',updated_at=now()")
    group = service.get_line_groups().items[0]
    assert group.display_name == 'Renamed group'
    assert group.company_th == 'Existing company'
    assert execute(direct['app'],"SELECT group_id FROM companies") == [('group-1',)]


def test_read_bootstrap_duplicates_and_edits_require_review(direct,monkeypatch):
    seed(direct,read=True)
    cutover(direct)
    original = state(direct)[0]
    assert original[1] == original[2] and original[4]
    assert sync_line()['synced'] == 0
    execute(direct['source'],"UPDATE line_messages SET text_content='Edited after bootstrap'")
    sync_line()
    changed = state(direct)[0]
    assert changed[1] > original[1] and changed[2] == original[2] and changed[4]
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: pytest.fail('No automatic re-extraction of reviewed messages'))
    assert service.update_direct_information(1).total == 0


def test_source_identity_owner_and_restore_regression_are_rejected(direct,monkeypatch):
    seed(direct)
    monkeypatch.setattr(config,'LINE_SOURCE_ID',str(uuid4()))
    with pytest.raises(AppException): sync_line()
    assert execute(direct['app'],"SELECT cursor FROM line_direct_sync_state") == [(0,)]
    monkeypatch.setattr(config,'LINE_SOURCE_ID',SOURCE)
    with pytest.raises(AppException): fetch_page(999999)
    line_db.close()
    monkeypatch.setattr(config,'LINE_DATABASE_URL',direct['source'])
    with pytest.raises(AppException): sync_line()
    monkeypatch.setattr(config,'LINE_DATA_MODE','api')
    with pytest.raises(AppException): sync_line()


def test_failed_page_rolls_back_records_and_cursor(direct):
    seed(direct)
    page = fetch_page(0)
    page['next_cursor'] += 1
    with pytest.raises(ValueError):
        with pg_db.get_connection() as conn:
            apply_page(conn,page,0,SOURCE,page['watermark'])
    assert execute(direct['app'],"SELECT count(*) FROM line_group_refs") == [(0,)]
    assert execute(direct['app'],"SELECT cursor FROM line_direct_sync_state") == [(0,)]


def test_pagination_uses_latest_record_version_and_does_not_reopen_processed(direct,monkeypatch):
    seed(direct)
    for n in range(110):
        execute(direct['source'],"UPDATE line_messages SET text_content=%s",(f'Newest source {n}',))
    result = sync_line(max_pages=1)
    assert result['has_more']
    newest = state(direct)[0][1]
    assert newest > result['cursor']
    cutover(direct)
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: {'contacts':[]})
    assert service.update_direct_information(1).total == 0
    assert state(direct)[0][2] == newest
    assert sync_line()['synced'] == 0


def test_ai_acknowledges_only_selected_ids_and_keeps_source_is_read_unchanged(direct,monkeypatch):
    seed(direct)
    cutover(direct)
    def summarize(*args):
        execute(direct['source'],"""INSERT INTO line_messages(message_id,group_id,text_content)
            VALUES('message-2','group-1','Arrived during extraction')""")
        return {'contacts':[]}
    monkeypatch.setattr(service,'summarize_line_group_messages',summarize)
    assert service.update_direct_information(1).total == 0
    sync_line()
    rows=state(direct)
    assert rows[0][2] == rows[0][1] and rows[1][2] is None
    assert execute(direct['source'],"SELECT bool_or(is_read) FROM line_messages") == [(False,)]


@pytest.mark.parametrize('change',[
    "UPDATE line_messages SET text_content='Changed during AI'",
    "INSERT INTO line_unsent_messages(message_id) VALUES('message-1')",
])
def test_edit_or_unsend_during_ai_rolls_back_results_and_ack(direct,monkeypatch,change):
    seed(direct)
    cutover(direct)
    def summarize(*args):
        execute(direct['source'],change)
        return {'company_th':'Synthetic company','contacts':[{'name_th':'Synthetic contact'}]}
    monkeypatch.setattr(service,'summarize_line_group_messages',summarize)
    assert service.update_direct_information(1).total == 1
    assert state(direct)[0][2] is None
    assert execute(direct['app'],'SELECT count(*) FROM companies') == [(0,)]
    assert execute(direct['app'],'SELECT count(*) FROM graph_outbox') == [(0,)]
    sync_line()
    if 'unsent' in change:
        assert state(direct)[0][3] is False
        assert execute(direct['reader'],'SELECT count(*) FROM line_read_messages') == [(0,)]


def test_ai_business_data_outbox_and_ack_share_one_transaction(direct,monkeypatch):
    seed(direct)
    cutover(direct)
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: {
        'company_th':'Synthetic company','contacts':[{'name_th':'Synthetic person'}]})
    assert service.update_direct_information(1).total == 0
    assert execute(direct['app'],'SELECT count(*) FROM companies') == [(1,)]
    assert execute(direct['app'],'SELECT count(*) FROM employees') == [(1,)]
    assert execute(direct['app'],"SELECT count(*) FROM graph_outbox WHERE status='pending'") == [(2,)]
    assert state(direct)[0][2] == state(direct)[0][1]
    assert service.update_direct_information(1).total == 0
    assert execute(direct['app'],'SELECT count(*) FROM employees') == [(1,)]


def test_parallel_extractions_do_not_process_same_group_twice(direct,monkeypatch):
    seed(direct)
    cutover(direct)
    entered, release = Event(), Event()
    def summarize(*args):
        entered.set()
        assert release.wait(10)
        return {'contacts':[]}
    monkeypatch.setattr(service,'summarize_line_group_messages',summarize)
    with ThreadPoolExecutor(2) as workers:
        first=workers.submit(service.update_direct_information,1)
        try:
            assert entered.wait(10)
            assert workers.submit(service.update_direct_information,1).result(timeout=10).total == 0
        finally:
            release.set()
        assert first.result(timeout=10).total == 0
    assert state(direct)[0][2] == state(direct)[0][1]


def test_cutover_requires_completed_sync_and_extraction_requires_cutover(direct,monkeypatch):
    seed(direct)
    with pytest.raises(psycopg2.errors.RaiseException):
        execute(direct['app'],(ROOT/'migrations/line_direct_cutover.sql').read_text())
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: pytest.fail('No extraction before cutover'))
    with pytest.raises(AppException): service.update_direct_information(1)


def test_legacy_local_flags_are_imported_once_without_text(direct):
    seed(direct)
    execute(direct['app'],"""DROP TABLE line_direct_sync_state,line_message_processing;
        CREATE TABLE line_messages(message_id TEXT,group_id TEXT,is_read BOOLEAN,text_content TEXT);
        INSERT INTO line_messages VALUES('message-1','group-1',true,'Old local source text')""")
    execute(direct['app'],(ROOT/'migrations/line_direct.sql').read_text())
    cutover(direct)
    assert state(direct)[0][2] == state(direct)[0][1]
    assert state(direct)[0][4]
    execute(direct['source'],"INSERT INTO line_messages(message_id,group_id,text_content) VALUES('message-2','group-1','New text')")
    sync_line()
    execute(direct['app'],(ROOT/'migrations/line_direct.sql').read_text())
    assert state(direct)[1][2] is None


def test_source_failure_does_not_advance_cursor_or_ack(direct,monkeypatch):
    seed(direct)
    cutover(direct)
    before=state(direct)
    line_db.close()
    monkeypatch.setattr(config,'LINE_DATABASE_URL',make_dsn(direct['reader'],port=1))
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: pytest.fail('Source unavailable'))
    with pytest.raises(AppException): service.update_direct_information(1)
    assert state(direct) == before


def test_adopts_prior_api_processing_without_copying_bodies(direct):
    seed(direct)
    execute(direct['app'],"""DROP TABLE line_direct_sync_state,line_message_processing;
        CREATE TABLE line_sync_state(id BOOLEAN,source_id UUID);
        INSERT INTO line_sync_state VALUES(true,'deaaaaff-80b5-4832-aeca-e83e988e1c38');
        CREATE TABLE line_message_refs(message_id TEXT,group_id TEXT,source_version BIGINT,
          is_read BOOLEAN,needs_review BOOLEAN,text_content TEXT);
        INSERT INTO line_message_refs VALUES('message-1','group-1',2,false,false,'Old API copy')""")
    execute(direct['app'],(ROOT/'migrations/line_direct.sql').read_text())
    cutover(direct)
    assert state(direct)[0][2] is None and state(direct)[0][3] is True
    assert execute(direct['app'],"SELECT source_id::text FROM line_direct_sync_state") == [(SOURCE,)]
    assert execute(direct['app'],"SELECT text_content FROM line_message_refs") == [('Old API copy',)]


def test_tombstones_do_not_create_direct_chat_state_or_restore_processed_content(direct,monkeypatch):
    seed(direct)
    execute(direct['source'],"INSERT INTO line_messages(message_id,group_id,text_content) VALUES('direct-chat',NULL,'Private direct text')")
    cutover(direct)
    assert len(state(direct)) == 1
    monkeypatch.setattr(service,'summarize_line_group_messages',lambda *args: {'contacts':[]})
    assert service.update_direct_information(1).total == 0
    execute(direct['source'],"INSERT INTO line_unsent_messages VALUES('message-1')")
    sync_line()
    row=state(direct)[0]
    assert row[2] is not None and row[3] is False and row[4] is True
    with pytest.raises(AppException): read_messages('group-1',{'message-1':row[1]})
    execute(direct['source'],"DELETE FROM line_messages WHERE message_id='message-1'")
    sync_line()
    assert state(direct)[0][3] is False


def test_partial_bootstrap_does_not_acknowledge_a_later_edit(direct):
    execute(direct['source'],"INSERT INTO line_groups(group_id) SELECT 'g-'||n FROM generate_series(1,100) n")
    execute(direct['source'],"INSERT INTO line_messages(message_id,group_id,text_content,is_read) VALUES('message-1','g-1','Before bootstrap',true)")
    assert sync_line(max_pages=1)['has_more'] is True
    execute(direct['source'],"UPDATE line_messages SET text_content='Edited after bootstrap began'")
    assert sync_line()['has_more'] is False
    assert state(direct)[0][2] is None


def test_deleted_groups_remain_valid_local_references_but_not_current_groups(direct):
    seed(direct)
    cutover(direct)
    execute(direct['app'],"INSERT INTO companies(group_id,company_th) VALUES('group-1','Historical company')")
    execute(direct['source'],"DELETE FROM line_messages; DELETE FROM line_groups")
    assert service.get_line_groups().items == []
    assert execute(direct['app'],"SELECT group_id FROM companies") == [('group-1',)]
    assert execute(direct['app'],"SELECT deleted FROM line_group_refs") == [(True,)]
