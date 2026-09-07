"""Company contacts — the people we know *at* a company.

Not to be confused with `coordinators`, which is what the extraction pass
produces from LINE chat and a reviewer approves. A contact is entered by hand,
belongs to a company rather than to a LINE group, and never touches the graph:
these rows exist so the console can show "who do we know here" next to a
company name, so PostgreSQL is the whole story.
"""

from typing import Any

from core.db import pg_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.contact import Contact, ContactCreate, ContactUpdate
from utils.mapping import columns_of, rows_to_models

SELECT_CONTACTS = f"SELECT {columns_of(Contact)} FROM contacts"

# Oldest first, so the badges on a group card keep a stable order as the list
# grows — a new contact joins the end of the row instead of shuffling the ones
# already there.
ORDER = " ORDER BY created_at ASC, id ASC"


def _clean(value: str | None) -> str | None:
    """Blank stays out of the table: "" and NULL both mean "not given", and
    keeping only one of the two spellings means the client never has to test
    for both."""
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _require_name(name: str | None) -> str:
    cleaned = _clean(name)
    if not cleaned:
        raise BadRequestError(message="กรุณากรอกชื่อผู้ติดต่อ")
    return cleaned


def get_contacts(company_id: int | None = None) -> ListResponse[Contact]:
    """Every contact, or only one company's.

    The console reads the whole table once per sync and buckets by companyId on
    the client — same shape as coordinators — so `company_id` is here for
    callers that want a single company, not because the console needs it.
    """
    query = SELECT_CONTACTS
    params: tuple = ()

    if company_id is not None:
        query += " WHERE company_id = %s"
        params = (company_id,)

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query + ORDER + ";", params)
            rows = rows_to_models(cursor, Contact)
            return ListResponse(items=rows, total=len(rows))


def get_contact(id: int) -> Contact:
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"{SELECT_CONTACTS} WHERE id = %s;", (id,))
            rows = rows_to_models(cursor, Contact)
            if not rows:
                raise NotFoundError(message=f"ไม่พบข้อมูลผู้ติดต่อ id = {id}")
            return rows[0]


def _company_exists(company_id: int, conn: Any) -> bool:
    with conn.cursor() as cursor:
        cursor.execute("SELECT 1 FROM companies WHERE id = %s;", (company_id,))
        return cursor.fetchone() is not None


def create_contact(payload: ContactCreate) -> Contact:
    if not payload.company_id:
        raise BadRequestError(message="ไม่ระบุบริษัทของผู้ติดต่อ")

    name = _require_name(payload.name)

    query = f"""
        INSERT INTO contacts (company_id, name, nickname, role, phone, email)
        VALUES (%(company_id)s, %(name)s, %(nickname)s, %(role)s, %(phone)s, %(email)s)
        RETURNING {columns_of(Contact)};
    """

    params = {
        "company_id": payload.company_id,
        "name": name,
        "nickname": _clean(payload.nickname),
        "role": payload.role.value,
        "phone": _clean(payload.phone),
        "email": _clean(payload.email),
    }

    with pg_db.get_connection() as conn:
        # contacts.company_id carries no foreign key, so a bad id would insert
        # a row nothing can ever reach. Checked here instead.
        if not _company_exists(payload.company_id, conn):
            raise NotFoundError(
                message=f"ไม่พบบริษัท id = {payload.company_id} กรุณาผูกบริษัทกับกลุ่มนี้ก่อน"
            )

        with conn.cursor() as cursor:
            cursor.execute(query, params)
            rows = rows_to_models(cursor, Contact)
            if not rows:
                raise BadRequestError(message="ไม่สามารถเพิ่มผู้ติดต่อได้")
            conn.commit()
            return rows[0]


def update_contact(id: int, payload: ContactUpdate) -> Contact:
    if not id:
        raise BadRequestError(message="ไม่พบผู้ติดต่อที่ต้องการแก้ไข")

    name = _require_name(payload.name)

    query = f"""
        UPDATE contacts
        SET name = %(name)s,
            nickname = %(nickname)s,
            role = %(role)s,
            status = %(status)s,
            phone = %(phone)s,
            email = %(email)s,
            updated_at = now()
        WHERE id = %(id)s
        RETURNING {columns_of(Contact)};
    """

    params = {
        "id": id,
        "name": name,
        "nickname": _clean(payload.nickname),
        "role": payload.role.value,
        "status": payload.status.value,
        "phone": _clean(payload.phone),
        "email": _clean(payload.email),
    }

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            rows = rows_to_models(cursor, Contact)
            if not rows:
                raise NotFoundError(message=f"ไม่พบข้อมูลผู้ติดต่อ id = {id}")
            conn.commit()
            return rows[0]


def delete_contact(id: int) -> None:
    if not id:
        raise BadRequestError(message="ไม่พบผู้ติดต่อที่ต้องการลบ")

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM contacts WHERE id = %s;", (id,))
            if cursor.rowcount == 0:
                raise NotFoundError(message=f"ไม่พบข้อมูลผู้ติดต่อ id = {id}")
        conn.commit()
