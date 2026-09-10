from typing import Any

from psycopg2.errors import ForeignKeyViolation, UniqueViolation

from core.db import graph_db, pg_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.company import Company, CompanyName
from services import outbox
from utils.mapping import columns_of, rows_to_models

# ทุก sync_* ที่นี่เดินตามแบบเดียวกับ services/employee.py:
# เขียน postgres + จองงานกราฟลง outbox ใน transaction เดียว commit แล้วค่อย
# ยิงกราฟ - ดูเหตุผลเต็มที่หัวไฟล์ services/outbox.py


def _payload(name: CompanyName, group_id: str | None) -> dict:
    """สิ่งที่ outbox เก็บไว้ทำ MERGE ทีหลัง"""
    return {
        "company_th": name.company_th,
        "company_en": name.company_en,
        "aliases": name.aliases,
        "group_id": group_id,
    }


def get_company(id: int, conn: Any = None) -> Company:
    if not conn:
        raise BadRequestError(message="no connection provided on pg")

    query = f"select {columns_of(Company)} from companies where id = %s;"
    with conn.cursor() as cursor:
          cursor.execute(query, (id,))
          items = rows_to_models(cursor, Company)
          if not items:
            raise NotFoundError(f"ไม่เจอข้อมูลบริษัทที่มี id = {id}")
    return  items[0]


def get_companies() -> ListResponse[Company]:
    query = f"select {columns_of(Company)} from companies where group_id is not null;"
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            items = rows_to_models(cursor, Company)
            return ListResponse(items=items, total=len(items))


def create_company_pg(payload: CompanyName, group_id: str, is_linked: bool = False, conn: Any = None):
    if not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการอัปเดต")

    if not conn:
         raise BadRequestError()

    query = f"""
        INSERT INTO companies (group_id, company_th, company_en, aliases, is_linked)
        VALUES (%(group_id)s, %(company_th)s, %(company_en)s, %(aliases)s, %(is_linked)s)
        RETURNING id;
    """

    params = {
        "company_th": payload.company_th,
        "company_en": payload.company_en,
        "aliases": payload.aliases,
        "group_id": group_id,
        "is_linked": is_linked
    }

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
            if not row:
                raise BadRequestError(message="ไม่สามารถสร้างบริษัทได้")

            # คืน id เสมอ ไม่ใช่แค่ตอน is_linked=True: update_information ใช้ id
            # ที่ได้จากตรงนี้เป็น employees.company_id ซึ่งเป็น NOT NULL
            # ถ้าคืน None ตอน is_linked=False การ insert employee ทุกแถวของกลุ่ม
            # นั้นจะล้มทั้งหมด
            return row[0]

    except ForeignKeyViolation as e:
        raise BadRequestError( message=f"ไม่พบกลุ่ม LINE ในระบบ") from e

    except UniqueViolation as e:
        raise BadRequestError(message="กลุ่ม LINE นี้ถูกผูกบริษัทไปแล้ว") from e

    except BadRequestError:
        raise



def update_company_pg(payload: CompanyName, id: str, conn: Any = None):
    if not id:
        raise BadRequestError(message="ไม่เจอบริษัทที่ต้องการอัปเดต")

    if not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการอัปเดต")

    if not conn:
         raise BadRequestError()

    query = f"""
        UPDATE companies
        SET company_en = COALESCE(%(company_en)s, company_en),
            company_th = COALESCE(%(company_th)s, company_th),
            aliases = COALESCE(%(aliases)s, aliases),
            is_linked = true,
            updated_at = now()
        WHERE id = %(id)s;
    """

    params = {
        "id": id,
        "company_th": payload.company_th,
        "company_en": payload.company_en,
        "aliases": payload.aliases,
    }

    with conn.cursor() as cursor:
        cursor.execute(query, params)
        if cursor.rowcount == 0:
            raise NotFoundError(message="ไม่พบกลุ่มไลน์ที่ต้องการอัปเดต")


def upsert_company_graph(payload: CompanyName, group_id: str | None, id: int):
    """MERGE node บริษัท - ทำซ้ำได้ และสร้างให้เองถ้ายังไม่มี

    เดิมชื่อ update_company_graph ซึ่งอ่านแล้วเหมือนแก้ของที่มีอยู่ ทั้งที่
    query เป็น MERGE มาตลอด ชื่อใหม่ตรงกับสิ่งที่ outbox ต้องการ: งาน upsert
    หนึ่งงานที่ replay กี่รอบก็ได้ผลเดิม
    """
    if not id:
        raise BadRequestError(message="ไม่เจอกลุ่มไลน์ที่ต้องการอัปเดต")

    if not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการอัปเดต")

    query = """
MERGE (c:Company {id: $id})
ON MATCH SET
    c.groupId = $group_id,
    c.companyTh = coalesce($company_th, c.companyTh),
    c.companyEn = coalesce($company_en, c.companyEn),
    c.aliases = coalesce($aliases, c.aliases),
    c.updatedAt = datetime()
ON CREATE SET
    c.id = $id,
    c.groupId = $group_id,
    c.companyTh = $company_th,
    c.companyEn = $company_en,
    c.aliases = $aliases,
    c.createdAt = datetime(),
    c.updatedAt = datetime()
RETURN c as company;
"""
    params = {
        "id": id,
        "group_id": group_id,
        "company_th": payload.company_th,
        "company_en": payload.company_en,
        "aliases": payload.aliases,
    }
    with graph_db.get_session() as session:
        result = session.run(query, params)
        if not result.single():
            raise NotFoundError(message="ไม่พบข้อมูลบริษัทที่ต้องการอัปเดต")


#: ชื่อเดิม เผื่อโค้ดที่ยังเรียกอยู่ - เป็นตัวเดียวกัน
update_company_graph = upsert_company_graph


def sync_update_company(payload: CompanyName, id: int):
    with pg_db.get_connection() as conn:
        target = get_company(id, conn=conn)
        update_company_pg(payload, id=id, conn=conn)
        # อ่านกลับหลัง UPDATE: คอลัมน์ใช้ COALESCE อยู่ ฟิลด์ที่ payload ไม่ได้ส่ง
        # มาจึงยังเป็นค่าเดิม - outbox ต้องเก็บค่าที่อยู่ในตารางจริง ไม่ใช่
        # payload ที่อาจเป็น null
        updated = get_company(id, conn=conn)
        outbox.enqueue(
            conn,
            outbox.COMPANY,
            id,
            outbox.UPSERT,
            _payload(updated, updated.group_id or target.group_id),
        )
        conn.commit()

    outbox.flush(outbox.COMPANY, id)


def sync_create_company(payload: CompanyName, group_id: str):
    with pg_db.get_connection() as conn:
        id = create_company_pg(payload, group_id=group_id, is_linked=True, conn=conn)
        outbox.enqueue(
            conn, outbox.COMPANY, id, outbox.UPSERT, _payload(payload, group_id)
        )
        conn.commit()

    outbox.flush(outbox.COMPANY, id)


def delete_company_pg(id: int, conn: Any = None):
    if not id or not conn:
        raise BadRequestError()

    query = f"delete from companies where id = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบข้อมูลบริษัท id = {id}")

def delete_company_graph(id: int) -> int:
    """ลบบริษัทพร้อมทุกอย่างที่ห้อยอยู่กับมัน - ไม่เจอก็ถือว่าสำเร็จ

    ฝั่ง postgres `employees.company_id` และ `notes.company_id` เป็น
    ON DELETE CASCADE การลบบริษัทจึงลบคนกับโน้ตของบริษัทนั้นไปด้วย กราฟต้อง
    ทำแบบเดียวกัน - รวมถึงโน้ตที่ห้อยอยู่กับ "คน" ของบริษัทนี้อีกชั้นหนึ่ง
    (ก่อนหน้านี้ตกหล่น กลายเป็น Note ลอยอยู่ในกราฟโดยไม่มีแถวใน pg แล้ว)
    """
    if not id:
        raise BadRequestError()

    query = """
    MATCH (c:Company {id: $id})
    OPTIONAL MATCH (c)-[:HAS_EMPLOYEE|HAS_NOTE]->(x)
    OPTIONAL MATCH (x)-[:HAS_NOTE]->(y)
    DETACH DELETE c, x, y
    RETURN count(c) AS removed;
    """
    with graph_db.get_session() as session:
        record = session.run(query, {"id": id}).single()
        return record["removed"] if record else 0


def sync_delete_company(id: int):
    if not id:
        raise BadRequestError()
    with pg_db.get_connection() as conn:
        get_company(id, conn=conn)
        delete_company_pg(id=id, conn=conn)
        outbox.enqueue(conn, outbox.COMPANY, id, outbox.DELETE)
        conn.commit()

    outbox.flush(outbox.COMPANY, id)
