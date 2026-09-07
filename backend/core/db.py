import ssl
import threading
from contextlib import contextmanager

import certifi
import psycopg2
import psycopg2.pool
from neo4j import GraphDatabase

from core import config
from core.exceptions import DatabaseError, NotFoundError, BadRequestError


def _tls(uri):
    if not uri:
        return uri, {}

    scheme, _, rest = uri.partition("://")
    if not scheme.endswith("+s"):
        return uri, {}

    return (
        f"{scheme[:-2]}://{rest}",
        {"ssl_context": ssl.create_default_context(cafile=certifi.where())},
    )


class Neo4jConnection:

    def __init__(self):
        self._driver = None
        self._lock = threading.Lock()

    @property
    def db_name(self):
        return config.NEO4J_DATABASE

    @property
    def driver(self):
        if self._driver is None:
            with self._lock:
                if self._driver is None:
                    self._driver = self._connect()
        return self._driver

    def _connect(self):
        if not config.NEO4J_URI:
            raise DatabaseError(message=f"ยังไม่ได้ตั้งค่า NEO4J_URI ใน {config.ENV_PATH}")

        uri, tls = _tls(config.NEO4J_URI)
        try:
            return GraphDatabase.driver(
                uri,
                auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
                **tls,
                max_connection_pool_size=50,
                connection_timeout=10.0,
                max_connection_lifetime=300.0,
                liveness_check_timeout=30.0,
                keep_alive=True,
            )
        except Exception as e:
            raise DatabaseError(message="เชื่อมต่อฐานข้อมูลกราฟไม่ได้") from e

    def check(self) -> None:
        """ยิงเช็คว่าต่อได้จริง ใช้ตอน startup เพื่อรู้เร็วกว่ารอ request แรก"""
        self.driver.verify_connectivity()

    def close(self):
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    @contextmanager
    def get_session(self):
        session = self.driver.session(database=self.db_name)
        tx = session.begin_transaction()
        try:
            yield tx
            tx.commit()

        except (NotFoundError, BadRequestError, DatabaseError):
            tx.rollback()
            raise

        except Exception as e:
            tx.rollback()
            raise DatabaseError(message="เกิดข้อผิดพลาดไม่ทราบสาเหตุ") from e
        finally:
            session.close()


graph_db = Neo4jConnection()


class PostgresPool:

    def __init__(self):
        self._pool = None
        self._lock = threading.Lock()

    @property
    def pool(self):
        if self._pool is None:
            with self._lock:
                if self._pool is None:
                    self._pool = self._create_pool()
        return self._pool

    def _create_pool(self):
        if not config.DATABASE_PUBLIC_URL:
            raise DatabaseError(
                message=f"ยังไม่ได้ตั้งค่า DATABASE_PUBLIC_URL ใน {config.ENV_PATH}"
            )

        try:
            return psycopg2.pool.ThreadedConnectionPool(
                minconn=config.PG_POOL_MIN,
                maxconn=config.PG_POOL_MAX,
                dsn=config.DATABASE_PUBLIC_URL,
            )
        except psycopg2.Error as e:
            raise DatabaseError(message="เชื่อมต่อฐานข้อมูลไม่ได้") from e

    def check(self) -> None:
        with self.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1;")

    def close(self):
        if self._pool is not None:
            self._pool.closeall()
            self._pool = None

    @contextmanager
    def get_connection(self):
        pool = self.pool
        conn = pool.getconn()
        try:
            yield conn

        except (NotFoundError, BadRequestError, DatabaseError):
            conn.rollback()
            raise

        except Exception as e:
            conn.rollback()
            raise DatabaseError(message="เกิดข้อผิดพลาดไม่ทราบสาเหตุ") from e

        finally:
            pool.putconn(conn)


pg_db = PostgresPool()
