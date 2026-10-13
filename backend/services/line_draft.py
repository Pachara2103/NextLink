"""ร่างผลสรุปจากกลุ่มไลน์ที่ยังไม่ได้ผูกบริษัท (line_summary_drafts)

ทำไมต้องมีร่าง: employees.company_id เป็น NOT NULL และย้ายบริษัทไม่ได้ ถ้า
update_information สร้างบริษัทใหม่ให้กลุ่มที่ยังไม่ผูกทันที (ทั้งที่จริง ๆ บริษัท
นั้นมีอยู่แล้วในระบบ) ผู้ประสานงานจะติดอยู่กับบริษัทที่ซ้ำ

flow:
1. update_information เจอกลุ่มที่ยังไม่มีบริษัท -> upsert_pending_draft
   เก็บชื่อบริษัท + ผู้ประสานงานไว้เป็น JSONB ยังไม่แตะ companies / employees
2. GET /line/summary-drafts -> list_pending_drafts แนบบริษัทเดิมที่น่าจะใช่
   (candidates) มาให้จอเลือก
   GET /line/summary-drafts/{id}/compare?companyId= -> compare_draft
   ถ้า user เลือกบริษัทเดิม: แสดงผู้ประสานงานที่มีอยู่แล้วเทียบกับในร่าง
   ให้ติ๊กรายคนว่า "คนใหม่" (create) / "คนเดิม" (link) / "ข้าม" (skip)
3. POST /line/summary-drafts/{id}/commit -> commit_draft
   ผูกกับบริษัทเดิม หรือสร้างใหม่ แล้วเขียน employees ตามที่เลือกรายคน
   ใน transaction เดียว
4. POST /line/summary-drafts/{id}/discard -> discard_draft ทิ้งร่าง
"""

import logging
import re
from difflib import SequenceMatcher
from typing import Any

from psycopg2.extras import Json

from core.db import nl_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.company import Company, CompanyName
from schemas.employee import Employee, EmployeeBase, EmployeeExtraction
from schemas.enums import ContactStatus
from schemas.line import (
    CommitDraftRequest,
    CommitDraftResult,
    CompanyCandidate,
    ContactMatch,
    CoordinatorDecision,
    DraftComparison,
    DraftPayload,
    LineSummaryDraft,
)
from services import outbox
from services.company import get_company, link_company_pg, sync_create_company
from services.employee import create_employee_pg
from utils.mapping import columns_of, rows_to_models

logger = logging.getLogger(__name__)

MAX_CANDIDATES = 5
MIN_CANDIDATE_SCORE = 0.6


# --------------------------------------------------------------------------- #
# normalize / dedupe
# --------------------------------------------------------------------------- #

# คำนำหน้า/ท้ายชื่อนิติบุคคลที่ไม่ช่วยแยกบริษัท ตัดทิ้งก่อนเทียบ
_COMPANY_NOISE = re.compile(
    r"บริษัท|บจก\.?|บมจ\.?|หจก\.?|จำกัด|มหาชน|ประเทศไทย"
    r"|\b(?:co|ltd|limited|inc|corp|corporation|company|plc|pte|public|thailand)\b\.?",
    re.IGNORECASE,
)
# ตัดแค่ช่องว่างและเครื่องหมาย ไม่ใช้ \W เพราะสระ/วรรณยุกต์ไทยไม่นับเป็น \w
_PUNCT = re.compile(r"[\s.,\-_()\[\]\"'&/+:;|]+")


def _norm_company(name: str | None) -> str:
    if not name:
        return ""
    return _PUNCT.sub("", _COMPANY_NOISE.sub(" ", name.lower()))


def _norm_text(value: str | None) -> str:
    return _PUNCT.sub("", value.lower()) if value else ""


def _norm_phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    # +66 81... กับ 081... คือเบอร์เดียวกัน
    if digits.startswith("66") and len(digits) >= 11:
        digits = "0" + digits[2:]
    return digits


def _person_keys(person: Any) -> set[str]:
    """กุญแจที่บอกว่าเป็นคนเดียวกัน - ตรงกันตัวเดียวก็ถือว่าซ้ำ

    ชื่อเล่นใช้เฉพาะตอนที่ไม่มีชื่อจริงเลย เพราะชื่อเล่นซ้ำกันได้ง่าย
    """
    get = (lambda k: person.get(k)) if isinstance(person, dict) else (lambda k: getattr(person, k, None))
    keys: set[str] = set()
    if email := _norm_text(get("email")):
        keys.add(f"email:{email}")
    if (phone := _norm_phone(get("phone"))) and len(phone) >= 9:
        keys.add(f"phone:{phone}")
    if name_th := _norm_text(get("name_th")):
        keys.add(f"th:{name_th}")
    if name_en := _norm_text(get("name_en")):
        keys.add(f"en:{name_en}")
    if not keys and (nick := _norm_text(get("nickname"))):
        keys.add(f"nick:{nick}")
    return keys


def _merge_contacts(
    current: list[EmployeeExtraction], incoming: list[EmployeeExtraction]
) -> list[EmployeeExtraction]:
    """ต่อรายชื่อใหม่เข้าร่างเดิม คนที่ซ้ำ -> เติมช่องที่ร่างเดิมยังว่าง"""
    merged = list(current)
    for person in incoming:
        keys = _person_keys(person)
        twin = next((i for i, p in enumerate(merged) if keys & _person_keys(p)), None)
        if twin is None:
            merged.append(person)
            continue
        old = merged[twin].model_dump(by_alias=False)
        new = person.model_dump(by_alias=False)
        merged[twin] = EmployeeExtraction(
            **{k: old.get(k) if old.get(k) not in (None, "") else new.get(k) for k in old}
        )
    return merged


# --------------------------------------------------------------------------- #
# เขียนร่าง (เรียกจาก services/line.py::update_information)
# --------------------------------------------------------------------------- #

def upsert_pending_draft(
    group_id: str, group_name: str | None, summary: dict, user_id: int, conn: Any
) -> int:
    """เก็บผลสรุปของกลุ่มที่ยังไม่มีบริษัท ไม่ commit เอง ให้ caller คุม transaction

    กลุ่มหนึ่งมีร่างที่รออยู่ได้ทีละร่าง (partial unique index) ถ้ามีอยู่แล้ว
    = user ยังไม่ได้ตัดสินใจจากรอบก่อน จะต่อรายชื่อเข้าร่างเดิมแทนการสร้างใหม่
    """
    if not conn:
        raise BadRequestError(message="no connection provided on pg")

    incoming = DraftPayload(
        company_th=summary.get("company_th"),
        company_en=summary.get("company_en"),
        aliases=summary.get("aliases"),
        group_name=group_name,
        contacts=[EmployeeExtraction(**c) for c in summary.get("contacts") or []],
    )

    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, payload FROM line_summary_drafts
            WHERE group_id = %s AND status = 'pending'
            FOR UPDATE;
            """,
            (group_id,),
        )
        row = cursor.fetchone()

        if row is None:
            cursor.execute(
                """
                INSERT INTO line_summary_drafts (group_id, payload, created_by)
                VALUES (%s, %s, %s)
                RETURNING id;
                """,
                (group_id, Json(incoming.model_dump(mode="json", by_alias=False)), user_id),
            )
            return cursor.fetchone()[0]

        draft_id, raw = row
        current = DraftPayload.model_validate(raw or {})
        aliases = list(dict.fromkeys([*(current.aliases or []), *(incoming.aliases or [])]))
        merged = DraftPayload(
            # ชื่อที่ได้รอบแรกชนะ - รอบหลังเติมเฉพาะช่องที่ยังว่าง
            company_th=current.company_th or incoming.company_th,
            company_en=current.company_en or incoming.company_en,
            aliases=aliases or None,
            group_name=group_name or current.group_name,
            contacts=_merge_contacts(current.contacts, incoming.contacts),
        )
        cursor.execute(
            """
            UPDATE line_summary_drafts
            SET payload = %s, updated_at = now()
            WHERE id = %s;
            """,
            (Json(merged.model_dump(mode="json", by_alias=False)), draft_id),
        )
        return draft_id


def company_id_of_group(group_id: str, conn: Any) -> int | None:
    """บริษัทที่ผูกกับกลุ่มนี้อยู่ตอนนี้ อ่านจาก DB ไม่เชื่อ has_company จากจอ"""
    with conn.cursor() as cursor:
        cursor.execute("SELECT id FROM companies WHERE group_id = %s;", (group_id,))
        row = cursor.fetchone()
        return row[0] if row else None


# --------------------------------------------------------------------------- #
# อ่านร่าง + เดาบริษัทเดิม
# --------------------------------------------------------------------------- #

def _name_score(draft_names: list[str], company_names: list[str]) -> tuple[float, str | None]:
    best, reason = 0.0, None
    for d in draft_names:
        for c in company_names:
            if not d or not c:
                continue
            if d == c:
                return 1.0, "ชื่อบริษัทตรงกัน"
            if min(len(d), len(c)) >= 3 and (d in c or c in d):
                score, why = 0.85, "ชื่อบริษัทคล้ายกัน"
            else:
                score, why = SequenceMatcher(None, d, c).ratio(), "ชื่อบริษัทคล้ายกัน"
            if score > best:
                best, reason = score, why
    return best, reason


def _candidates_for(
    payload: DraftPayload,
    companies: list[Company],
    people_by_company: dict[int, set[str]],
) -> list[CompanyCandidate]:
    draft_names = [
        n
        for n in {
            _norm_company(payload.company_th),
            _norm_company(payload.company_en),
            *(_norm_company(a) for a in payload.aliases or []),
        }
        if n
    ]
    group_name = _norm_company(payload.group_name)
    draft_people: set[str] = set()
    for person in payload.contacts:
        draft_people |= _person_keys(person)

    results: list[CompanyCandidate] = []
    for company in companies:
        names = [
            n
            for n in {
                _norm_company(company.company_th),
                _norm_company(company.company_en),
                *(_norm_company(a) for a in company.aliases or []),
            }
            if n
        ]
        score, reason = _name_score(draft_names, names)
        reasons = [reason] if reason and score >= MIN_CANDIDATE_SCORE else []

        # ชื่อกลุ่มไลน์มักมีชื่อบริษัทอยู่ เช่น "CP x SCB ฝึกงาน 2569"
        if group_name and any(len(n) >= 3 and n in group_name for n in names):
            score = max(score, 0.8)
            reasons.append("ชื่อกลุ่มไลน์มีชื่อบริษัทนี้")

        # ผู้ประสานงานคนเดียวกัน (อีเมล/เบอร์/ชื่อ) อยู่ในบริษัทนี้แล้ว
        shared = draft_people & people_by_company.get(company.id, set())
        if shared:
            score = max(score, 0.95)
            reasons.append("พบผู้ประสานงานคนเดียวกันในบริษัทนี้")

        if score >= MIN_CANDIDATE_SCORE:
            results.append(
                CompanyCandidate(
                    company_id=company.id,
                    company_th=company.company_th,
                    company_en=company.company_en,
                    aliases=company.aliases,
                    group_id=company.group_id,
                    score=round(score, 3),
                    reasons=reasons,
                )
            )

    # บริษัทที่ยังไม่ผูกกลุ่มไหนขึ้นก่อนเมื่อคะแนนเท่ากัน
    results.sort(key=lambda c: (-c.score, c.group_id is not None))
    return results[:MAX_CANDIDATES]


def _people_index(conn: Any) -> dict[int, set[str]]:
    query = "SELECT company_id, name_th, name_en, nickname, phone, email FROM employees;"
    index: dict[int, set[str]] = {}
    with conn.cursor() as cursor:
        cursor.execute(query)
        cols = [d[0] for d in cursor.description]
        for row in cursor.fetchall():
            person = dict(zip(cols, row))
            index.setdefault(person["company_id"], set()).update(_person_keys(person))
    return index


_DRAFT_COLUMNS = "id, group_id, status, payload, created_by, created_at, updated_at"


def _to_model(row: dict, candidates: list[CompanyCandidate]) -> LineSummaryDraft:
    payload = DraftPayload.model_validate(row["payload"] or {})
    return LineSummaryDraft(
        id=row["id"],
        group_id=row["group_id"],
        status=row["status"],
        group_name=payload.group_name,
        company_th=payload.company_th,
        company_en=payload.company_en,
        aliases=payload.aliases,
        contacts=payload.contacts,
        candidates=candidates,
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_pending_drafts() -> ListResponse[LineSummaryDraft]:
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT {_DRAFT_COLUMNS} FROM line_summary_drafts
                WHERE status = 'pending'
                ORDER BY updated_at DESC, id DESC;
                """
            )
            cols = [d[0] for d in cursor.description]
            rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
            if not rows:
                return ListResponse(items=[], total=0)

            # candidates คิดตอนอ่าน ไม่เก็บลงร่าง: บริษัทที่เพิ่งถูกสร้าง/แก้ชื่อ
            # หลังสรุปต้องโผล่เป็นตัวเลือกด้วย
            cursor.execute(f"SELECT {columns_of(Company)} FROM companies;")
            companies = rows_to_models(cursor, Company)

        people = _people_index(conn)

    items = [
        _to_model(row, _candidates_for(DraftPayload.model_validate(row["payload"] or {}), companies, people))
        for row in rows
    ]
    return ListResponse(items=items, total=len(items))


# --------------------------------------------------------------------------- #
# commit / discard
# --------------------------------------------------------------------------- #

def _lock_pending_draft(draft_id: int, conn: Any) -> dict:
    with conn.cursor() as cursor:
        cursor.execute(
            f"SELECT {_DRAFT_COLUMNS} FROM line_summary_drafts WHERE id = %s FOR UPDATE;",
            (draft_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise NotFoundError(message=f"ไม่พบร่างผลสรุป id = {draft_id}")
        draft = dict(zip([d[0] for d in cursor.description], row))
    if draft["status"] != "pending":
        raise BadRequestError(message="ร่างนี้ถูกบันทึกหรือทิ้งไปแล้ว กรุณารีเฟรช")
    return draft


def _resolve(draft_id: int, status: str, user_id: int, company_id: int | None, conn: Any):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            UPDATE line_summary_drafts
            SET status = %s, company_id = %s, resolved_by = %s,
                resolved_at = now(), updated_at = now()
            WHERE id = %s;
            """,
            (status, company_id, user_id, draft_id),
        )


def commit_draft(draft_id: int, req: CommitDraftRequest, user_id: int) -> CommitDraftResult:
    """ผูก/สร้างบริษัท แล้วเขียนผู้ประสานงานจากร่าง ทั้งหมดใน transaction เดียว

    ตอนนี้รู้ company_id แน่นอนแล้ว employees.company_id NOT NULL จึงไม่เป็นปัญหา
    พังขั้นไหน get_connection จะ rollback ทั้งก้อน ไม่เหลือบริษัทค้าง
    """
    if not user_id:
        raise BadRequestError()

    company_created = False
    graph_touched = False

    with nl_db.get_connection() as conn:
        draft = _lock_pending_draft(draft_id, conn)
        payload = DraftPayload.model_validate(draft["payload"] or {})
        group_id = draft["group_id"]
        owner_id = company_id_of_group(group_id, conn)

        if req.mode == "new":
            if owner_id is not None:
                raise BadRequestError(
                    message="กลุ่มไลน์นี้ถูกผูกกับบริษัทอื่นไปแล้ว กรุณาเลือก \"ผูกกับบริษัทเดิม\""
                )
            name = req.company or CompanyName(
                company_th=payload.company_th,
                company_en=payload.company_en,
                aliases=payload.aliases,
            )
            if not (name.company_th or name.company_en):
                raise BadRequestError(message="กรุณาระบุชื่อบริษัทที่จะสร้าง")
            # uq_company_th / uq_company_en: เช็คก่อน insert เพื่อบอก user ให้ชัดว่า
            # ชื่อนี้มีอยู่แล้ว = น่าจะเป็นบริษัทเดิม ควรเลือกผูกแทนการสร้าง
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM companies WHERE company_th = %s OR company_en = %s LIMIT 1;",
                    (name.company_th, name.company_en),
                )
                if cursor.fetchone():
                    raise BadRequestError(
                        message="มีบริษัทชื่อนี้อยู่ในระบบแล้ว กรุณาเลือก \"ผูกกับบริษัทเดิม\" หรือแก้ชื่อ"
                    )
            company_id = sync_create_company(name, group_id=group_id, conn=conn)
            company_created = graph_touched = True
        else:
            company = get_company(req.company_id, conn=conn)
            company_id = company.id
            if owner_id is not None and owner_id != company_id:
                raise BadRequestError(message="กลุ่มไลน์นี้ถูกผูกกับบริษัทอื่นไปแล้ว กรุณารีเฟรช")
            if company.group_id != group_id:
                # บริษัทที่ผูกกลุ่มอื่นอยู่จะย้ายมาผูกกลุ่มนี้แทน (จอเตือนไว้แล้ว)
                link_company_pg(id=company_id, group_id=group_id, conn=conn)
                outbox.enqueue(conn, outbox.COMPANY, company_id, outbox.LINK, payload={"group_id": group_id})
                graph_touched = True

        decisions = _decisions_for(payload, req.coordinators)
        people = _employees_of(company_id, conn)
        existing: set[str] = set().union(*(keys for _, keys in people.values()))
        created = linked = skipped = 0
        graph_employees: list[int] = []

        for index, person in enumerate(payload.contacts):
            decision = decisions.get(index)
            if decision and decision.data:
                person = decision.data
            keys = _person_keys(person)
            action = decision.action if decision else ("skip" if keys & existing else "create")

            if action == "skip":
                skipped += 1
                continue

            if action == "link":
                if decision.employee_id not in people:
                    raise BadRequestError(
                        message="ผู้ประสานงานเดิมที่เลือกไม่ได้อยู่ในบริษัทนี้ กรุณารีเฟรช"
                    )
                employee = _fill_blank_fields(decision.employee_id, person, conn)
                # pending ยังไม่ขึ้นกราฟ (ขึ้นตอนกดยืนยัน) - แถวที่ยืนยันแล้วต้อง sync
                if employee.status != ContactStatus.PENDING:
                    outbox.enqueue(
                        conn, outbox.EMPLOYEE, employee.id, outbox.UPSERT,
                        employee.model_dump(mode="json", by_alias=False),
                    )
                    graph_employees.append(employee.id)
                existing |= keys
                linked += 1
                continue

            create_employee_pg(
                EmployeeBase(
                    **person.model_dump(by_alias=False),
                    status=ContactStatus.PENDING,
                    company_id=company_id,
                ),
                user_id=user_id,
                conn=conn,
            )
            existing |= keys
            created += 1

        _resolve(draft_id, "committed", user_id, company_id, conn)
        conn.commit()

    if graph_touched:
        outbox.flush(outbox.COMPANY, company_id)
    for employee_id in graph_employees:
        outbox.flush(outbox.EMPLOYEE, employee_id)

    logger.info(
        "commit_draft %s -> company %s (created=%s) employees +%d link %d skip %d",
        draft_id, company_id, company_created, created, linked, skipped,
    )
    return CommitDraftResult(
        draft_id=draft_id,
        company_id=company_id,
        company_created=company_created,
        created_employees=created,
        linked_employees=linked,
        skipped_duplicates=skipped,
    )


def _decisions_for(
    payload: DraftPayload, decisions: list[CoordinatorDecision] | None
) -> dict[int, CoordinatorDecision]:
    by_index = {d.index: d for d in decisions or []}
    out_of_range = [i for i in by_index if i >= len(payload.contacts)]
    if out_of_range:
        # ร่างถูกต่อรายชื่อ/แก้ระหว่างที่จอเปิดค้างไว้ ลำดับอาจไม่ตรงแล้ว
        raise BadRequestError(message="รายชื่อผู้ประสานงานในร่างเปลี่ยนไปแล้ว กรุณารีเฟรช")
    return by_index


def _employees_of(company_id: int, conn: Any) -> dict[int, tuple[Employee, set[str]]]:
    """employees ของบริษัท: id -> (แถว, กุญแจที่ใช้เทียบว่าเป็นคนเดียวกัน)"""
    query = f"SELECT {columns_of(Employee)} FROM employees WHERE company_id = %s ORDER BY id;"
    with conn.cursor() as cursor:
        cursor.execute(query, (company_id,))
        rows = rows_to_models(cursor, Employee)
    return {e.id: (e, _person_keys(e)) for e in rows}


_FILLABLE = ("name_th", "name_en", "nickname", "job_title", "phone", "email", "relevant")


def _fill_blank_fields(employee_id: int, person: EmployeeExtraction, conn: Any) -> Employee:
    """ผูกคนในร่างเข้ากับ employee เดิม: เติมเฉพาะช่องที่ยังว่าง ไม่ทับของเดิม"""
    data = person.model_dump(mode="json", by_alias=False)
    sets = ", ".join(f"{c} = COALESCE(NULLIF({c}, ''), %({c})s)" for c in _FILLABLE)
    query = f"""
        UPDATE employees SET {sets}, updated_at = now()
        WHERE id = %(id)s
        RETURNING {columns_of(Employee)};
    """
    with conn.cursor() as cursor:
        cursor.execute(query, {**{c: data.get(c) or None for c in _FILLABLE}, "id": employee_id})
        rows = rows_to_models(cursor, Employee)
    if not rows:
        raise NotFoundError(message=f"ไม่พบข้อมูลคน id = {employee_id}")
    return rows[0]


_KEY_LABELS = {"email": "อีเมล", "phone": "เบอร์โทร", "th": "ชื่อไทย", "en": "ชื่ออังกฤษ", "nick": "ชื่อเล่น"}
# ลำดับความน่าเชื่อ: อีเมล/เบอร์ ชัดกว่าชื่อ
_KEY_WEIGHT = {"email": 3, "phone": 3, "th": 2, "en": 2, "nick": 1}


def compare_draft(draft_id: int, company_id: int) -> DraftComparison:
    """ผู้ประสานงานในร่าง เทียบกับคนที่มีอยู่แล้วในบริษัทที่ user กำลังจะเลือก

    ไม่เขียนอะไร แค่ช่วยจอเดาว่าคนไหนเป็นคนเดิม (link) คนไหนเป็นคนใหม่ (create)
    user ยังแก้ได้ก่อนกด commit
    """
    with nl_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT status, payload FROM line_summary_drafts WHERE id = %s;", (draft_id,)
            )
            row = cursor.fetchone()
        if not row:
            raise NotFoundError(message=f"ไม่พบร่างผลสรุป id = {draft_id}")
        if row[0] != "pending":
            raise BadRequestError(message="ร่างนี้ถูกบันทึกหรือทิ้งไปแล้ว กรุณารีเฟรช")
        get_company(company_id, conn=conn)  # 404 ถ้าไม่มีบริษัทนี้
        payload = DraftPayload.model_validate(row[1] or {})
        people = _employees_of(company_id, conn)

    matches: list[ContactMatch] = []
    for index, person in enumerate(payload.contacts):
        keys = _person_keys(person)
        best_id, best_shared, best_weight = None, set(), 0
        for employee_id, (_, employee_keys) in people.items():
            shared = keys & employee_keys
            weight = sum(_KEY_WEIGHT[k.split(":", 1)[0]] for k in shared)
            if weight > best_weight:
                best_id, best_shared, best_weight = employee_id, shared, weight
        matches.append(
            ContactMatch(
                index=index,
                contact=person,
                employee_id=best_id,
                matched_by=sorted({_KEY_LABELS[k.split(":", 1)[0]] for k in best_shared}),
                suggested_action="link" if best_id else "create",
            )
        )

    return DraftComparison(
        draft_id=draft_id,
        company_id=company_id,
        existing=[employee for employee, _ in people.values()],
        matches=matches,
    )


def discard_draft(draft_id: int, user_id: int) -> None:
    if not user_id:
        raise BadRequestError()
    with nl_db.get_connection() as conn:
        _lock_pending_draft(draft_id, conn)
        _resolve(draft_id, "discarded", user_id, None, conn)
        conn.commit()
