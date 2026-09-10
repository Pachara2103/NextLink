"""Graph writes that survive the process dying.

ทำไมต้องมีไฟล์นี้
-----------------
เมื่อก่อนทุก `sync_*` เขียนสองฐานแบบนี้:

    เริ่ม transaction ของ pg -> เขียน pg (ยังไม่ commit)
    -> เขียน neo4j -> commit pg
    ถ้าพัง -> rollback pg + ย้อน neo4j ด้วยมือ

การย้อนด้วยมือทำงานได้ก็ต่อเมื่อ process ยังอยู่ พอ uvicorn --reload ฆ่า
worker กลางคัน (หรือเครื่องดับ) ลำดับนั้นถูกตัดตรงไหนก็ได้ ผลคือ pg กับ
neo4j ไม่ตรงกันแบบถาวรและไม่มีใครรู้

ไฟล์นี้เปลี่ยนสัญญาใหม่: **postgres คือแหล่งความจริง กราฟเป็นของที่ได้มา
จากมัน** ทุก sync_* จึงทำแบบนี้แทน

    เริ่ม transaction ของ pg -> เขียน pg -> INSERT graph_outbox (transaction
    เดียวกัน) -> commit  ->  ค่อยยิง neo4j

ถ้า process ตายก่อน commit: ไม่มีอะไรเกิดขึ้นเลยทั้งสองฝั่ง
ถ้า process ตายหลัง commit แต่ก่อนยิงกราฟ: แถว outbox ยังอยู่ใน pg
`replay_pending()` (ตอน start, ตามรอบเวลา, หรือกดจาก /admin) จะทำซ้ำให้เอง

ทุก op ต้อง **idempotent** เพราะ replay อาจทำซ้ำของที่สำเร็จไปแล้ว:
upsert ใช้ MERGE, delete ที่ไม่เจอ node ถือว่าสำเร็จ (pg ลบไปแล้ว = กราฟไม่ควรมี)
"""

import logging
from typing import Any, Callable

from psycopg2.extras import Json

from core.db import pg_db

logger = logging.getLogger(__name__)

# entity
EMPLOYEE = "employee"
COMPANY = "company"
NOTE = "note"

# op
UPSERT = "upsert"
DELETE = "delete"

_COLUMNS = "id, entity, entity_id, op, payload, tries"

#: กันไม่ให้ replay รอบเดียวกินเวลานานเกินไปเมื่อมีงานค้างเยอะ
DEFAULT_BATCH = 200


def _row_to_job(row) -> dict:
    return {
        "id": row[0],
        "entity": row[1],
        "entity_id": row[2],
        "op": row[3],
        "payload": row[4],
        "tries": row[5],
    }


def _appliers() -> dict[tuple[str, str], Callable[[dict | None, int], None]]:
    """ตัวจริงที่เขียนกราฟ แยกออกมาเป็นฟังก์ชันเพื่อ import แบบ lazy

    services/employee.py ต้อง import ไฟล์นี้ (เรียก enqueue) ถ้าไฟล์นี้
    import กลับที่ระดับ module จะเป็น circular import ทันที
    """
    from schemas.company import CompanyName
    from schemas.employee import Employee
    from schemas.note import NoteCreate
    from services.company import delete_company_graph, upsert_company_graph
    from services.employee import delete_employee_graph, merge_employee_graph
    from services.note import delete_note_graph, merge_note_graph

    def employee_upsert(payload: dict | None, entity_id: int) -> None:
        if not payload:
            raise ValueError(f"employee upsert {entity_id} ไม่มี payload")
        merge_employee_graph(Employee(**payload))

    def company_upsert(payload: dict | None, entity_id: int) -> None:
        if not payload:
            raise ValueError(f"company upsert {entity_id} ไม่มี payload")
        upsert_company_graph(
            CompanyName(
                company_th=payload.get("company_th"),
                company_en=payload.get("company_en"),
                aliases=payload.get("aliases"),
            ),
            group_id=payload.get("group_id"),
            id=entity_id,
        )

    def note_upsert(payload: dict | None, entity_id: int) -> None:
        if not payload:
            raise ValueError(f"note upsert {entity_id} ไม่มี payload")
        merge_note_graph(NoteCreate(**payload), id=entity_id)

    return {
        (EMPLOYEE, UPSERT): employee_upsert,
        (EMPLOYEE, DELETE): lambda _payload, entity_id: delete_employee_graph(entity_id),
        (COMPANY, UPSERT): company_upsert,
        (COMPANY, DELETE): lambda _payload, entity_id: delete_company_graph(entity_id),
        (NOTE, UPSERT): note_upsert,
        (NOTE, DELETE): lambda _payload, entity_id: delete_note_graph(entity_id),
    }


# --------------------------------------------------------------------------- #
# เขียนคิว - เรียกจาก service ภายใน transaction เดียวกับที่เขียน pg
# --------------------------------------------------------------------------- #

def enqueue(
    conn: Any,
    entity: str,
    entity_id: int,
    op: str,
    payload: dict | None = None,
) -> dict:
    """จองงานเขียนกราฟไว้ใน transaction ของ caller

    **ต้อง** ใช้ conn ตัวเดียวกับที่เขียนตาราง เพราะสิ่งที่รับประกันคือ
    "แถวจริงกับงานเขียนกราฟ commit พร้อมกันหรือไม่เกิดเลย"
    """
    if not conn:
        raise ValueError("enqueue ต้องได้ connection ของ caller")

    query = """
        INSERT INTO graph_outbox (entity, entity_id, op, payload)
        VALUES (%(entity)s, %(entity_id)s, %(op)s, %(payload)s)
        RETURNING id;
    """
    with conn.cursor() as cursor:
        cursor.execute(
            query,
            {
                "entity": entity,
                "entity_id": entity_id,
                "op": op,
                "payload": Json(payload) if payload is not None else None,
            },
        )
        row = cursor.fetchone()

    return {
        "id": row[0] if row else None,
        "entity": entity,
        "entity_id": entity_id,
        "op": op,
        "payload": payload,
        "tries": 0,
    }


def _apply(job: dict) -> None:
    applier = _appliers().get((job["entity"], job["op"]))
    if applier is None:
        raise ValueError(f"ไม่รู้จักงาน {job['entity']}/{job['op']}")
    applier(job["payload"], job["entity_id"])


def _mark_done(conn: Any, job_id: int) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE graph_outbox
            SET status = 'done', updated_at = now(), last_error = NULL
            WHERE id = %s;
            """,
            (job_id,),
        )


def _mark_failed(conn: Any, job_id: int, tries: int, error: Exception) -> None:
    """ยังคง status = 'pending' เสมอ - งานที่ยังไม่สำเร็จต้องถูกลองใหม่

    ถอยเวลาแบบเชิงเส้น (5 วิ * จำนวนครั้ง สูงสุด 60 วิ) จะได้ไม่ยิงรัว ๆ
    ใส่ neo4j ที่ล่มอยู่ และ last_error เก็บไว้ให้คนดูว่าค้างเพราะอะไร
    """
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE graph_outbox
            SET tries = tries + 1,
                last_error = %(error)s,
                updated_at = now(),
                next_try_at = now() + (interval '5 seconds' * LEAST(%(tries)s + 1, 12))
            WHERE id = %(id)s;
            """,
            {"id": job_id, "tries": tries, "error": str(error)[:500]},
        )


def _run(where: str, params: dict, limit: int) -> dict:
    """เลือกงานที่ค้าง ล็อกไว้ ทำ แล้วปิดยอด - หนึ่ง transaction ต่อหนึ่งงาน

    FOR UPDATE SKIP LOCKED: worker หลายตัว (หรือ replay ที่ชนกับ flush)
    จะไม่หยิบงานเดียวกันไปทำพร้อมกัน และงานของ entity เดียวกันยังเรียงตาม id
    เสมอ - ลำดับสำคัญ เพราะ upsert แล้ว delete กับ delete แล้ว upsert
    ให้ผลคนละอย่าง
    """
    applied = 0
    failed = 0

    for _ in range(limit):
        with pg_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT {_COLUMNS} FROM graph_outbox
                    WHERE status = 'pending' AND {where}
                    ORDER BY id
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED;
                    """,
                    params,
                )
                row = cursor.fetchone()

            if row is None:
                conn.commit()
                break
            # rr
            job = _row_to_job(row)
            try:
                _apply(job)
                _mark_done(conn, job["id"])
                applied += 1
            except Exception as error:  # noqa: BLE001 - งานค้างต้องไม่ทำให้ทั้งรอบล้ม
                logger.warning(
                    "outbox job %s (%s/%s id=%s) ยังไม่สำเร็จ: %s",
                    job["id"], job["entity"], job["op"], job["entity_id"], error,
                )
                _mark_failed(conn, job["id"], job["tries"], error)
                failed += 1

            conn.commit()

    return {"applied": applied, "failed": failed}


def flush(entity: str, entity_id: int) -> bool:
    """ยิงงานที่ค้างของ entity นี้ทันทีหลัง commit

    เรียกหลัง `conn.commit()` เท่านั้น ถ้าเรียกก่อน กราฟจะเห็นข้อมูลที่ pg
    ยังไม่ยอมรับ คืน True เมื่อไม่มีอะไรค้างแล้ว - False แปลว่าเขียนกราฟไม่ผ่าน
    ตอนนี้ ซึ่งไม่ใช่ข้อผิดพลาดของ request: แถว outbox ยังอยู่และ replay
    จะตามเก็บให้
    """
    result = _run(
        "entity = %(entity)s AND entity_id = %(entity_id)s",
        {"entity": entity, "entity_id": entity_id},
        limit=20,
    )
    return result["failed"] == 0


def replay_pending(limit: int = DEFAULT_BATCH) -> dict:
    """ทำงานที่ค้างทั้งระบบ - ตอน start, ตามรอบเวลา และปุ่มใน /admin"""
    return _run("next_try_at <= now()", {}, limit=limit)


def pending_summary() -> dict:
    """จำนวนงานค้าง + ตัวอย่างงานที่ค้างนานที่สุด สำหรับหน้า admin"""
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM graph_outbox WHERE status = 'pending';"
            )
            row = cursor.fetchone()
            pending = row[0] if row else 0

            cursor.execute(
                """
                SELECT id, entity, entity_id, op, tries, last_error, created_at
                FROM graph_outbox
                WHERE status = 'pending'
                ORDER BY id
                LIMIT 20;
                """
            )
            items = [
                {
                    "id": r[0],
                    "entity": r[1],
                    "entityId": r[2],
                    "op": r[3],
                    "tries": r[4],
                    "lastError": r[5],
                    "createdAt": r[6].isoformat() if r[6] else None,
                }
                for r in cursor.fetchall()
            ]
        conn.commit()

    return {"pending": pending, "items": items}


def enqueue_and_flush(
    entity: str,
    entity_id: int,
    op: str,
    payload: dict | None = None,
) -> bool:
    """ใส่คิวใน transaction ของตัวเองแล้วยิงเลย

    ใช้กับงานที่ไม่มีการเขียน pg คู่กัน เช่น reconcile ที่ซ่อมกราฟให้ตรงกับ
    pg ที่มีอยู่แล้ว
    """
    with pg_db.get_connection() as conn:
        enqueue(conn, entity, entity_id, op, payload)
        conn.commit()
    return flush(entity, entity_id)
