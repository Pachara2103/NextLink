"""Bounded checkout waiting against the same guarded disposable PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from threading import Event

import pytest

from core import config
from core.db import PostgresPool
from core.exceptions import AppException, DatabaseError


@pytest.fixture
def single_connection_pool(monkeypatch):
    monkeypatch.setattr(config,"PG_POOL_MIN",1)
    monkeypatch.setattr(config,"PG_POOL_MAX",1)
    monkeypatch.setattr(config,"PG_POOL_WAIT_SECONDS",2)
    pool = PostgresPool()
    yield pool
    pool.close()


def test_short_concurrent_burst_waits_then_reuses_returned_connection(single_connection_pool):
    pool = single_connection_pool
    entering = Event()
    def read():
        entering.set()
        with pool.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                return cursor.fetchone()[0]
    with ThreadPoolExecutor(max_workers=1) as executor:
        with pool.get_connection() as first:
            with first.cursor() as cursor:
                cursor.execute("SELECT pg_backend_pid()")
                original_pid = cursor.fetchone()[0]
            queued = executor.submit(read)
            assert entering.wait(1)
            with pytest.raises(TimeoutError):
                queued.result(timeout=0.05)
        assert queued.result(timeout=2) == original_pid


def test_timeout_is_bounded_and_does_not_leak_capacity(single_connection_pool,monkeypatch):
    pool = single_connection_pool
    monkeypatch.setattr(config,"PG_POOL_WAIT_SECONDS",0)
    with pool.get_connection():
        with pytest.raises(AppException) as error:
            with pool.get_connection():
                pytest.fail("A second checkout must not exceed the configured capacity")
        assert error.value.status_code == 503
    pool.check()


def test_checkout_and_transaction_failures_return_capacity(single_connection_pool,monkeypatch):
    pool = single_connection_pool
    original = pool._checkout
    def fail(_):
        raise DatabaseError(message="synthetic unavailable database")
    monkeypatch.setattr(pool,"_checkout",fail)
    with pytest.raises(DatabaseError):
        with pool.get_connection():
            pass
    monkeypatch.setattr(pool,"_checkout",original)
    with pytest.raises(DatabaseError):
        with pool.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT non_existent_pool_test_column")
    pool.check()
