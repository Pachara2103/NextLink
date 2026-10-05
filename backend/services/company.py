from typing import Any

from psycopg2.errors import ForeignKeyViolation, UniqueViolation

from core.db import graph_db, nl_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.company import Company, CompanyName
from schemas.mou import MouBase
from services import outbox
from utils.mapping import columns_of, placeholders_of, rows_to_models


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
    query = f"select {columns_of(Company)} from companies;"
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            items = rows_to_models(cursor, Company)
            return ListResponse(items=items, total=len(items))


def create_company_pg(payload: CompanyName, group_id: str, conn: Any = None):
    if  not group_id and not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการสร้าง")
    if not conn:
        raise BadRequestError()

    query = f"""
        INSERT INTO companies (group_id, company_th, company_en, aliases)
        VALUES (%(group_id)s, %(company_th)s, %(company_en)s, %(aliases)s)
        RETURNING id;
    """

    params = {
        "company_th": payload.company_th,
        "company_en": payload.company_en,
        "aliases": payload.aliases,
        "group_id": group_id
    }

    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
            if not row:
                raise BadRequestError(message="ไม่สามารถสร้างบริษัทได้")

            # คืน id เสมอ: update_information ใช้ id ที่ได้จากตรงนี้เป็น
            # employees.company_id ซึ่งเป็น NOT NULL ถ้าคืน None การ insert
            # employee ทุกแถวของกลุ่มนั้นจะล้มทั้งหมด
            return row[0]

    except ForeignKeyViolation as e:
        raise BadRequestError( message=f"ไม่พบกลุ่ม LINE ในระบบ") from e

    except UniqueViolation as e:
        raise BadRequestError(message="บริษัทนี้มีอยู่ในระบบแล้ว") from e

    except BadRequestError:
        raise


def _validate(payload: CompanyName):
    if not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการอัปเดต")


def update_company_pg(payload: CompanyName, id: str, conn: Any = None):
    if payload:
        _validate(payload)
        
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
    if not id:
        raise BadRequestError(message="ไม่เจอบริษัทที่ต้องการอัปเดต")

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


def sync_update_company(payload: CompanyName, id: int):
    with nl_db.get_connection() as conn:
        target = get_company(id, conn=conn)
        update_company_pg(payload, id=id, conn=conn)
        
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
    


def sync_create_company(payload: CompanyName, group_id: str, conn: Any = None):
    def _execute(connection):
        company_id = create_company_pg(payload, group_id=group_id, conn=connection)
        outbox.enqueue(
            connection, outbox.COMPANY, company_id, outbox.UPSERT, _payload(payload, group_id)
        )
        return company_id

    if conn:
        return _execute(conn)
    with nl_db.get_connection() as connection:
        company_id = _execute(connection)
        connection.commit()

    outbox.flush(outbox.COMPANY, company_id)
    return company_id


def unlink_company_pg(id: int, conn: Any = None):
    if not id or not conn:
        raise BadRequestError()

    query = "UPDATE companies SET group_id = null, updated_at = now() WHERE id = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบข้อมูลบริษัท id = {id}")

def unlink_company_graph(id: int) -> int:
    if not id:
        raise BadRequestError()

    query = """
    MATCH (c:Company {id: $id})
    SET c.groupId = null
    RETURN count(c) AS removed;
    """
    with graph_db.get_session() as session:
        record = session.run(query, {"id": id}).single()
        return record["removed"] if record else 0


def sync_unlink_company(id: int):
    if not id:
        raise BadRequestError()
    with nl_db.get_connection() as conn:
        get_company(id, conn=conn)
        unlink_company_pg(id=id, conn=conn)
        outbox.enqueue(conn, outbox.COMPANY, id, outbox.UNLINK)
        conn.commit()

    outbox.flush(outbox.COMPANY, id)



def link_company_pg(id: int, group_id: str, conn: Any = None):
    if not id or not group_id:
        raise BadRequestError("field id or group_id is empty")
    if not conn:
        raise BadRequestError("no connection provided on pg")

    query = (
        "UPDATE companies SET group_id = %(group_id)s, updated_at = now() "
        "WHERE id = %(id)s;"
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, {"group_id": group_id, "id": id})
            if cursor.rowcount == 0:
                raise NotFoundError(message=f"ไม่พบข้อมูลบริษัท id = {id}")
    except UniqueViolation as e:
        # companies.group_id เป็น UNIQUE: กลุ่มนี้มีบริษัทอื่นจองไว้แล้ว
        # console กรองกลุ่มที่ว่างมาให้อยู่แล้ว เคสนี้คือรายการบนจอเก่า
        raise BadRequestError(message="กลุ่ม LINE นี้ถูกผูกบริษัทไปแล้ว") from e
    except ForeignKeyViolation as e:
        raise BadRequestError(message="ไม่พบกลุ่ม LINE ในระบบ") from e

def link_company_graph(id: int, group_id: str) -> int:
    if not id or not group_id:
        raise BadRequestError("field id or group_id is empty")

    query = """
    MATCH (c:Company {id: $id})
    SET c.groupId = $group_id
    RETURN count(c) AS removed;
    """
    with graph_db.get_session() as session:
        record = session.run(query, {"group_id": group_id, "id": id}).single()
        return record["removed"] if record else 0

def sync_link_company(id: int, group_id: str):
    if not id or not group_id:
        raise BadRequestError("field id or group_id is empty")
    with nl_db.get_connection() as conn:
        get_company(id, conn=conn)
        link_company_pg(id=id, group_id=group_id, conn=conn)
        outbox.enqueue(conn, outbox.COMPANY, id, outbox.LINK, payload={"group_id": group_id})
        conn.commit()
    outbox.flush(outbox.COMPANY, id)


# --------------------------------------------------------------------------- #
# mous - เขียนเฉพาะ postgres ไม่มี node ในกราฟ จึงไม่ต้องผ่าน outbox
# --------------------------------------------------------------------------- #

def create_mou_pg(payload: MouBase, conn: Any = None) -> int:
    """เพิ่ม MoU ของบริษัทหนึ่งแถว - ไม่ commit เอง ให้ caller คุม transaction

    ใช้ใน services/import_data.py ที่ต้องเขียน companies + mous + employees
    ใน transaction เดียวกัน พังตัวไหนก็ rollback ทั้งแถว
    """
    if not conn:
        raise BadRequestError(message="no connection provided on pg")
    if not payload.company_id:
        raise BadRequestError(message="ไม่ระบุบริษัทของ MoU")

    query = f"""
        INSERT INTO mous ({columns_of(MouBase)})
        VALUES ({placeholders_of(MouBase)})
        RETURNING id;
    """
    try:
        with conn.cursor() as cursor:
            params = payload.model_dump(mode="python", by_alias=False)
            # StrEnum -> str ตรง ๆ ไม่ฝากชะตาไว้กับ adapter ของ psycopg2
            params["document_status"] = payload.document_status.value
            cursor.execute(query, params)
            row = cursor.fetchone()
            if not row:
                raise BadRequestError(message="ไม่สามารถสร้างข้อมูล MoU ได้")
            return row[0]
    except UniqueViolation as e:
        raise BadRequestError(message="บริษัทนี้มีข้อมูล MoU อยู่แล้ว") from e
    except ForeignKeyViolation as e:
        raise BadRequestError(message="ไม่พบบริษัทของ MoU ในระบบ") from e
