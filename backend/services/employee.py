from typing import Any

from core.db import graph_db, pg_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.employee import Employee, EmployeeBase
from services import outbox
from utils.mapping import columns_of, placeholders_of, assignments_of, rows_to_models

# --------------------------------------------------------------------------- #
# ทุก sync_* ในไฟล์นี้เดินตามแบบเดียวกัน (ดูเหตุผลเต็ม ๆ ที่ services/outbox.py)
#
#   with pg_db.get_connection() as conn:
#       ...เขียน postgres...
#       outbox.enqueue(conn, ...)   <- transaction เดียวกับข้อมูลจริง
#       conn.commit()
#   outbox.flush(...)               <- ค่อยแตะกราฟ หลัง commit เท่านั้น
#
# ไม่มีการย้อนกราฟด้วยมืออีกแล้ว เพราะการย้อนด้วยมือทำงานได้เฉพาะตอน process
# ยังอยู่ - ซึ่งคือกรณีที่ไม่ค่อยพัง ส่วนกรณีที่พังจริง (uvicorn reload ฆ่า
# worker กลางคัน) มันช่วยอะไรไม่ได้เลย
# --------------------------------------------------------------------------- #


def _payload(employee: Employee) -> dict:
    """สิ่งที่ outbox เก็บไว้ใช้ทำ MERGE ทีหลัง - JSON ล้วน ไม่มี datetime object"""
    return employee.model_dump(mode="json", by_alias=False)


def get_employee(id: int, conn: Any = None) -> Employee:
    if not conn:
        raise BadRequestError(message="no connection provided on pg")

    query = f"select {columns_of(Employee)} from employees where id = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        rows = rows_to_models(cursor, Employee)
        if not rows:
          raise NotFoundError(f"ไม่พบข้อมูลคน id = {id}")
        return rows[0]


def get_employees() -> ListResponse[Employee]:
    query = f"select {columns_of(Employee)} from employees;"
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            rows = rows_to_models(cursor, Employee)
            return ListResponse(items=rows, total=len(rows))

def delete_employee_graph(id: int) -> int:
    """ลบ node ออกจากกราฟ - ไม่เจอก็ถือว่าสำเร็จ

    idempotent เพราะ outbox อาจ replay งานเดิมซ้ำ และเพราะ postgres คือความจริง:
    "ไม่มี node" คือผลลัพธ์ที่ต้องการอยู่แล้ว ไม่ใช่ข้อผิดพลาด
    """
    if not id:
        raise BadRequestError()
    query = """
    match (e:Employee)
    where e.id = $id
    detach delete e
    return count(e) as removed;
    """
    with graph_db.get_session() as session:
        record = session.run(query, {"id": id}).single()
        return record["removed"] if record else 0

def delete_employee_pg(id: int, conn: Any = None):
    """ลบแถวใน employees

    รับ conn ได้เหมือน create/update: sync_delete_employee ต้องลบแถวนี้ใน
    transaction เดียวกับที่มันจองงานลบฝั่งกราฟลง outbox
    """
    if not id:
        raise BadRequestError()

    query ="""
    Delete from employees
    where id = %(id)s
    """

    if not conn:
        with pg_db.get_connection() as own:
          with own.cursor() as cursor:
            cursor.execute( query, {"id": id})
            if cursor.rowcount == 0:
                raise NotFoundError(message="ไม่พบข้อมูลคนที่ต้องการลบ")
            own.commit()
            return

    with conn.cursor() as cursor:
        cursor.execute( query, {"id": id})
        if cursor.rowcount == 0:
            raise NotFoundError(message="ไม่พบข้อมูลคนที่ต้องการลบ")

def merge_employee_graph(payload: Employee):
    """upsert node + ความสัมพันธ์กับบริษัท - MERGE ล้วน จึงทำซ้ำได้"""
    query = f"""
    MATCH (c:Company {{id: $props.companyId}})
    MERGE (e:Employee {{id: $props.id}})
    ON CREATE SET e += $props
    ON MATCH SET e += $props
    MERGE (c)-[:HAS_EMPLOYEE]->(e)
    RETURN e AS employee
    """
    params = {
        "props":payload.model_dump(by_alias=True)
    }

    with graph_db.get_session() as session:
        result = session.run(query, params)
        record = result.single()
        if not record:
            raise BadRequestError(message="ไม่สามารถสร้างข้อมูลคนได้")

def sync_delete_employee(id: int):
    if not id:
        raise BadRequestError()

    with pg_db.get_connection() as conn:
        # อ่านก่อนลบ: ไม่มีแถวก็ 404 ตั้งแต่ตรงนี้ ไม่ต้องไปจองงานลบกราฟเปล่า ๆ
        get_employee(id, conn=conn)
        delete_employee_pg(id, conn=conn)
        outbox.enqueue(conn, outbox.EMPLOYEE, id, outbox.DELETE)
        conn.commit()

    outbox.flush(outbox.EMPLOYEE, id)

def approve_employee(id: int, user_id: int):
    if not id or not user_id:
        raise BadRequestError()
    query = f"""
    update employees
    set user_id = %(user_id)s, status = 'active', updated_at = now()
    where id = %(id)s
    returning {columns_of(Employee)};
    """
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, {"id": id, "user_id": user_id})
            rows = rows_to_models(cursor, Employee)
            if not rows:
               raise NotFoundError(message="ไม่พบข้อมูลคนที่ต้องการอัปเดต")

        outbox.enqueue(conn, outbox.EMPLOYEE, id, outbox.UPSERT, _payload(rows[0]))
        conn.commit()

    outbox.flush(outbox.EMPLOYEE, id)

def create_employee_pg(payload: EmployeeBase, user_id: int, conn: Any = None) -> Employee:
    if not user_id:
        raise BadRequestError()
    if not conn:
        raise BadRequestError()

    query = f"""
        INSERT INTO employees ({columns_of(EmployeeBase)}, user_id)
        VALUES ({placeholders_of(EmployeeBase)}, %(user_id)s)
        returning {columns_of(Employee)};
    """
    with conn.cursor() as cursor:
        cursor.execute(query,  {**payload.model_dump(by_alias=False),"user_id" : user_id})
        rows = rows_to_models(cursor, Employee)
        if not rows:
            raise BadRequestError(message="ไม่สามารถสร้างข้อมูลคนได้")
        return rows[0]


def sync_create_employee(payload: EmployeeBase, user_id: int):
    if not user_id:
        raise BadRequestError()

    with pg_db.get_connection() as conn:
        employee = create_employee_pg(payload, user_id=user_id, conn=conn)
        outbox.enqueue(
            conn, outbox.EMPLOYEE, employee.id, outbox.UPSERT, _payload(employee)
        )
        conn.commit()

    outbox.flush(outbox.EMPLOYEE, employee.id)


def update_employee_pg(payload: EmployeeBase, id: int, user_id: int, conn: Any = None):
    query = f"""
    UPDATE employees
    SET  {assignments_of(EmployeeBase)}, user_id = %(user_id)s, updated_at = now()
    WHERE id = %(id)s;
    """

    params = {
        **payload.model_dump(by_alias=False),
        "user_id": user_id,
        "id": id
    }

    if not conn:
        with pg_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute( query, params)
                if cursor.rowcount == 0:
                    raise NotFoundError(message=f"ไม่พบข้อมูลคน id = {id}")
                conn.commit()
                return

    with conn.cursor() as cursor:
        cursor.execute( query, params)
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบข้อมูลคน id = {id}")

def update_employee_graph(payload: EmployeeBase, id: int):
    """แก้เฉพาะ property ของ node ที่มีอยู่

    เหลือไว้ให้โค้ดเก่าที่ยังเรียกอยู่ ทางเดินปกติใช้ merge_employee_graph
    ผ่าน outbox แทน เพราะ MATCH ที่ไม่เจอ node จะพัง ส่วน MERGE สร้างให้
    """
    query = """
    MATCH (e:Employee {id: $props.id})
    SET e += $props, e.updatedAt = datetime()
    RETURN e AS employee
    """
    params = {
        "props":{
            **payload.model_dump(by_alias=True),
           "id": id
        }
    }

    with graph_db.get_session() as session:
        result = session.run(query, params )
        record = result.single()
        if not record:
            raise NotFoundError(message="ไม่พบข้อมูลคนที่ต้องการอัปเดต")

def sync_update_employee(payload: EmployeeBase, id: int, user_id: int):
    if not id or not user_id:
        raise BadRequestError()

    with pg_db.get_connection() as conn:
        get_employee(id, conn=conn)
        update_employee_pg(payload, id=id, user_id=user_id, conn=conn)
        # อ่านกลับหลังอัปเดต: outbox ต้องเก็บ "แถวหลังแก้" ทั้งแถว ไม่ใช่แค่
        # ฟิลด์ที่ส่งมา เพราะ replay ทีหลังคือการ MERGE node ทั้งก้อน
        updated = get_employee(id, conn=conn)
        outbox.enqueue(conn, outbox.EMPLOYEE, id, outbox.UPSERT, _payload(updated))
        conn.commit()

    outbox.flush(outbox.EMPLOYEE, id)
