"""เทียบ postgres กับ neo4j แล้วบอก (หรือซ่อม) ส่วนที่ไม่ตรงกัน

outbox กันไม่ให้ **ของใหม่** หลุดออกจากกันได้อีก ไฟล์นี้คือของคู่กัน: มันบอก
ว่าตอนนี้เหลือความเสียหายจากยุคก่อนหน้า (หรือจากการแก้ข้อมูลด้วยมือ) อยู่
เท่าไหร่ และซ่อมให้ได้

หลักการเดียวกับ outbox: **postgres คือความจริง**
- แถวมีใน pg แต่ไม่มี node ในกราฟ  -> upsert node ตามข้อมูลใน pg
- node มีในกราฟ แต่ไม่มีแถวใน pg   -> ลบ node ทิ้ง

การซ่อมไม่ได้ยิงกราฟตรง ๆ แต่ผ่าน outbox เหมือนทางเดินปกติ - ถ้ากราฟล่ม
กลางคัน งานซ่อมก็ยังค้างอยู่ในคิวและถูกทำต่อเอง
"""

import logging

from core.db import graph_db, pg_db
from services import outbox

logger = logging.getLogger(__name__)


def _pg_ids(table: str) -> set[int]:
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"SELECT id FROM {table};")
            ids = {row[0] for row in cursor.fetchall()}
        conn.commit()
    return ids


def _graph_ids(label: str) -> set[int]:
    query = f"MATCH (n:{label}) WHERE n.id IS NOT NULL RETURN n.id AS id;"
    with graph_db.get_session() as session:
        return {record["id"] for record in session.run(query)}


def _employee_payload(id: int) -> dict | None:
    from schemas.employee import Employee
    from utils.mapping import columns_of, rows_to_models

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT {columns_of(Employee)} FROM employees WHERE id = %s;", (id,)
            )
            rows = rows_to_models(cursor, Employee)
        conn.commit()
    return rows[0].model_dump(mode="json", by_alias=False) if rows else None


def _company_payload(id: int) -> dict | None:
    from schemas.company import Company
    from utils.mapping import columns_of, rows_to_models

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"SELECT {columns_of(Company)} FROM companies WHERE id = %s;", (id,)
            )
            rows = rows_to_models(cursor, Company)
        conn.commit()

    if not rows:
        return None

    company = rows[0]
    return {
        "company_th": company.company_th,
        "company_en": company.company_en,
        "aliases": company.aliases,
        "group_id": company.group_id,
    }


def _note_payload(id: int) -> dict | None:
    from schemas.note import NoteCreate
    from utils.mapping import rows_to_models

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT content, type, sentiment, source, year, semester,
                       company_id, employee_id
                FROM notes WHERE id = %s;
                """,
                (id,),
            )
            rows = rows_to_models(cursor, NoteCreate)
        conn.commit()
    return rows[0].model_dump(mode="json", by_alias=False) if rows else None


#: entity -> (ตาราง pg, label ในกราฟ, ฟังก์ชันอ่าน payload)
_ENTITIES = {
    outbox.COMPANY: ("companies", "Company", _company_payload),
    outbox.EMPLOYEE: ("employees", "Employee", _employee_payload),
    outbox.NOTE: ("notes", "Note", _note_payload),
}


def reconcile(apply: bool = False) -> dict:
    """รายงานความต่างของทุก entity - `apply=True` คือสั่งซ่อมด้วย

    ลำดับตอนซ่อมสำคัญ: Company ก่อน เพราะ Employee/Note ต้อง MATCH หา node
    ของบริษัทเจอถึงจะผูกความสัมพันธ์ได้ (dict ใน python 3.7+ เรียงตามที่ประกาศ
    อยู่แล้ว จึงไม่ต้องเรียงเพิ่ม)
    """
    report: dict = {"applied": apply, "entities": {}}

    for entity, (table, label, payload_of) in _ENTITIES.items():
        try:
            in_pg = _pg_ids(table)
            in_graph = _graph_ids(label)
        except Exception as error:  # noqa: BLE001
            logger.exception("reconcile %s อ่านข้อมูลไม่ได้", entity)
            report["entities"][entity] = {"error": str(error)}
            continue

        missing = sorted(in_pg - in_graph)   # มีใน pg ไม่มีในกราฟ
        orphaned = sorted(in_graph - in_pg)  # มีในกราฟ ไม่มีใน pg

        result = {
            "pg": len(in_pg),
            "graph": len(in_graph),
            "missingInGraph": missing,
            "orphanInGraph": orphaned,
            "queued": 0,
        }

        if apply:
            for id in missing:
                payload = payload_of(id)
                if payload is None:
                    # แถวหายไประหว่างที่เรากำลังเทียบ - รอบหน้าค่อยว่ากัน
                    continue
                outbox.enqueue_and_flush(entity, id, outbox.UPSERT, payload)
                result["queued"] += 1

            for id in orphaned:
                outbox.enqueue_and_flush(entity, id, outbox.DELETE, None)
                result["queued"] += 1

        report["entities"][entity] = result

    return report
