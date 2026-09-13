"""Real SQL/permissions with two disposable databases; AI is always synthetic."""
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4
from types import ModuleType
from unittest.mock import patch
import importlib
import sys
import os

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import make_dsn, STATUS_READY
import pytest

from core import config
from core.db import pg_db
from core.exceptions import AppException
from services.line_source import line_db, fetch_page, read_messages
from services.line_sync import apply_page, sync_line

# Only the AI boundary is replaced; SQL, migrations and business helpers are real.
# Keep the production import path untouched by this migration-only PR.
ai_stub = ModuleType("ai.chains.contact")
callback_stub = ModuleType("core.callbacks")
def unexpected_ai(*args, **kwargs):
    pytest.fail("A test must supply synthetic AI output")
ai_stub.get_extract_contact_chain = unexpected_ai
callback_stub.TokenTrackerHandler = unexpected_ai
with patch.dict(sys.modules, {"ai.chains.contact": ai_stub, "core.callbacks": callback_stub}):
    service = importlib.import_module("services.line")

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
        cur.execute((ROOT / 'migrations/outbox.sql').read_text())
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
    return execute(direct['app'], """SELECT message_id,source_version,processed_version
        FROM line_message_processing ORDER BY message_id""")


def synthetic_summary(*args, **kwargs):
    return {'company_th': 'Synthetic company', 'contacts': [{'name_th': 'Synthetic person'}]}


def test_two_databases_use_view_only_source_and_never_copy_bodies(direct):
    seed(direct)
    assert 'Source-only' not in str(fetch_page(0))
    cutover(direct)
    assert execute(direct['app'], "SELECT to_regclass('line_messages')") == [(None,)]
    assert execute(direct['app'], """SELECT count(*) FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='line_message_processing'
        AND column_name IN ('text_content','raw_payload')""") == [(0,)]
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        execute(direct['reader'], 'SELECT * FROM line_messages')
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        execute(direct['reader'], 'UPDATE line_messages SET is_read=true')
    with line_db.get_connection() as conn, conn.cursor() as cursor:
        cursor.execute('SHOW transaction_read_only')
        assert cursor.fetchone() == ('on',)
    conn = line_db.pool.getconn()
    assert conn.status == STATUS_READY
    line_db.pool.putconn(conn)


def test_existing_company_mapping_and_group_join_survive_cutover(direct):
    seed(direct)
    execute(direct['app'], "INSERT INTO line_groups(group_id) VALUES('group-1')")
    execute(direct['app'], "INSERT INTO companies(group_id,company_th) VALUES('group-1','Existing company')")
    cutover(direct)
    execute(direct['app'], (ROOT / 'migrations/line_direct_cutover.sql').read_text())
    execute(direct['app'], "DELETE FROM line_groups WHERE group_id='group-1'")
    execute(direct['source'], "UPDATE line_groups SET display_name='Renamed group'")
    group = service.get_line_groups().items[0]
    assert group.display_name == 'Renamed group'
    assert group.company_th == 'Existing company'
    assert execute(direct['app'], 'SELECT group_id FROM companies') == [('group-1',)]


def test_extraction_keeps_pending_pg_records_and_does_not_enqueue_graph(direct, monkeypatch):
    seed(direct)
    cutover(direct)
    monkeypatch.setattr(service, 'summarize_line_group_messages', synthetic_summary)
    result = service.update_information(1)
    assert result.total == 0
    assert execute(direct['app'], 'SELECT is_linked FROM companies') == [(False,)]
    assert execute(direct['app'], 'SELECT status FROM employees') == [('pending',)]
    assert execute(direct['app'], 'SELECT count(*) FROM graph_outbox') == [(0,)]
    row = state(direct)[0]
    assert row[1] == row[2]
    assert execute(direct['source'], 'SELECT is_read FROM line_messages') == [(False,)]
    monkeypatch.setattr(service, 'summarize_line_group_messages', unexpected_ai)
    assert service.update_information(1).total == 0


def test_source_transport_pages_do_not_limit_or_reorder_ai_group_input(direct, monkeypatch):
    seed(direct)
    execute(direct['source'], "DELETE FROM line_messages")
    execute(direct['source'], """INSERT INTO line_messages(message_id,group_id,text_content,created_at)
        SELECT 'message-' || n,'group-1','text-' || n,
            '2026-01-01'::timestamptz + (n || ' seconds')::interval
        FROM generate_series(205,1,-1) n""")
    cutover(direct)
    calls = []
    def summarize(text, **kwargs):
        calls.append(text.splitlines())
        return synthetic_summary()
    monkeypatch.setattr(service, 'summarize_line_group_messages', summarize)
    assert service.update_information(1).total == 0
    assert calls == [[f'text-{n}' for n in range(1,206)]]
    assert execute(direct['app'], 'SELECT count(*) FROM line_message_processing WHERE processed_version IS NOT NULL') == [(205,)]


def test_new_source_arrivals_remain_unprocessed_locally(direct, monkeypatch):
    seed(direct)
    cutover(direct)
    def summarize(*args, **kwargs):
        execute(direct['source'], """INSERT INTO line_messages(message_id,group_id,text_content)
            VALUES('message-2','group-1','Later source message')""")
        return synthetic_summary()
    monkeypatch.setattr(service, 'summarize_line_group_messages', summarize)
    assert service.update_information(1).total == 0
    sync_line()
    rows = state(direct)
    assert rows[0][2] is not None and rows[1][2] is None


@pytest.mark.parametrize('change', [
    "UPDATE line_messages SET text_content='Changed during source read'",
    "INSERT INTO line_unsent_messages(message_id) VALUES('message-1')",
])
def test_source_version_failure_rolls_back_business_writes_and_local_ack(direct, monkeypatch, change):
    seed(direct)
    cutover(direct)
    def summarize(*args, **kwargs):
        execute(direct['source'], change)
        return synthetic_summary()
    monkeypatch.setattr(service, 'summarize_line_group_messages', summarize)
    assert service.update_information(1).total == 1
    assert execute(direct['app'], 'SELECT count(*) FROM companies') == [(0,)]
    assert execute(direct['app'], 'SELECT count(*) FROM employees') == [(0,)]
    assert state(direct)[0][2] is None


def test_ai_failure_keeps_messages_pending(direct, monkeypatch):
    seed(direct)
    cutover(direct)
    def fail(*args, **kwargs):
        raise RuntimeError('Synthetic AI failure')
    monkeypatch.setattr(service, 'summarize_line_group_messages', fail)
    assert service.update_information(1).total == 1
    assert state(direct)[0][2] is None
    assert execute(direct['app'], 'SELECT count(*) FROM companies') == [(0,)]


def test_bootstrap_read_flags_are_adopted_once_without_reopening_messages(direct, monkeypatch):
    seed(direct, read=True)
    cutover(direct)
    original = state(direct)[0]
    assert original[1] == original[2]
    execute(direct['source'], "UPDATE line_messages SET text_content='Edited after baseline'")
    sync_line()
    changed = state(direct)[0]
    assert changed[1] > original[1] and changed[2] == original[2]
    monkeypatch.setattr(service, 'summarize_line_group_messages', unexpected_ai)
    assert service.update_information(1).total == 0
    execute(direct['source'], "INSERT INTO line_messages(message_id,group_id,text_content,is_read) VALUES('message-2','group-1','New message',true)")
    sync_line()
    assert state(direct)[1][2] is None


def test_wrong_identity_owner_and_restore_regression_fail_without_progress(direct, monkeypatch):
    seed(direct)
    monkeypatch.setattr(config, 'LINE_SOURCE_ID', str(uuid4()))
    with pytest.raises(AppException):
        sync_line()
    assert execute(direct['app'], 'SELECT cursor FROM line_direct_sync_state') == [(0,)]
    monkeypatch.setattr(config, 'LINE_SOURCE_ID', SOURCE)
    with pytest.raises(AppException):
        fetch_page(999999)
    line_db.close()
    monkeypatch.setattr(config, 'LINE_DATABASE_URL', direct['source'])
    with pytest.raises(AppException):
        sync_line()


def test_invalid_sync_page_rolls_back_group_metadata_and_cursor(direct):
    seed(direct)
    page = fetch_page(0)
    page['next_cursor'] += 1
    with pytest.raises(ValueError):
        with pg_db.get_connection() as conn:
            apply_page(conn, page, 0, SOURCE, page['watermark'])
    assert execute(direct['app'], 'SELECT count(*) FROM line_group_refs') == [(0,)]
    assert execute(direct['app'], 'SELECT cursor FROM line_direct_sync_state') == [(0,)]


def test_extraction_is_blocked_until_fk_cutover(direct, monkeypatch):
    seed(direct)
    sync_line()
    monkeypatch.setattr(service, 'summarize_line_group_messages', unexpected_ai)
    with pytest.raises(AppException):
        service.update_information(1)


@pytest.mark.parametrize('is_linked', [False, True])
def test_existing_company_link_condition_is_preserved(direct, monkeypatch, is_linked):
    seed(direct)
    cutover(direct)
    execute(direct['app'], "INSERT INTO companies(group_id,company_th,is_linked) VALUES('group-1','Existing company',%s)", (is_linked,))
    monkeypatch.setattr(service, 'summarize_line_group_messages', synthetic_summary)
    result = service.update_information(1)
    # This preserves the original condition, including its existing error when
    # an unconfirmed company already owns the unique group ID. Fix separately.
    assert result.total == (0 if is_linked else 1)
    assert execute(direct['app'], 'SELECT count(*) FROM companies') == [(1,)]
    assert execute(direct['app'], 'SELECT count(*) FROM employees') == [(1 if is_linked else 0,)]
    assert execute(direct['app'], 'SELECT count(*) FROM graph_outbox') == [(0,)]


def test_legacy_local_tables_are_never_used_for_reads_or_acknowledgements(direct, monkeypatch):
    seed(direct)
    cutover(direct)
    execute(direct['app'], "INSERT INTO line_groups(group_id,display_name) VALUES('group-1','Stale local group')")
    execute(direct['app'], """CREATE TABLE line_messages(
        message_id text PRIMARY KEY,group_id text,message_type text,text_content text,
        created_at timestamptz DEFAULT now(),is_read boolean DEFAULT false)""")
    execute(direct['app'], "INSERT INTO line_messages(message_id,group_id,message_type,text_content) VALUES('old-1','group-1','text','Stale local conversation')")
    calls = []
    def summarize(text, **kwargs):
        calls.append(text)
        return synthetic_summary()
    monkeypatch.setattr(service, 'summarize_line_group_messages', summarize)
    assert service.get_line_groups().items[0].display_name == 'Synthetic group'
    assert service.update_information(1).total == 0
    assert calls == ['Source-only synthetic conversation']
    assert execute(direct['app'], 'SELECT is_read FROM line_messages') == [(False,)]
    assert execute(direct['source'], 'SELECT is_read FROM line_messages') == [(False,)]
    assert execute(direct['app'], 'SELECT count(*) FROM employees') == [(1,)]
    assert state(direct)[0][1] == state(direct)[0][2]
    assert execute(direct['app'], 'SELECT count(*) FROM graph_outbox') == [(0,)]
    # A missing source must fail instead of processing the stale local copy.
    line_db.close()
    monkeypatch.setattr(config, 'LINE_DATABASE_URL', None)
    monkeypatch.setattr(service, 'summarize_line_group_messages', unexpected_ai)
    with pytest.raises(AppException):
        service.update_information(1)
    assert execute(direct['app'], 'SELECT is_read FROM line_messages') == [(False,)]


@pytest.mark.parametrize('name', ['LINE_DATABASE_URL', 'LINE_SOURCE_ID'])
def test_source_configuration_is_always_required(monkeypatch, name):
    monkeypatch.setattr(config, 'LINE_DATABASE_URL', 'unused-test-source')
    monkeypatch.setattr(config, 'LINE_SOURCE_ID', SOURCE)
    assert not {'LINE_DATABASE_URL', 'LINE_SOURCE_ID'}.intersection(config.missing_required())
    monkeypatch.setattr(config, name, None)
    assert name in config.missing_required()


@pytest.mark.parametrize('has_read_history', [False, True])
def test_migration_adopts_legacy_read_history_only_when_present(direct, has_read_history):
    execute(direct['app'], 'DROP TABLE line_direct_sync_state,line_message_processing,line_group_refs')
    execute(direct['app'], "INSERT INTO line_groups(group_id) VALUES('group-1')")
    execute(direct['app'], 'CREATE TABLE line_messages(message_id text PRIMARY KEY,group_id text)')
    if has_read_history:
        execute(direct['app'], 'ALTER TABLE line_messages ADD COLUMN is_read boolean DEFAULT true')
    execute(direct['app'], "INSERT INTO line_messages(message_id,group_id) VALUES('message-1','group-1')")
    migration = (ROOT / 'migrations/line_direct.sql').read_text()
    execute(direct['app'], migration)
    execute(direct['app'], migration)
    seed(direct)
    cutover(direct)
    row = state(direct)[0]
    assert (row[2] is not None) == has_read_history
    # Re-running deployment migrations cannot import stale legacy flags again.
    if has_read_history:
        execute(direct['app'], 'UPDATE line_messages SET is_read=false')
    execute(direct['app'], migration)
    assert state(direct)[0] == row
