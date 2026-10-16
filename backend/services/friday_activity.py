"""Friday activity persistence; no graph projection or external side effects.

The *_in_transaction functions also serve reviewed imports. The caller owns
commit/rollback; child mutations, revision, audit and receipts share one commit.
"""
import hashlib
import json

from psycopg2.extras import Json, RealDictCursor

from core.db import nl_db
from core.exceptions import AppException, BadRequestError, NotFoundError
from schemas.friday_activity import (
    FridayActivity, FridayActivityCreate, FridayActivityList, FridayActivityUpdate,
    FridayHistory, FridayOptions, FridayTransition,
)


def _conflict(message):
    raise AppException(message=message, status_code=409)


def _rows(conn, sql, params=()):
    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(sql, params)
        return [dict(row) for row in cursor.fetchall()]


def _execute(conn, sql, params=()):
    with conn.cursor() as cursor:
        cursor.execute(sql, params)


def _json(model):
    return model.model_dump(mode="json", by_alias=True)


def _valid_id(value):
    if not str(value).isdigit() or not 0 < int(value) <= 9223372036854775807:
        raise BadRequestError(message="รหัสข้อมูลไม่ถูกต้อง")


def _activity(conn, activity_id, *, lock=False):
    _valid_id(activity_id)
    rows = _rows(conn, """SELECT a.*, p.academic_year, p.term FROM friday_activities a
        JOIN academic_periods p ON p.id=a.period_id WHERE a.id=%s""" + (" FOR UPDATE OF a" if lock else ""), (activity_id,))
    if not rows:
        raise NotFoundError(message="ไม่พบกิจกรรม Friday ที่ระบุ")
    row = rows[0]
    companies = _rows(conn, """SELECT c.id::text AS id, COALESCE(NULLIF(btrim(c.company_th),''),NULLIF(btrim(c.company_en),''),'Company '||c.id) AS name
        FROM friday_activity_companies ac JOIN companies c ON c.id=ac.company_id
        WHERE ac.activity_id=%s ORDER BY c.id""", (activity_id,))
    people = _rows(conn, """SELECT id::text AS id, namespace,
        COALESCE(employee_id,contact_id)::text AS source_id, name_snapshot AS name, role
        FROM friday_activity_people WHERE activity_id=%s ORDER BY id""", (activity_id,))
    sessions = _rows(conn, """SELECT id::text AS id, session_date,
        to_char(start_time,'HH24:MI') AS start_time, to_char(end_time,'HH24:MI') AS end_time,
        location,status,capacity,booked,attended FROM friday_sessions WHERE activity_id=%s ORDER BY id""", (activity_id,))
    return FridayActivity(
        id=str(row["id"]), academic_year=row["academic_year"], term=row["term"], title=row["title"],
        description=row["description"], domain=row["domain"], format=row["format"], status=row["status"],
        owner_user_id=str(row["owner_user_id"]), company_ids=[c["id"] for c in companies], companies=companies,
        people=people, sessions=sessions, revision=row["revision"], created_at=row["created_at"], updated_at=row["updated_at"],
    )


def _period(conn, year, term):
    inserted = _rows(conn, """INSERT INTO academic_periods(academic_year,term) VALUES (%s,%s)
        ON CONFLICT(academic_year,term) DO NOTHING RETURNING id""", (year, term))
    return (inserted or _rows(conn, "SELECT id FROM academic_periods WHERE academic_year=%s AND term=%s", (year,term)))[0]["id"]


def _references(conn, payload, before=None):
    # Lock references against deletion and role removal through this transaction.
    owner = _rows(conn, """SELECT id FROM users WHERE id=%s AND is_active=true
        AND role IN ('staff','admin') FOR SHARE""", (payload.owner_user_id,))
    if not owner:
        raise BadRequestError(message="ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่หรือผู้ดูแลที่ใช้งานอยู่")
    if payload.company_ids:
        companies = _rows(conn, "SELECT id::text AS id FROM companies WHERE id=ANY(%s::bigint[]) ORDER BY id FOR KEY SHARE", (payload.company_ids,))
        if {row["id"] for row in companies} != set(payload.company_ids):
            raise BadRequestError(message="มีบริษัทที่ไม่อยู่ในทะเบียน กรุณาเลือกบริษัทใหม่")
    prior_people = {p.id:p for p in before.people} if before else {}
    names = []
    for person in payload.people:
        if person.namespace == "guest":
            names.append(person.name)
            continue
        if person.namespace == "employee":
            query = """SELECT company_id::text AS company_id,
                COALESCE(NULLIF(btrim(name_th),''),NULLIF(btrim(name_en),''),NULLIF(btrim(nickname),''),'Employee '||id) AS name
                FROM employees WHERE id=%s FOR KEY SHARE"""
        else:
            query = "SELECT company_id::text AS company_id,name FROM contacts WHERE id=%s FOR KEY SHARE"
        rows = _rows(conn, query, (person.source_id,))
        if not rows:
            raise BadRequestError(message="ไม่พบผู้เกี่ยวข้องในทะเบียน กรุณาเลือกใหม่")
        prior = prior_people.get(person.id)
        same_identity = prior and prior.namespace == person.namespace and prior.source_id == person.source_id
        if not same_identity and rows[0]["company_id"] not in payload.company_ids:
            raise BadRequestError(message="บริษัทของผู้เกี่ยวข้องต้องอยู่ในรายชื่อบริษัทร่วมกิจกรรม")
        # Names are server snapshots of the chosen identity, never caller claims.
        names.append(prior.name if same_identity else rows[0]["name"])
    return names


def _children(conn, activity_id, payload, names):
    _execute(conn, "DELETE FROM friday_activity_companies WHERE activity_id=%s", (activity_id,))
    for company_id in payload.company_ids:
        _execute(conn, "INSERT INTO friday_activity_companies(activity_id,company_id) VALUES (%s,%s)", (activity_id, company_id))
    existing_people = {r["id"] for r in _rows(conn, "SELECT id::text AS id FROM friday_activity_people WHERE activity_id=%s", (activity_id,))}
    existing_sessions = {r["id"] for r in _rows(conn, "SELECT id::text AS id FROM friday_sessions WHERE activity_id=%s", (activity_id,))}
    for values, existing, table in [(payload.people, existing_people, "friday_activity_people"), (payload.sessions, existing_sessions, "friday_sessions")]:
        supplied = {value.id for value in values if value.id is not None}
        if not supplied.issubset(existing):
            raise BadRequestError(message="รหัสรอบหรือผู้เกี่ยวข้องไม่ได้อยู่ในกิจกรรมนี้")
        removed = existing - supplied
        if removed:
            _execute(conn, f"DELETE FROM {table} WHERE activity_id=%s AND id=ANY(%s::bigint[])", (activity_id, list(removed)))
    for person, name in zip(payload.people, names):
        values = (person.namespace, person.source_id if person.namespace == "employee" else None,
                  person.source_id if person.namespace == "contact" else None, name, person.role)
        if person.id:
            _execute(conn, """UPDATE friday_activity_people SET namespace=%s,employee_id=%s,contact_id=%s,
                name_snapshot=%s,role=%s WHERE activity_id=%s AND id=%s""", (*values, activity_id, person.id))
        else:
            _execute(conn, """INSERT INTO friday_activity_people(namespace,employee_id,contact_id,name_snapshot,role,activity_id)
                VALUES (%s,%s,%s,%s,%s,%s)""", (*values, activity_id))
    for session in payload.sessions:
        values = (session.session_date, session.start_time, session.end_time, session.location or None,
                  session.status, session.capacity, session.booked, session.attended)
        if session.id:
            _execute(conn, """UPDATE friday_sessions SET session_date=%s,start_time=%s,end_time=%s,location=%s,
                status=%s,capacity=%s,booked=%s,attended=%s WHERE activity_id=%s AND id=%s""", (*values, activity_id, session.id))
        else:
            _execute(conn, """INSERT INTO friday_sessions(session_date,start_time,end_time,location,status,capacity,booked,attended,activity_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (*values, activity_id))


def _audit(conn, before, after, actor, operation, reason=None):
    _execute(conn, """INSERT INTO friday_audit_events(activity_id,actor_user_id,operation,reason,before_data,after_data,recorded_at,occurred_at)
        VALUES (%s,%s,%s,%s,%s,%s,clock_timestamp(),clock_timestamp())""", (after.id, actor, operation, reason,
        Json(_json(before)) if before else None, Json(_json(after))))


def _revision(before, expected):
    if before.revision != expected:
        _conflict("ข้อมูลถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง")


def _gate(status, sessions):
    active = [s for s in sessions if s.status != "cancelled"]
    if status in {"confirmed", "in_progress"}:
        if not active or any(not s.session_date or not s.start_time or not s.end_time or not s.location for s in active):
            raise BadRequestError(message="การยืนยันต้องมีรอบพร้อมวัน เวลาเริ่มและสิ้นสุด และสถานที่ครบ")
    if status == "completed" and (not any(s.status == "held" for s in sessions) or any(s.status == "planned" for s in sessions)):
        raise BadRequestError(message="การปิดงานต้องมีอย่างน้อยหนึ่งรอบจัดแล้ว และไม่มีรอบที่ยังวางแผนค้างอยู่")


def create_activity_in_transaction(conn, payload: FridayActivityCreate, actor_user_id: str, operation: str = "create") -> FridayActivity:
    fingerprint = hashlib.sha256(json.dumps(_json(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    # The lock also serializes concurrent first attempts before a receipt exists.
    _execute(conn, "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (f"friday:{actor_user_id}:{operation}:{payload.idempotency_key}",))
    receipt = _rows(conn, """SELECT request_hash,response_data FROM friday_mutation_receipts
        WHERE actor_user_id=%s AND operation=%s AND idempotency_key=%s""", (actor_user_id, operation, payload.idempotency_key))
    if receipt:
        if receipt[0]["request_hash"] != fingerprint:
            _conflict("รหัสคำสั่งนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาสร้างคำสั่งใหม่")
        return FridayActivity.model_validate(receipt[0]["response_data"])
    if any(p.id for p in payload.people) or any(s.id for s in payload.sessions):
        raise BadRequestError(message="กิจกรรมใหม่ไม่สามารถใช้รหัสรอบหรือผู้เกี่ยวข้องเดิม")
    names = _references(conn, payload)
    period_id = _period(conn, payload.academic_year, payload.term)
    activity_id = _rows(conn, """INSERT INTO friday_activities(period_id,title,description,domain,format,status,owner_user_id)
        VALUES (%s,%s,%s,%s,%s,'draft',%s) RETURNING id""",
        (period_id,payload.title,payload.description,payload.domain,payload.format,payload.owner_user_id))[0]["id"]
    _children(conn, activity_id, payload, names)
    after = _activity(conn, activity_id)
    _audit(conn, None, after, actor_user_id, operation)
    _execute(conn, """INSERT INTO friday_mutation_receipts(actor_user_id,operation,idempotency_key,request_hash,activity_id,response_data)
        VALUES (%s,%s,%s,%s,%s,%s)""", (actor_user_id,operation,payload.idempotency_key,fingerprint,activity_id,Json(_json(after))))
    return after


def update_activity_in_transaction(conn, activity_id: str, payload: FridayActivityUpdate, actor_user_id: str, reason: str | None = None) -> FridayActivity:
    before = _activity(conn, activity_id, lock=True)
    _revision(before, payload.expected_revision)
    reason = reason or payload.reason
    if before.status in {"completed", "cancelled"} and not reason:
        raise BadRequestError(message="การแก้ประวัติงานที่ปิดแล้วต้องระบุเหตุผล")
    old_schedule = [(s.id,s.session_date,s.start_time,s.end_time,s.location,s.status) for s in before.sessions]
    new_schedule = [(s.id,s.session_date,s.start_time,s.end_time,s.location,s.status) for s in payload.sessions]
    if before.status in {"confirmed", "in_progress"} and old_schedule != new_schedule and not reason:
        raise BadRequestError(message="การเลื่อนหรือแก้รอบที่ยืนยันแล้วต้องระบุเหตุผล")
    _gate(before.status, payload.sessions)
    names = _references(conn, payload, before)
    period_id = _period(conn, payload.academic_year, payload.term)
    _execute(conn, """UPDATE friday_activities SET period_id=%s,title=%s,description=%s,domain=%s,format=%s,
        owner_user_id=%s,revision=revision+1,updated_at=clock_timestamp() WHERE id=%s""",
        (period_id,payload.title,payload.description,payload.domain,payload.format,payload.owner_user_id,activity_id))
    _children(conn, activity_id, payload, names)
    after = _activity(conn, activity_id)
    _audit(conn, before, after, actor_user_id, "update", reason)
    return after


_FORWARD = {
    "draft": {"contacting", "invited", "confirmed", "cancelled"},
    "contacting": {"invited", "confirmed", "cancelled"},
    "invited": {"contacting", "confirmed", "cancelled"},
    "confirmed": {"contacting", "in_progress", "cancelled"},
    "in_progress": {"confirmed", "completed", "cancelled"},
    "completed": {"confirmed"},
    "cancelled": {"draft"},
}


def transition_activity_in_transaction(conn, activity_id: str, payload: FridayTransition, actor_user_id: str, *, allow_historical=False, operation="transition") -> FridayActivity:
    before = _activity(conn, activity_id, lock=True)
    _revision(before, payload.expected_revision)
    historical = allow_historical and before.status == "draft" and payload.status == "completed"
    if payload.status not in _FORWARD[before.status] and not historical:
        _conflict("ไม่สามารถเปลี่ยนเป็นสถานะที่ระบุจากสถานะปัจจุบัน")
    if (payload.status == "cancelled" or before.status in {"completed", "cancelled"}
        or (before.status == "confirmed" and payload.status == "contacting")
        or (before.status == "in_progress" and payload.status == "confirmed")) and not payload.reason:
        raise BadRequestError(message="การยกเลิก เปิดงานใหม่ หรือย้อนสถานะต้องระบุเหตุผล")
    _gate(payload.status, before.sessions)
    _execute(conn, "UPDATE friday_activities SET status=%s,revision=revision+1,updated_at=clock_timestamp() WHERE id=%s", (payload.status,activity_id))
    after = _activity(conn, activity_id)
    _audit(conn, before, after, actor_user_id, operation, payload.reason)
    return after


def create_activity(payload, actor_user_id):
    with nl_db.get_connection() as conn:
        result = create_activity_in_transaction(conn,payload,actor_user_id)
        conn.commit()
        return result


def update_activity(activity_id, payload, actor_user_id):
    with nl_db.get_connection() as conn:
        result = update_activity_in_transaction(conn,activity_id,payload,actor_user_id)
        conn.commit()
        return result


def transition_activity(activity_id, payload, actor_user_id):
    with nl_db.get_connection() as conn:
        result = transition_activity_in_transaction(conn,activity_id,payload,actor_user_id)
        conn.commit()
        return result


def get_activity(activity_id):
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        result = _activity(conn, activity_id)
        conn.rollback()
        return result


def list_activities(*, academic_year=None, term=None, status=None, company_id=None, search=None, page=1, page_size=25):
    if company_id is not None:
        _valid_id(company_id)
    clauses, params = [], []
    for value, clause in [(academic_year,"p.academic_year=%s"),(term,"p.term=%s"),(status,"a.status=%s"),
                          (company_id,"EXISTS(SELECT 1 FROM friday_activity_companies ac WHERE ac.activity_id=a.id AND ac.company_id=%s)")]:
        if value is not None:
            clauses.append(clause)
            params.append(value)
    if search:
        clauses.append("""(a.title ILIKE %s OR COALESCE(a.description,'') ILIKE %s
            OR COALESCE(a.domain,'') ILIKE %s
            OR EXISTS(SELECT 1 FROM friday_activity_companies ac JOIN companies c ON c.id=ac.company_id
                WHERE ac.activity_id=a.id AND concat_ws(' ',c.company_th,c.company_en,array_to_string(c.aliases,' ')) ILIKE %s)
            OR EXISTS(SELECT 1 FROM friday_sessions s WHERE s.activity_id=a.id AND COALESCE(s.location,'') ILIKE %s))""")
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params.extend([f"%{escaped}%"] * 5)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    filtered = "SELECT a.id,a.status,a.updated_at FROM friday_activities a JOIN academic_periods p ON p.id=a.period_id" + where
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        summary = _rows(conn, f"""WITH filtered AS ({filtered}) SELECT
            (SELECT count(*) FROM filtered) AS total,
            (SELECT count(*) FROM filtered WHERE status='completed') AS completed,
            (SELECT count(DISTINCT ac.company_id) FROM friday_activity_companies ac JOIN filtered f ON f.id=ac.activity_id WHERE f.status<>'cancelled') AS companies,
            (SELECT sum(s.attended) FROM friday_sessions s JOIN filtered f ON f.id=s.activity_id WHERE s.status='held' AND f.status<>'cancelled') AS attended,
            (SELECT count(*) FROM friday_sessions s JOIN filtered f ON f.id=s.activity_id WHERE s.status='held' AND s.attended IS NULL AND f.status<>'cancelled') AS unknown_attendance,
            (SELECT max(updated_at) FROM filtered) AS last_updated""", params)[0]
        ids = _rows(conn, f"SELECT id FROM ({filtered}) f ORDER BY updated_at DESC,id DESC LIMIT %s OFFSET %s", (*params,page_size,(page-1)*page_size))
        items = [_activity(conn,row["id"]) for row in ids]
        result = FridayActivityList(items=items,total=summary["total"],page=page,page_size=page_size,
            summary={k:summary[k] for k in ["total","completed","companies","attended","unknown_attendance"]},last_updated=summary["last_updated"])
        conn.rollback()
        return result


def get_options():
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        companies = _rows(conn, "SELECT id::text AS id,COALESCE(NULLIF(btrim(company_th),''),NULLIF(btrim(company_en),''),'Company '||id) AS name FROM companies ORDER BY name,id")
        people = _rows(conn, """SELECT 'employee' AS namespace,id::text AS source_id,company_id::text AS company_id,
            COALESCE(NULLIF(btrim(name_th),''),NULLIF(btrim(name_en),''),NULLIF(btrim(nickname),''),'Employee '||id) AS name FROM employees WHERE status='active'
            UNION ALL SELECT 'contact',id::text,company_id::text,name FROM contacts WHERE status='active' ORDER BY name,namespace,source_id""")
        owners = _rows(conn, "SELECT id::text AS id,COALESCE(NULLIF(display_name,''),username) AS name FROM users WHERE is_active=true AND role IN ('staff','admin') ORDER BY name,id")
        periods = _rows(conn, "SELECT academic_year,term FROM academic_periods ORDER BY academic_year DESC,term")
        result = FridayOptions(companies=companies,people=people,owners=owners,periods=periods)
        conn.rollback()
        return result


def get_history(activity_id):
    _valid_id(activity_id)
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        if not _rows(conn,"SELECT id FROM friday_activities WHERE id=%s",(activity_id,)):
            raise NotFoundError(message="ไม่พบกิจกรรม Friday ที่ระบุ")
        rows = _rows(conn, """SELECT e.id::text AS id,e.activity_id::text AS activity_id,e.actor_user_id::text AS actor_user_id,
            COALESCE(NULLIF(u.display_name,''),u.username) AS actor_name,e.operation,e.reason,
            e.before_data AS before,e.after_data AS after,e.occurred_at,e.recorded_at
            FROM friday_audit_events e JOIN users u ON u.id=e.actor_user_id WHERE e.activity_id=%s ORDER BY e.id DESC""", (activity_id,))
        result = FridayHistory(items=rows)
        conn.rollback()
        return result
