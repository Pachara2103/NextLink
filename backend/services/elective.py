"""หน้า "จัดตารางวิชาเลือก" ทั้งหน้า อยู่บน postgres แทน localStorage

ที่มา
-----
หน้านี้เก็บทุกอย่างไว้ใน localStorage ของเบราว์เซอร์ที่เปิดมันอยู่ ซึ่งแปลว่า
แผนของคนหนึ่งไม่มีทางถึงมืออีกคน ล้าง cache แล้วหาย และ "เทอมที่แล้วจัดยังไง"
ไม่มีใครตอบได้ ไฟล์นี้ย้ายข้อมูลชุดเดิมมาไว้ที่เดียวกับข้อมูลบริษัทและคน

สิ่งที่ตั้งใจ *ไม่* ทำ
--------------------
* ไม่ตรวจซ้ำสิ่งที่ตัวจัดตารางฝั่งหน้าเว็บถือว่าเป็น "คำเตือน" - คาบนอกช่วงที่
  บริษัทแจ้ง ห้องเล็กกว่าจำนวนที่รับ หรือคาบที่ห้องติดงานอื่น หน้าเว็บแสดงให้
  เห็นแต่ยอมให้คนกดยืนยันได้ เพราะคนจัดรู้เรื่องที่ระบบไม่รู้ (บริษัทโทรมาบอก
  ทีหลัง ห้องข้าง ๆ ยืมเก้าอี้ได้) ตรงนี้จึงบังคับเฉพาะข้อที่หน้าเว็บก็ไม่ยอม
  ให้ทำ: ห้องซ้ำคาบ วิชาซ้ำคาบ และจำนวนคาบเกินที่วิชาต้องการ
* ไม่มี optimistic lock - คนแก้ทีหลังชนะ (last write wins) ทีมงานหน้านี้มี
  ไม่กี่คนและนั่งคุยกันอยู่แล้ว การยิง 409 ใส่หน้าจอจึงแพงกว่าที่ได้คืนมา
* ไม่แยกสิทธิ์ - ใครล็อกอินได้ก็แก้แผนได้ เหมือนหน้าอื่นในระบบนี้

การผูกกับ employees
------------------
วิทยากรมาจากอีเมลที่บริษัทส่งมา ไม่ได้มาจากการเลือกในรายชื่อที่มีอยู่ ถ้าชื่อ
ที่กรอกยังไม่มีในบริษัทนั้น เราสร้างแถวใหม่ให้เลย (status ตาม default ของ
schema, relevant = elective, job_title = lecturer) แทนที่จะปฏิเสธทั้งวิชา -
ไม่อย่างนั้นคนจัดตารางต้องไปสร้างคนในอีกหน้าก่อนถึงจะเพิ่มวิชาได้ และแถวที่
สร้างจากตรงนี้ก็เข้าคิว graph_outbox เหมือนทุกแถวที่สร้างจากหน้าอื่น
"""

from datetime import time
from typing import Any, Iterable

import psycopg2

from core.db import nl_db
from core.exceptions import AppException, BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.elective import (
    Elective,
    ElectiveChecklist,
    ElectiveChecklistUpdate,
    ElectivePerson,
    ElectivePlan,
    ElectiveRoom,
    ElectiveRoomBlock,
    ElectiveRoomBase,
    ElectiveRoomWrite,
    ElectiveSession,
    ElectiveSessionWrite,
    ElectiveTerm,
    ElectiveTermCreate,
    ElectiveWrite,
)
from schemas.employee import Employee, EmployeeBase
from schemas.enums import (
    ContactStatus,
    DeliveryMode,
    ElectiveSlot,
    RelevantType,
    TermStatus,
)
from services import outbox
from services.employee import create_employee_pg
from utils.mapping import assignments_of, columns_of, placeholders_of, rows_to_models

# --------------------------------------------------------------------------- #
# คาบ
# --------------------------------------------------------------------------- #

# ขอบของคาบ ตรงกับ PERIODS ใน frontend/src/features/elective-plan/lib/slots.ts
# บ่ายจบและเย็นเริ่มที่ 16:00 พอดี ทุกการเทียบช่วงเวลาจึงเป็นครึ่งเปิด [start, end)
_PERIOD_BOUNDS: dict[str, tuple[time, time]] = {
    "AM": (time(9, 0), time(12, 0)),
    "PM": (time(13, 0), time(16, 0)),
    "EVE": (time(16, 0), time(19, 0)),
}

# ลำดับการอ่านตาราง: จันทร์เช้าก่อน ใช้เรียงทุกที่ที่คืน slot เป็นลิสต์
_SLOT_RANK: dict[str, int] = {slot.value: i for i, slot in enumerate(ElectiveSlot)}


def _bounds_of(slot: ElectiveSlot) -> tuple[time, time]:
    return _PERIOD_BOUNDS[slot.value.split("_", 1)[1]]


def _sorted_slots(slots: Iterable[str]) -> list[ElectiveSlot]:
    unique = {str(slot) for slot in slots}
    return [ElectiveSlot(s) for s in sorted(unique, key=lambda s: _SLOT_RANK[s])]


# --------------------------------------------------------------------------- #
# แปล error ของฐานข้อมูลเป็นประโยคที่หน้าจออ่านออก
# --------------------------------------------------------------------------- #

# ข้อความต้องตรงกับที่หน้าเว็บพูดอยู่แล้ว (lib/assignments.ts) ไม่อย่างนั้นการ
# กดสิ่งเดียวกันจะได้คำอธิบายคนละแบบขึ้นกับว่าใครจับได้ก่อน
_CONSTRAINT_MESSAGES: dict[str, str] = {
    "uq_elective_sessions_room_slot": "ห้องนี้มีคลาสอยู่แล้วในคาบนี้ กรุณาเลือกห้องอื่นหรือคาบอื่น",
    "uq_elective_sessions_course_slot": "วิชานี้มีคาบในช่วงปลายทางแล้ว กรุณาเลือกคาบอื่น",
    "uq_electives_code_section": "เทอมนี้มีรหัสวิชาและตอนเรียนนี้อยู่แล้ว",
    "uq_elective_terms_year_semester": "เคยเปิดเทอมนี้ไปแล้ว",
    "uq_elective_terms_single_current": "มีเทอมที่กำลังจัดอยู่แล้ว กรุณาปิดเทอมเดิมก่อน",
    "uq_elective_rooms_name": "มีห้องชื่อนี้ในอาคารนี้อยู่แล้ว",
    "fk_electives_lecturer": "ผู้สอนที่เลือกไม่ได้เป็นคนของบริษัทที่เปิดวิชานี้",
    "fk_electives_coordinator": "ผู้ประสานงานที่เลือกไม่ได้เป็นคนของบริษัทที่เปิดวิชานี้",
    "ck_elective_sessions_time": "เวลาเริ่มต้องอยู่ก่อนเวลาจบ",
    "electives_company_id_fkey": "ไม่พบบริษัทที่เปิดวิชานี้",
    "electives_term_id_fkey": "ไม่พบเทอมที่ระบุ",
    "elective_sessions_room_id_fkey": "ไม่พบห้องที่ระบุ",
}


def _translated(e: psycopg2.IntegrityError) -> AppException:
    """เปลี่ยน IntegrityError เป็น AppException ที่มีข้อความไทย

    ต้องทำในชั้นนี้ ไม่ใช่ปล่อยขึ้นไป: PostgresPool.get_connection กลืน
    exception ที่ไม่ใช่ AppException แล้วโยน DatabaseError("เกิดข้อผิดพลาดไม่
    ทราบสาเหตุ") แทน ซึ่งลบสาเหตุที่แท้จริงทิ้งไปทั้งอัน
    """
    name = getattr(e.diag, "constraint_name", None)
    message = _CONSTRAINT_MESSAGES.get(name or "")
    if message:
        return BadRequestError(message=message)
    return BadRequestError(message="ข้อมูลขัดกับข้อมูลที่มีอยู่ กรุณาตรวจสอบอีกครั้ง")


# --------------------------------------------------------------------------- #
# เทอม
# --------------------------------------------------------------------------- #

SELECT_TERMS = f"SELECT {columns_of(ElectiveTerm)} FROM elective_terms"


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


def list_terms() -> ListResponse[ElectiveTerm]:
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"{SELECT_TERMS} ORDER BY year DESC, semester DESC;")
            rows = rows_to_models(cursor, ElectiveTerm)
            return ListResponse(items=rows, total=len(rows))


def _term_row(conn: Any, id: int) -> ElectiveTerm:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_TERMS} WHERE id = %s;", (id,))
        rows = rows_to_models(cursor, ElectiveTerm)
        if not rows:
            raise NotFoundError(message=f"ไม่พบเทอม id = {id}")
        return rows[0]


def _current_term(conn: Any) -> ElectiveTerm:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_TERMS} WHERE status = 'current';")
        rows = rows_to_models(cursor, ElectiveTerm)
        if not rows:
            raise NotFoundError(message="ยังไม่มีเทอมที่กำลังจัด กรุณาเปิดเทอมใหม่ก่อน")
        return rows[0]


def get_current_term() -> ElectiveTerm:
    with nl_db.get_connection() as conn:
        return _current_term(conn)


def _resolve_term(conn: Any, term_id: int | None) -> ElectiveTerm:
    return _term_row(conn, term_id) if term_id else _current_term(conn)


def _assert_editable(term: ElectiveTerm) -> None:
    """เทอมที่ปิดไปแล้วคือบันทึกว่าเกิดอะไรขึ้น ไม่ใช่แผนที่ยังแก้ได้

    หน้าเว็บซ่อนปุ่มแก้ทั้งหมดเมื่อดูเทอมเก่าอยู่แล้ว ตรงนี้คือด่านสำหรับคำสั่ง
    ที่ไม่ได้ผ่านหน้าจอ (แท็บที่เปิดค้างไว้ตั้งแต่ก่อนปิดเทอม)
    """
    if term.status == TermStatus.ARCHIVED:
        raise BadRequestError(message="เทอมนี้ปิดไปแล้ว แก้ไขไม่ได้")


def create_term(payload: ElectiveTermCreate, archive_current: bool = True) -> ElectiveTerm:
    """เปิดเทอมใหม่ และปิดเทอมที่กำลังจัดอยู่ใน transaction เดียวกัน

    แยกเป็นสองคำสั่งไม่ได้: index uq_elective_terms_single_current ยอมให้มี
    แถว current ได้ทีละแถวเดียว ลำดับ "ปิดเก่า แล้วเปิดใหม่" ที่ commit คนละ
    รอบจึงมีช่วงที่ระบบไม่มีเทอมที่จัดอยู่เลย และถ้าคำสั่งที่สองพัง ก็ค้างอยู่
    อย่างนั้น
    """
    with nl_db.get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                if archive_current:
                    cursor.execute(
                        "UPDATE elective_terms SET status = 'archived', updated_at = now() "
                        "WHERE status = 'current';"
                    )

                cursor.execute(
                    f"""
                    INSERT INTO elective_terms ({columns_of(ElectiveTermCreate)})
                    VALUES ({placeholders_of(ElectiveTermCreate)})
                    RETURNING {columns_of(ElectiveTerm)};
                    """,
                    payload.model_dump(mode="json", by_alias=False),
                )
                rows = rows_to_models(cursor, ElectiveTerm)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return rows[0]


def archive_term(id: int) -> ElectiveTerm:
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE elective_terms
                SET status = 'archived', updated_at = now()
                WHERE id = %s
                RETURNING {columns_of(ElectiveTerm)};
                """,
                (id,),
            )
            rows = rows_to_models(cursor, ElectiveTerm)
            if not rows:
                raise NotFoundError(message=f"ไม่พบเทอม id = {id}")
        conn.commit()
        return rows[0]


# --------------------------------------------------------------------------- #
# ห้อง
# --------------------------------------------------------------------------- #

_ROOM_JOINED = {"blocked_slots"}
SELECT_ROOMS = (
    f"SELECT {columns_of(ElectiveRoom, exclude=_ROOM_JOINED)} FROM elective_rooms"
)


def _attach_blocks(conn: Any, rooms: list[ElectiveRoom]) -> list[ElectiveRoom]:
    """เติมคาบที่ห้องติดงานอื่น - หนึ่ง query ต่อทั้งหน้า ไม่ใช่หนึ่งต่อห้อง"""
    if not rooms:
        return rooms

    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT room_id, slot, reason FROM elective_room_blocks "
            "WHERE room_id = ANY(%s);",
            ([room.id for room in rooms],),
        )
        grouped: dict[int, list[ElectiveRoomBlock]] = {}
        for room_id, slot, reason in cursor.fetchall():
            grouped.setdefault(room_id, []).append(
                ElectiveRoomBlock(slot=ElectiveSlot(slot), reason=reason)
            )

    for room in rooms:
        room.blocked_slots = sorted(
            grouped.get(room.id, []), key=lambda block: _SLOT_RANK[block.slot.value]
        )
    return rooms


def list_rooms(include_inactive: bool = False) -> ListResponse[ElectiveRoom]:
    where = "" if include_inactive else " WHERE is_active"
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"{SELECT_ROOMS}{where} ORDER BY building ASC, name ASC;")
            rooms = rows_to_models(cursor, ElectiveRoom)
        return ListResponse(items=_attach_blocks(conn, rooms), total=len(rooms))


def _room_row(conn: Any, id: int) -> ElectiveRoom:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_ROOMS} WHERE id = %s;", (id,))
        rooms = rows_to_models(cursor, ElectiveRoom)
        if not rooms:
            raise NotFoundError(message=f"ไม่พบห้อง id = {id}")
    return _attach_blocks(conn, rooms)[0]


def _write_blocks(conn: Any, room_id: int, blocks: list[ElectiveRoomBlock]) -> None:
    """เขียนทับทั้งชุด - รายการคาบที่ติดงานอื่นเป็นของที่คนแก้ทั้งตารางทีเดียว"""
    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM elective_room_blocks WHERE room_id = %s;", (room_id,))
        for block in blocks:
            cursor.execute(
                "INSERT INTO elective_room_blocks (room_id, slot, reason) "
                "VALUES (%s, %s, %s);",
                (room_id, block.slot.value, block.reason.strip()),
            )


def create_room(payload: ElectiveRoomWrite) -> ElectiveRoom:
    query = f"""
        INSERT INTO elective_rooms ({columns_of(ElectiveRoomBase)})
        VALUES ({placeholders_of(ElectiveRoomBase)})
        RETURNING id;
    """
    with nl_db.get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(query, payload.model_dump(mode="json", by_alias=False))
                row = cursor.fetchone()
            _write_blocks(conn, row[0], payload.blocked_slots)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return _room_row(conn, row[0])


def update_room(id: int, payload: ElectiveRoomWrite) -> ElectiveRoom:
    query = f"""
        UPDATE elective_rooms
        SET {assignments_of(ElectiveRoomBase)}, updated_at = now()
        WHERE id = %(id)s;
    """
    with nl_db.get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    query, {**payload.model_dump(mode="json", by_alias=False), "id": id}
                )
                if cursor.rowcount == 0:
                    raise NotFoundError(message=f"ไม่พบห้อง id = {id}")
            _write_blocks(conn, id, payload.blocked_slots)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return _room_row(conn, id)


def delete_room(id: int) -> None:
    """ลบห้องที่ยังไม่มีคลาสอยู่

    elective_sessions.room_id เป็น ON DELETE SET NULL ซึ่งแปลว่าลบห้องที่ยังมี
    คลาสจะทำให้คาบพวกนั้นกลายเป็น "ยังไม่ได้ห้อง" เงียบ ๆ - ตารางยังอยู่ครบ
    แต่ผิด จึงปฏิเสธไปเลยพร้อมบอกจำนวน ให้คนไปย้ายคลาสออกก่อน
    """
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM elective_sessions WHERE room_id = %s;", (id,)
            )
            used = cursor.fetchone()[0]
            if used:
                raise BadRequestError(
                    message=f"ห้องนี้ยังมี {used} คาบที่จัดไว้อยู่ กรุณาย้ายคลาสออกก่อนลบห้อง"
                )

            cursor.execute("DELETE FROM elective_rooms WHERE id = %s;", (id,))
            if cursor.rowcount == 0:
                raise NotFoundError(message=f"ไม่พบห้อง id = {id}")
        conn.commit()


def set_room_blocks(id: int, blocks: list[ElectiveRoomBlock]) -> ElectiveRoom:
    with nl_db.get_connection() as conn:
        _room_row(conn, id)
        try:
            _write_blocks(conn, id, blocks)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e
        conn.commit()
        return _room_row(conn, id)


# --------------------------------------------------------------------------- #
# คนของบริษัท
# --------------------------------------------------------------------------- #

# ไม่ใช่รหัสภายใน: job_title เป็นข้อความอิสระที่คนอ่าน สองค่านี้คือสิ่งที่แถว
# ซึ่งเกิดจากหน้าจัดตารางจะมีติดตัวไป ให้แยกออกจากคนที่มาจากการคุยใน LINE ได้
_LECTURER_TITLE = "lecturer"
_COORDINATOR_TITLE = "coordinator"


def _find_employee(conn: Any, company_id: int, name: str) -> int | None:
    """หาคนในบริษัทนี้จากชื่อ - เทียบแบบไม่สนตัวพิมพ์และช่องว่างหัวท้าย

    ชื่อไม่ใช่คีย์ที่ไว้ใจได้ในกรณีทั่วไป แต่ในบริษัทเดียว ชื่อซ้ำกันพอดีเป๊ะ
    แปลว่าเป็นคนเดียวกันเกือบทุกครั้ง และทางเลือกอีกทางคือสร้างคนซ้ำทุกครั้งที่
    เพิ่มวิชา
    """
    key = name.strip().lower()
    if not key:
        return None

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id FROM employees
            WHERE company_id = %(company_id)s
              AND (
                lower(btrim(coalesce(name_th, ''))) = %(key)s
                OR lower(btrim(coalesce(name_en, ''))) = %(key)s
                OR lower(btrim(coalesce(nickname, ''))) = %(key)s
              )
            ORDER BY id ASC
            LIMIT 1;
            """,
            {"company_id": company_id, "key": key},
        )
        row = cursor.fetchone()
        return row[0] if row else None


def _create_employee(
    conn: Any, company_id: int, person: ElectivePerson, user_id: Any, job_title: str
) -> Employee:
    payload = EmployeeBase(
        company_id=company_id,
        # ตรงกับ DEFAULT ของคอลัมน์ status: คนที่เพิ่งโผล่มาจากอีเมลยังไม่ได้
        # ถูกใครยืนยัน หน้า "รออนุมัติ" จะเห็นแถวนี้เหมือนคนที่มาจาก LINE
        status=ContactStatus.PENDING,
        name_th=_clean(person.name),
        relevant=RelevantType.ELECTIVE,
        job_title=job_title,
        email=_clean(person.email),
        phone=_clean(person.phone),
    )
    return create_employee_pg(payload, user_id=user_id, conn=conn)


def _resolve_person(
    conn: Any,
    company_id: int,
    person: ElectivePerson | None,
    user_id: Any,
    job_title: str,
    missing_message: str,
    pending: list[Employee],
) -> int | None:
    """ชื่อที่หน้าเว็บพิมพ์มา -> id ของแถวใน employees (สร้างใหม่ถ้ายังไม่มี)

    `pending` รับแถวที่เพิ่งสร้างไว้ ให้ caller เอาไป enqueue เข้า graph_outbox
    ใน transaction เดียวกับวิชา แล้วค่อย flush หลัง commit
    """
    if person is None or (person.id is None and not _clean(person.name)):
        if missing_message:
            raise BadRequestError(message=missing_message)
        return None

    if person.id is not None:
        # FK คู่ (id, company_id) จะจับได้อยู่แล้วตอน INSERT แต่ข้อความจาก
        # constraint พูดถึง "วิชา" ส่วนตรงนี้พูดถึง "คน" ซึ่งตรงกับสิ่งที่คนกด
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM employees WHERE id = %s AND company_id = %s;",
                (person.id, company_id),
            )
            if cursor.fetchone() is None:
                raise NotFoundError(
                    message=f"ไม่พบคน id = {person.id} ในบริษัทที่เปิดวิชานี้"
                )
        return person.id

    name = _clean(person.name)
    found = _find_employee(conn, company_id, name)
    if found is not None:
        return found

    created = _create_employee(conn, company_id, person, user_id, job_title)
    pending.append(created)
    return created.id


def _enqueue_people(conn: Any, pending: list[Employee]) -> None:
    for employee in pending:
        outbox.enqueue(
            conn,
            outbox.EMPLOYEE,
            employee.id,
            outbox.UPSERT,
            employee.model_dump(mode="json", by_alias=False),
        )


def _flush_people(pending: list[Employee]) -> None:
    """ยิงกราฟหลัง commit เท่านั้น - งานที่ยิงไม่สำเร็จ replay_pending เก็บให้"""
    for employee in pending:
        outbox.flush(outbox.EMPLOYEE, employee.id)


# --------------------------------------------------------------------------- #
# วิชา
# --------------------------------------------------------------------------- #

# ช่องของ Elective ที่ไม่ได้อยู่ในตาราง electives - มาจาก join หรืออีกตาราง
_ELECTIVE_JOINED = {
    "company_th",
    "company_en",
    "lecturer_name",
    "coordinator_name",
    "availability",
}

SELECT_ELECTIVES = f"""
    SELECT {", ".join(f"e.{f}" for f in Elective.model_fields if f not in _ELECTIVE_JOINED)},
           c.company_th,
           c.company_en,
           coalesce(le.name_th, le.name_en, le.nickname) AS lecturer_name,
           coalesce(co.name_th, co.name_en, co.nickname) AS coordinator_name
    FROM electives e
    JOIN companies c ON c.id = e.company_id
    JOIN employees le ON le.id = e.lecturer_id
    LEFT JOIN employees co ON co.id = e.coordinator_id
"""

ELECTIVE_ORDER = " ORDER BY e.course_code ASC, e.section ASC, e.id ASC"

# คอลัมน์ที่ INSERT/UPDATE เขียน - id กับเวลาฐานข้อมูลเติมเอง
_ELECTIVE_COLUMNS = (
    "term_id", "company_id", "course_code", "section", "elective_name", "category",
    "delivery_mode", "capacity", "sessions_per_week", "weeks", "lecturer_id",
    "coordinator_id", "application_form_url", "course_syllabus_url", "notes",
)
_ELECTIVE_FIELDS = ", ".join(_ELECTIVE_COLUMNS)
_ELECTIVE_VALUES = ", ".join(f"%({f})s" for f in _ELECTIVE_COLUMNS)
_ELECTIVE_SET = ", ".join(f"{f} = %({f})s" for f in _ELECTIVE_COLUMNS)


def _attach_availability(conn: Any, electives: list[Elective]) -> list[Elective]:
    if not electives:
        return electives

    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT elective_id, slot FROM elective_availability WHERE elective_id = ANY(%s);",
            ([item.id for item in electives],),
        )
        grouped: dict[int, list[str]] = {}
        for elective_id, slot in cursor.fetchall():
            grouped.setdefault(elective_id, []).append(slot)

    for item in electives:
        item.availability = _sorted_slots(grouped.get(item.id, []))
    return electives


def _electives_of(conn: Any, term_id: int) -> list[Elective]:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_ELECTIVES} WHERE e.term_id = %s{ELECTIVE_ORDER};", (term_id,))
        electives = rows_to_models(cursor, Elective)
    return _attach_availability(conn, electives)


def _elective_row(conn: Any, id: int) -> Elective:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_ELECTIVES} WHERE e.id = %s;", (id,))
        electives = rows_to_models(cursor, Elective)
        if not electives:
            raise NotFoundError(message=f"ไม่พบวิชา id = {id}")
    return _attach_availability(conn, electives)[0]


def list_electives(term_id: int | None = None) -> ListResponse[Elective]:
    with nl_db.get_connection() as conn:
        term = _resolve_term(conn, term_id)
        items = _electives_of(conn, term.id)
        return ListResponse(items=items, total=len(items))


def get_elective(id: int) -> Elective:
    with nl_db.get_connection() as conn:
        return _elective_row(conn, id)


def _write_availability(conn: Any, elective_id: int, slots: Iterable[ElectiveSlot]) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            "DELETE FROM elective_availability WHERE elective_id = %s;", (elective_id,)
        )
        for slot in _sorted_slots(slots):
            cursor.execute(
                "INSERT INTO elective_availability (elective_id, slot) VALUES (%s, %s);",
                (elective_id, slot.value),
            )


def _elective_params(payload: ElectiveWrite, term_id: int, lecturer_id: int, coordinator_id: int | None) -> dict:
    return {
        **payload.model_dump(
            mode="json",
            by_alias=False,
            exclude={"term_id", "lecturer", "coordinator", "availability"},
        ),
        "term_id": term_id,
        "lecturer_id": lecturer_id,
        "coordinator_id": coordinator_id,
        "course_code": payload.course_code.strip(),
        "elective_name": payload.elective_name.strip(),
        "category": payload.category.strip(),
        "application_form_url": _clean(payload.application_form_url),
        "course_syllabus_url": _clean(payload.course_syllabus_url),
        "notes": _clean(payload.notes),
    }


def create_elective(payload: ElectiveWrite, user_id: Any) -> Elective:
    pending: list[Employee] = []

    with nl_db.get_connection() as conn:
        term = _resolve_term(conn, payload.term_id)
        _assert_editable(term)

        lecturer_id = _resolve_person(
            conn, payload.company_id, payload.lecturer, user_id, _LECTURER_TITLE,
            "กรุณาระบุผู้สอนของวิชานี้", pending,
        )
        coordinator_id = _resolve_person(
            conn, payload.company_id, payload.coordinator, user_id, _COORDINATOR_TITLE,
            "", pending,
        )

        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO electives ({_ELECTIVE_FIELDS})
                    VALUES ({_ELECTIVE_VALUES})
                    RETURNING id;
                    """,
                    _elective_params(payload, term.id, lecturer_id, coordinator_id),
                )
                new_id = cursor.fetchone()[0]

                # เช็กลิสต์เกิดพร้อมวิชาเสมอ หน้าเว็บจะได้ไม่ต้องมีสถานะ
                # "ยังไม่มีเช็กลิสต์" ที่ต่างจาก "ยังไม่ได้ทำสักข้อ"
                cursor.execute(
                    "INSERT INTO elective_checklists (elective_id) VALUES (%s) "
                    "ON CONFLICT (elective_id) DO NOTHING;",
                    (new_id,),
                )

            _write_availability(conn, new_id, payload.availability)
            _enqueue_people(conn, pending)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        created = _elective_row(conn, new_id)

    _flush_people(pending)
    return created


def update_elective(id: int, payload: ElectiveWrite, user_id: Any) -> Elective:
    """แทนที่ทั้งวิชา รวมถึงช่วงที่สะดวก

    PUT ไม่ใช่ PATCH โดยตั้งใจ: ฟอร์มแก้วิชาส่งทุกช่องกลับมาอยู่แล้ว ส่วนการ
    กดเปิด/ปิดทีละคาบในตารางช่วงที่สะดวกใช้ set_availability ซึ่งไม่แตะช่องอื่น
    """
    pending: list[Employee] = []

    with nl_db.get_connection() as conn:
        current = _elective_row(conn, id)
        term = _resolve_term(conn, payload.term_id or current.term_id)
        _assert_editable(term)

        lecturer_id = _resolve_person(
            conn, payload.company_id, payload.lecturer, user_id, _LECTURER_TITLE,
            "กรุณาระบุผู้สอนของวิชานี้", pending,
        )
        coordinator_id = _resolve_person(
            conn, payload.company_id, payload.coordinator, user_id, _COORDINATOR_TITLE,
            "", pending,
        )

        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE electives
                    SET {_ELECTIVE_SET}, updated_at = now()
                    WHERE id = %(id)s;
                    """,
                    {**_elective_params(payload, term.id, lecturer_id, coordinator_id), "id": id},
                )
                if cursor.rowcount == 0:
                    raise NotFoundError(message=f"ไม่พบวิชา id = {id}")

            _write_availability(conn, id, payload.availability)
            _enqueue_people(conn, pending)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        updated = _elective_row(conn, id)

    _flush_people(pending)
    return updated


def set_availability(id: int, slots: list[ElectiveSlot]) -> Elective:
    with nl_db.get_connection() as conn:
        elective = _elective_row(conn, id)
        _assert_editable(_term_row(conn, elective.term_id))
        try:
            _write_availability(conn, id, slots)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e
        conn.commit()
        return _elective_row(conn, id)


def delete_elective(id: int) -> None:
    """ลบวิชา - ช่วงที่สะดวก คาบที่จัดไว้ และเช็กลิสต์ตามไปด้วย (ON DELETE CASCADE)

    ต่างจากห้องตรงที่คาบของวิชาคือของของวิชาเอง ไม่ใช่ของที่ยืมมา ลบวิชาแล้ว
    เหลือคาบไว้จึงไม่มีความหมาย
    """
    with nl_db.get_connection() as conn:
        elective = _elective_row(conn, id)
        _assert_editable(_term_row(conn, elective.term_id))

        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM electives WHERE id = %s;", (id,))
            if cursor.rowcount == 0:
                raise NotFoundError(message=f"ไม่พบวิชา id = {id}")
        conn.commit()


# --------------------------------------------------------------------------- #
# ผลการจัด
# --------------------------------------------------------------------------- #

SELECT_SESSIONS = f"SELECT {columns_of(ElectiveSession)} FROM elective_sessions"


def _session_row(conn: Any, id: int) -> ElectiveSession:
    with conn.cursor() as cursor:
        cursor.execute(f"{SELECT_SESSIONS} WHERE id = %s;", (id,))
        rows = rows_to_models(cursor, ElectiveSession)
        if not rows:
            raise NotFoundError(message=f"ไม่พบคาบ id = {id}")
        return rows[0]


def _sessions_of(conn: Any, term_id: int) -> list[ElectiveSession]:
    with conn.cursor() as cursor:
        cursor.execute(
            f"{SELECT_SESSIONS} WHERE term_id = %s ORDER BY elective_id ASC, id ASC;",
            (term_id,),
        )
        return rows_to_models(cursor, ElectiveSession)


def _assert_room_matches_mode(elective: Elective, room_id: int | None) -> None:
    """กฎเดียวกับ assertPlacement ในหน้าเว็บ ไม่ใช่กฎใหม่

    ออนไลน์ไม่กินห้อง และ UNIQUE (term_id, room_id, slot) มองข้ามแถวที่ room_id
    เป็น NULL อยู่แล้ว วิชาออนไลน์ที่เผลอใส่ห้องมาจึงไปจองห้องจริงของคนอื่น
    """
    if elective.delivery_mode == DeliveryMode.ONLINE:
        if room_id is not None:
            raise BadRequestError(message="วิชาออนไลน์ไม่ใช้ห้องเรียน")
    elif room_id is None:
        raise BadRequestError(
            message="วิชาในห้องเรียนหรือไฮบริดต้องมีห้องเรียน กรุณาเลือกคอลัมน์ห้อง"
        )


def _assert_quota(conn: Any, elective: Elective) -> None:
    """จำนวนคาบที่วางแล้วต้องไม่เกินที่วิชาต้องการต่อสัปดาห์

    ฐานข้อมูลบังคับข้อนี้ไม่ได้ (มันนับแถว ไม่ได้เทียบกับคอลัมน์ในอีกตาราง)
    และเป็นข้อเดียวกับที่ assertPlacement ฝั่งหน้าเว็บปฏิเสธตั้งแต่ตอนลาก
    """
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM elective_sessions WHERE elective_id = %s;",
            (elective.id,),
        )
        if cursor.fetchone()[0] >= elective.sessions_per_week:
            raise BadRequestError(message="วิชานี้ถูกจัดครบจำนวนคาบแล้ว")


def place_session(payload: ElectiveSessionWrite) -> ElectiveSession:
    with nl_db.get_connection() as conn:
        elective = _elective_row(conn, payload.elective_id)
        _assert_editable(_term_row(conn, elective.term_id))
        _assert_room_matches_mode(elective, payload.room_id)
        _assert_quota(conn, elective)

        start, end = _bounds_of(payload.slot)
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO elective_sessions
                        (elective_id, term_id, slot, room_id, start_time, end_time,
                         is_locked, source)
                    VALUES (%(elective_id)s, %(term_id)s, %(slot)s, %(room_id)s,
                            %(start_time)s, %(end_time)s, %(is_locked)s, %(source)s)
                    RETURNING {columns_of(ElectiveSession)};
                    """,
                    {
                        "elective_id": elective.id,
                        "term_id": elective.term_id,
                        "slot": payload.slot.value,
                        "room_id": payload.room_id,
                        "start_time": payload.start_time if payload.start_time is not None else start,
                        "end_time": payload.end_time if payload.end_time is not None else end,
                        "is_locked": payload.is_locked,
                        "source": payload.source.value,
                    },
                )
                rows = rows_to_models(cursor, ElectiveSession)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return rows[0]


def update_session(id: int, payload: ElectiveSessionWrite) -> ElectiveSession:
    """ย้ายคาบ เปลี่ยนห้อง แก้เวลา หรือกดล็อก - ทั้งหมดคือการเขียนแถวนี้ทับ

    การย้ายไปคาบอื่นรีเซ็ตเวลาเป็นขอบคาบใหม่ ส่วนการเปลี่ยนแค่ห้องไม่แตะเวลา
    ที่คนตั้งเอง (ตรงกับ moveAssignment ฝั่งหน้าเว็บ)
    """
    with nl_db.get_connection() as conn:
        current = _session_row(conn, id)
        elective = _elective_row(conn, current.elective_id)
        _assert_editable(_term_row(conn, elective.term_id))

        moved = current.slot != payload.slot
        if current.is_locked and (moved or current.room_id != payload.room_id):
            raise BadRequestError(message="ปลดล็อกคาบนี้ก่อนย้าย")

        _assert_room_matches_mode(elective, payload.room_id)

        start, end = _bounds_of(payload.slot)
        if payload.start_time is not None and payload.end_time is not None:
            start, end = payload.start_time, payload.end_time
        elif not moved:
            start, end = current.start_time, current.end_time

        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE elective_sessions
                    SET slot = %(slot)s,
                        room_id = %(room_id)s,
                        start_time = %(start_time)s,
                        end_time = %(end_time)s,
                        is_locked = %(is_locked)s,
                        source = %(source)s,
                        updated_at = now()
                    WHERE id = %(id)s
                    RETURNING {columns_of(ElectiveSession)};
                    """,
                    {
                        "id": id,
                        "slot": payload.slot.value,
                        "room_id": payload.room_id,
                        "start_time": start,
                        "end_time": end,
                        "is_locked": payload.is_locked,
                        "source": payload.source.value,
                    },
                )
                rows = rows_to_models(cursor, ElectiveSession)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return rows[0]


def delete_session(id: int) -> None:
    with nl_db.get_connection() as conn:
        current = _session_row(conn, id)
        _assert_editable(_term_row(conn, current.term_id))
        if current.is_locked:
            raise BadRequestError(message="ปลดล็อกคาบนี้ก่อนเอาออกจากตาราง")

        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM elective_sessions WHERE id = %s;", (id,))
            if cursor.rowcount == 0:
                raise NotFoundError(message=f"ไม่พบคาบ id = {id}")
        conn.commit()


def replace_sessions(
    term_id: int | None, sessions: list[ElectiveSessionWrite]
) -> ListResponse[ElectiveSession]:
    """ผลของปุ่ม "จัดตารางใหม่" - ทิ้งคาบที่ยังไม่ถูกล็อก แล้ววางชุดใหม่แทน

    ล็อกแถวของเทอมไว้ตลอด transaction (SELECT ... FOR UPDATE) เพราะคำสั่งนี้
    ลบแล้วเขียนทั้งตารางของเทอม สองคนที่กดพร้อมกันโดยไม่มีล็อกจะได้ตารางที่
    เป็นครึ่งหนึ่งของคนหนึ่งบวกครึ่งหนึ่งของอีกคน ซึ่งไม่ใช่ผลลัพธ์ที่ตัวจัด
    ตารางตัวไหนคำนวณไว้

    คาบที่ล็อกไว้ไม่ถูกแตะ และถ้าชุดใหม่วางทับคาบที่ล็อกอยู่ UNIQUE จะปฏิเสธ
    ทั้ง transaction - ตารางเดิมจึงไม่หายไปครึ่งหนึ่ง
    """
    with nl_db.get_connection() as conn:
        term = _resolve_term(conn, term_id)
        _assert_editable(term)

        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM elective_terms WHERE id = %s FOR UPDATE;", (term.id,))

        electives = {item.id: item for item in _electives_of(conn, term.id)}

        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM elective_sessions WHERE term_id = %s AND NOT is_locked;",
                    (term.id,),
                )

                # เริ่มนับจากคาบที่ล็อกไว้ซึ่งยังอยู่ ไม่ใช่จากศูนย์ - ชุดใหม่
                # ที่วางเพิ่มให้วิชาซึ่งมีคาบล็อกอยู่แล้วต้องนับรวมกัน
                cursor.execute(
                    "SELECT elective_id, count(*) FROM elective_sessions "
                    "WHERE term_id = %s GROUP BY elective_id;",
                    (term.id,),
                )
                placed: dict[int, int] = dict(cursor.fetchall())

                for payload in sessions:
                    elective = electives.get(payload.elective_id)
                    if elective is None:
                        raise NotFoundError(
                            message=f"ไม่พบวิชา id = {payload.elective_id} ในเทอมนี้"
                        )
                    _assert_room_matches_mode(elective, payload.room_id)

                    placed[elective.id] = placed.get(elective.id, 0) + 1
                    if placed[elective.id] > elective.sessions_per_week:
                        raise BadRequestError(
                            message=(
                                f"วิชา {elective.course_code} ตอน {elective.section} "
                                f"ต้องการสัปดาห์ละ {elective.sessions_per_week} คาบ "
                                "แต่ตารางที่ส่งมาให้มากกว่านั้น"
                            )
                        )

                    start, end = _bounds_of(payload.slot)
                    cursor.execute(
                        """
                        INSERT INTO elective_sessions
                            (elective_id, term_id, slot, room_id, start_time, end_time,
                             is_locked, source)
                        VALUES (%(elective_id)s, %(term_id)s, %(slot)s, %(room_id)s,
                                %(start_time)s, %(end_time)s, %(is_locked)s, %(source)s);
                        """,
                        {
                            "elective_id": elective.id,
                            "term_id": term.id,
                            "slot": payload.slot.value,
                            "room_id": payload.room_id,
                            "start_time": payload.start_time if payload.start_time is not None else start,
                            "end_time": payload.end_time if payload.end_time is not None else end,
                            "is_locked": payload.is_locked,
                            "source": payload.source.value,
                        },
                    )
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        rows = _sessions_of(conn, term.id)
        return ListResponse(items=rows, total=len(rows))


# --------------------------------------------------------------------------- #
# เช็กลิสต์งานเอกสาร
# --------------------------------------------------------------------------- #

SELECT_CHECKLISTS = f"SELECT {columns_of(ElectiveChecklist)} FROM elective_checklists"


def _checklists_of(conn: Any, term_id: int) -> list[ElectiveChecklist]:
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT {", ".join(f"k.{f}" for f in ElectiveChecklist.model_fields)}
            FROM elective_checklists k
            JOIN electives e ON e.id = k.elective_id
            WHERE e.term_id = %s
            ORDER BY k.elective_id ASC;
            """,
            (term_id,),
        )
        return rows_to_models(cursor, ElectiveChecklist)


def get_checklist(elective_id: int) -> ElectiveChecklist:
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"{SELECT_CHECKLISTS} WHERE elective_id = %s;", (elective_id,)
            )
            rows = rows_to_models(cursor, ElectiveChecklist)
            if not rows:
                raise NotFoundError(message=f"ไม่พบเช็กลิสต์ของวิชา id = {elective_id}")
            return rows[0]


def update_checklist(elective_id: int, payload: ElectiveChecklistUpdate) -> ElectiveChecklist:
    """เขียนเฉพาะช่องที่ส่งมา - ช่องที่ไม่ได้ส่งคือช่องที่คนอื่นอาจกำลังแก้อยู่"""
    changes = payload.model_dump(mode="json", by_alias=False, exclude_none=True)
    if not changes:
        return get_checklist(elective_id)

    sets = ", ".join(f"{field} = %({field})s" for field in changes)

    with nl_db.get_connection() as conn:
        elective = _elective_row(conn, elective_id)
        _assert_editable(_term_row(conn, elective.term_id))

        try:
            with conn.cursor() as cursor:
                # วิชาที่สร้างก่อนไฟล์นี้ (หรือจากสคริปต์ import) อาจยังไม่มีแถว
                # เช็กลิสต์ สร้างให้ก่อนแล้วค่อยแก้ ดีกว่าโยน 404 ใส่คนที่กดถูก
                cursor.execute(
                    "INSERT INTO elective_checklists (elective_id) VALUES (%s) "
                    "ON CONFLICT (elective_id) DO NOTHING;",
                    (elective_id,),
                )
                cursor.execute(
                    f"""
                    UPDATE elective_checklists
                    SET {sets}, updated_at = now()
                    WHERE elective_id = %(elective_id)s
                    RETURNING {columns_of(ElectiveChecklist)};
                    """,
                    {**changes, "elective_id": elective_id},
                )
                rows = rows_to_models(cursor, ElectiveChecklist)
        except psycopg2.IntegrityError as e:
            raise _translated(e) from e

        conn.commit()
        return rows[0]


# --------------------------------------------------------------------------- #
# ทั้งหน้าในการอ่านครั้งเดียว
# --------------------------------------------------------------------------- #


def get_plan(term_id: int | None = None) -> ElectivePlan:
    """ทุกอย่างที่หน้าจัดตารางต้องใช้ ในหนึ่ง connection หนึ่งภาพ

    อ่านทีละ endpoint แปลว่าห้องที่เพิ่งถูกลบอาจมาถึงหลังตารางที่ยังอ้างมันอยู่
    และหน้าจอจะวาดคาบที่ชี้ไปห้องที่ไม่มีแล้ว
    """
    with nl_db.get_connection() as conn:
        term = _resolve_term(conn, term_id)

        with conn.cursor() as cursor:
            # ห้องที่ถูกปิดไปแล้วแต่ยังมีคลาสของเทอมนี้อยู่ ต้องติดมาด้วย -
            # ไม่อย่างนั้นตารางจะมีคาบที่ชี้ไปคอลัมน์ที่ไม่มีอยู่บนหน้าจอ
            cursor.execute(
                f"""
                {SELECT_ROOMS}
                WHERE is_active
                   OR id IN (SELECT room_id FROM elective_sessions
                             WHERE term_id = %s AND room_id IS NOT NULL)
                ORDER BY building ASC, name ASC;
                """,
                (term.id,),
            )
            rooms = rows_to_models(cursor, ElectiveRoom)

        return ElectivePlan(
            term=term,
            rooms=_attach_blocks(conn, rooms),
            electives=_electives_of(conn, term.id),
            sessions=_sessions_of(conn, term.id),
            checklists=_checklists_of(conn, term.id),
        )
