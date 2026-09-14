import logging
import ssl
import threading
from contextlib import contextmanager

import certifi
import psycopg2
import psycopg2.pool
from neo4j import GraphDatabase

from core import config
from core.exceptions import AppException, DatabaseError, NotFoundError, BadRequestError


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


# ─────────────────────────────────────────────────────────────────────────────
# connection ที่ตายคามือ pool
#
# อาการ: กดอะไรก็ได้ที่แตะ line_db แล้วได้ 500 พร้อม
#   psycopg2.OperationalError: SSL connection has been closed unexpectedly
# ส่วน endpoint ที่แตะ nl_db ตอบ 200 ตามปกติ
#
# ที่มันต่างกันเพราะปลายทางคนละแบบ: nl_db อยู่ที่ localhost ส่วน line_db อยู่ที่
# Neon ผ่าน endpoint แบบ -pooler (pgbouncer) ซึ่ง
#   - พัก compute เองเมื่อไม่มีใครใช้สักพัก (scale to zero) connection ที่ค้าง
#     อยู่ถูกตัดทิ้งทั้งหมด
#   - ตัด client connection ที่ idle ทิ้งเองอีกชั้นหนึ่ง
# ทั้งสองอย่างเกิดแบบเงียบ ๆ psycopg2 ไม่รู้จนกว่าจะลองใช้จริง pool จึงยื่น
# connection ที่ตายไปแล้วให้ request ถัดไป
#
# กันสามชั้น:
#   1. เปิด TCP keepalive + ตั้ง connect_timeout เผื่อตอน Neon กำลังปลุก compute
#   2. ทุก connection ที่หยิบออกจาก pool ต้องผ่าน SELECT 1 ก่อนเสมอ ตายก็ทิ้ง
#      แล้วหยิบตัวใหม่ - ไม่มีเงื่อนไข "เพิ่งใช้ไปเลยข้าม" เพราะ Neon ตัดได้
#      ภายในไม่กี่วินาทีหลังใช้เสร็จ ช่องว่างแค่นั้นก็พอให้ 500 แล้ว
#      (ค่าใช้จ่ายคือ round trip เดียวต่อ request ซึ่งกับ localhost แทบไม่มีผล)
#   3. connection ที่พังแล้วต้อง "ปิดทิ้ง" ตอนคืน pool ไม่ใช่คืนเข้าไปรอพัง
#      ให้ request หน้า
# ─────────────────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

#: keepalive ถี่กว่า idle timeout ของ Neon/pgbouncer, connect_timeout เผื่อ
#: จังหวะที่ Neon กำลังปลุก compute ที่หลับอยู่ (กินเวลาได้หลายวินาที)
_KEEPALIVE = {
    "keepalives": 1,
    "keepalives_idle": 30,
    "keepalives_interval": 10,
    "keepalives_count": 3,
    "connect_timeout": 15,
}

#: หยิบ connection ที่ตายติด ๆ กันได้กี่ครั้งก่อนยอมแพ้
#:
#: เผื่อ Neon ที่เพิ่งตื่น: ตัวแรก ๆ ที่ค้างอยู่ใน pool ตายหมด ต้องหยิบทิ้งจน
#: pool ยอมเปิดตัวใหม่
_CHECKOUT_ATTEMPTS = 4


def _safe_rollback(conn) -> None:
    """rollback ที่ไม่มีวันโยน - ใช้ในทางออก error เท่านั้น

    connection ที่ปลายทางตัดไปแล้วจะโยน InterfaceError ตอน rollback ซึ่งจะไป
    ทับ exception ตัวจริงที่กำลังจะถูกโยนขึ้นไป ทำให้ traceback ชี้ผิดที่และ
    exception handler ข้างนอกไม่รู้จักชนิดของ error
    """
    try:
        conn.rollback()
    except psycopg2.Error:
        pass


class PostgresPool:

    def __init__(self, db_type: str = "nextlink"):
        self.db_type = db_type
        self._pool = None
        self._lock = threading.Lock()

    @property
    def pool(self):
        if self._pool is None:
            with self._lock:
                if self._pool is None:
                    self._pool = self._create_pool()
        return self._pool

    def _get_dsn(self) -> str:
        if self.db_type == "line":
            return config.LINE_DATABASE_URL
        elif self.db_type == "nextlink":
            return config.NEXTLINK_DATABASE_URL
        else:
            raise DatabaseError(message=f"ไม่พบประเภทฐานข้อมูล: {self.db_type}")

    def _create_pool(self):
        dsn = self._get_dsn()
        if not dsn:
            raise DatabaseError(
                message=f"ยังไม่ได้ตั้งค่า DATABASE URL สำหรับ {self.db_type} ใน {config.ENV_PATH}"
            )

        try:
            # kwargs ที่เกินจาก minconn/maxconn ถูกส่งต่อให้ psycopg2.connect()
            # ตรง ๆ - ดู _KEEPALIVE ข้างบน
            return psycopg2.pool.ThreadedConnectionPool(
                minconn=config.PG_POOL_MIN,
                maxconn=config.PG_POOL_MAX,
                dsn=dsn,
                **_KEEPALIVE,
            )
        except psycopg2.Error as e:
            raise DatabaseError(message=f"เชื่อมต่อฐานข้อมูล {self.db_type} ไม่ได้") from e

    def _ping(self, conn) -> None:
        """ยิงของจริงหนึ่งครั้งเพื่อดูว่า connection ยังคุยกับปลายทางได้ไหม

        `conn.closed` บอกได้แค่ว่าฝั่งเราปิดเองหรือยัง - ปลายทางตัดทิ้งเงียบ ๆ
        มันยังเป็น 0 อยู่ดี จึงต้องยิงจริงถึงจะรู้ โยน psycopg2.Error ถ้าตาย
        """
        if conn.closed:
            raise psycopg2.OperationalError("connection ถูกปิดไปแล้ว")

        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
        # SELECT 1 เปิดทรานแซกชันค้างไว้ ปิดให้เรียบร้อยก่อนส่งออก
        conn.rollback()

    def _checkout(self, pool):
        """หยิบ connection ที่ใช้ได้จริงจาก pool ตัวที่ตายแล้วปิดทิ้ง"""
        last_error: Exception | None = None

        for attempt in range(1, _CHECKOUT_ATTEMPTS + 1):
            try:
                conn = pool.getconn()
            except psycopg2.Error as e:
                # เปิด connection ใหม่ไม่ได้เลย = ปลายทางไม่รับจริง ๆ
                raise DatabaseError(
                    message=f"เชื่อมต่อฐานข้อมูล {self.db_type} ไม่ได้"
                ) from e

            try:
                self._ping(conn)
                return conn
            except psycopg2.Error as e:
                last_error = e
                # ระดับ warning ไม่ใช่ error: นี่คือการทำงานปกติของชั้นกันพลาด
                # request ยังไปต่อได้ แต่ต้องเห็นใน log เวลามันเกิดถี่ผิดปกติ
                logger.warning(
                    "[%s] connection ใน pool ใช้ไม่ได้ (ครั้งที่ %d/%d) ปิดทิ้งแล้วหยิบใหม่: %s",
                    self.db_type, attempt, _CHECKOUT_ATTEMPTS, e,
                )
                self._discard(pool, conn)

        raise DatabaseError(
            message=f"เชื่อมต่อฐานข้อมูล {self.db_type} ไม่ได้"
        ) from last_error

    def _discard(self, pool, conn) -> None:
        """คืนแบบปิดทิ้ง - pool จะไปเปิดตัวใหม่แทนเมื่อมีคนขอ"""
        try:
            pool.putconn(conn, close=True)
        except psycopg2.Error:
            pass

    def _checkin(self, pool, conn) -> None:
        """คืนเข้า pool ตามปกติ - ตัวที่พังระหว่างใช้งานให้ปิดทิ้งแทน

        putconn() ปกติจะ rollback ให้ ซึ่งกับ connection ที่ปลายทางตัดไปแล้วจะ
        โยน InterfaceError ออกมาทับ error ตัวจริงอีกที
        """
        if conn.closed:
            self._discard(pool, conn)
            return

        try:
            pool.putconn(conn)
        except psycopg2.Error:
            self._discard(pool, conn)

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
        conn = self._checkout(pool)
        try:
            yield conn

        except AppException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            # rollback ต้องห้ามโยนทับ: ถ้า connection ตายกลางคัน มันจะโยน
            # InterfaceError("connection already closed") ออกมาแทน error ตัวจริง
            # แล้ว handler ข้างนอกก็ไม่ได้ DatabaseError อย่างที่ควรจะเป็น
            # กลายเป็น 500 ดิบ ๆ แทนที่จะเป็นข้อความที่หน้าจออ่านออก
            _safe_rollback(conn)
            raise DatabaseError(message="เกิดข้อผิดพลาดไม่ทราบสาเหตุ") from e
        finally:
            self._checkin(pool, conn)

    def close_all(self):
        if self._pool is not None:
            self._pool.closeall()
            self._pool = None

line_db = PostgresPool("line")
nl_db = PostgresPool("nextlink")