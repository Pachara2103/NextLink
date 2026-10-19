"""Transactional Friday follow-ups. No graph, messages, or automatic issues."""
import hashlib
import json

from psycopg2.extras import Json

from core.db import nl_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.friday_followup import (
    FollowupResult, FridayNote, FridayTask, NoteList, NoteVersionList, TaskList,
)
from services.friday_activity import (
    _activity, _audit, _conflict, _execute, _json, _revision, _rows, _valid_id,
)


def _read(conn, kind, activity_id, item_id=None, *, before_id=None, limit=50):
    # Only internal literal kinds reach this helper; no client-supplied SQL names.
    table = "friday_notes" if kind == "note" else "friday_tasks"
    fields = "r.kind,r.body,r.reference,r.occurred_at" if kind == "note" else """r.title,r.description,
        r.assignee_user_id::text,COALESCE(NULLIF(a.display_name,''),a.username) AS assignee_name,r.due_date,r.status"""
    join = "" if kind == "note" else " JOIN users a ON a.id=r.assignee_user_id"
    where, params = "r.activity_id=%s", [activity_id]
    if item_id is not None:
        _valid_id(item_id)
        where += " AND r.id=%s"
        params.append(item_id)
    if before_id is not None:
        _valid_id(before_id)
        where += " AND r.id<%s"
        params.append(before_id)
    params.append(limit)
    rows = _rows(conn, f"""SELECT r.id::text,r.activity_id::text,r.author_user_id::text,
        COALESCE(NULLIF(u.display_name,''),u.username) AS author_name,
        r.updated_by_user_id::text,COALESCE(NULLIF(e.display_name,''),e.username) AS updated_by_name,
        r.version,r.recorded_at,r.updated_at,{fields}
        FROM {table} r JOIN users u ON u.id=r.author_user_id JOIN users e ON e.id=r.updated_by_user_id
        {join} WHERE {where} ORDER BY r.id DESC LIMIT %s""", params)
    model = FridayNote if kind == "note" else FridayTask
    return [model.model_validate(row) for row in rows]


def list_items(activity_id, kind, before_id=None, limit=50):
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        _activity(conn, activity_id)
        items = _read(conn, kind, activity_id, before_id=before_id, limit=limit+1)
        model = NoteList if kind == "note" else TaskList
        result = model(items=items[:limit], next_cursor=items[limit-1].id if len(items) > limit else None)
        conn.rollback()
        return result


def note_versions(activity_id, note_id, before_version=None, limit=50):
    _valid_id(activity_id)
    with nl_db.get_connection() as conn:
        _execute(conn, "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        if not _read(conn, "note", activity_id, note_id):
            raise NotFoundError(message="ไม่พบบันทึกในกิจกรรมนี้")
        rows = _rows(conn, """SELECT v.version,v.editor_user_id::text,
            COALESCE(NULLIF(u.display_name,''),u.username) AS editor_name,v.reason,v.snapshot,v.recorded_at
            FROM friday_note_versions v JOIN users u ON u.id=v.editor_user_id
            WHERE v.note_id=%s AND (%s IS NULL OR v.version<%s)
            ORDER BY v.version DESC LIMIT %s""", (note_id,before_version,before_version,limit+1))
        result = NoteVersionList(items=rows[:limit], next_cursor=rows[limit-1]["version"] if len(rows) > limit else None)
        conn.rollback()
        return result


def write_item_in_transaction(conn, activity_id, kind, payload, actor, item_id=None):
    _valid_id(activity_id)
    if item_id is not None:
        _valid_id(item_id)
    operation = f"{kind}.{'update' if item_id else 'create'}"
    fingerprint = hashlib.sha256(json.dumps({"activityId":str(activity_id),"itemId":item_id,"payload":_json(payload)},
        ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    _execute(conn,"SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",(f"friday:{actor}:{operation}:{payload.idempotency_key}",))
    receipt = _rows(conn,"""SELECT request_hash,response_data FROM friday_mutation_receipts
        WHERE actor_user_id=%s AND operation=%s AND idempotency_key=%s""",(actor,operation,payload.idempotency_key))
    if receipt:
        if receipt[0]["request_hash"] != fingerprint:
            _conflict("รหัสคำสั่งนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาสร้างคำสั่งใหม่")
        return FollowupResult.model_validate(receipt[0]["response_data"])
    before = _activity(conn, activity_id, lock=True)
    _revision(before,payload.expected_revision)
    previous = None
    if item_id:
        items = _read(conn,kind,activity_id,item_id)
        if not items:
            raise NotFoundError(message="ไม่พบรายการในกิจกรรมนี้")
        previous = items[0]
    if kind == "note":
        if previous and not payload.reason:
            raise BadRequestError(message="การแก้บันทึกต้องระบุเหตุผลและเก็บฉบับเดิม")
        values = (payload.kind,payload.body,payload.reference or None,payload.occurred_at,actor)
        if previous:
            _execute(conn,"""UPDATE friday_notes SET kind=%s,body=%s,reference=%s,occurred_at=%s,
                updated_by_user_id=%s,version=version+1,updated_at=clock_timestamp() WHERE id=%s""",(*values,item_id))
        else:
            item_id = str(_rows(conn,"""INSERT INTO friday_notes(kind,body,reference,occurred_at,updated_by_user_id,author_user_id,activity_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",(*values,actor,activity_id))[0]["id"])
    else:
        # An unchanged former assignee remains readable/editable after deactivation.
        # New assignments always require current active staff/admin membership.
        if not previous or previous.assignee_user_id != payload.assignee_user_id:
            if not _rows(conn,"SELECT id FROM users WHERE id=%s AND is_active AND role IN ('staff','admin') FOR SHARE",(payload.assignee_user_id,)):
                raise BadRequestError(message="ผู้รับผิดชอบงานต้องเป็นเจ้าหน้าที่หรือผู้ดูแลที่ใช้งานอยู่")
        if not previous and payload.status != "open":
            raise BadRequestError(message="งานติดตามใหม่ต้องเริ่มด้วยสถานะรอดำเนินการ")
        if previous and previous.status != payload.status and (payload.status == "cancelled" or previous.status != "open") and not payload.reason:
            raise BadRequestError(message="การยกเลิกหรือเปิดงานติดตามใหม่ต้องระบุเหตุผล")
        values = (payload.title,payload.description or None,payload.assignee_user_id,payload.due_date,payload.status,actor)
        if previous:
            _execute(conn,"""UPDATE friday_tasks SET title=%s,description=%s,assignee_user_id=%s,due_date=%s,status=%s,
                updated_by_user_id=%s,version=version+1,updated_at=clock_timestamp() WHERE id=%s""",(*values,item_id))
        else:
            item_id = str(_rows(conn,"""INSERT INTO friday_tasks(title,description,assignee_user_id,due_date,status,updated_by_user_id,author_user_id,activity_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",(*values,actor,activity_id))[0]["id"])
    item = _read(conn,kind,activity_id,item_id)[0]
    if kind == "note":
        _execute(conn,"""INSERT INTO friday_note_versions(note_id,version,editor_user_id,reason,snapshot)
            VALUES (%s,%s,%s,%s,%s)""",(item.id,item.version,actor,payload.reason,Json(_json(item))))
    _execute(conn,"UPDATE friday_activities SET revision=revision+1,updated_at=clock_timestamp() WHERE id=%s",(activity_id,))
    after = _activity(conn,activity_id)
    _audit(conn,before,after,actor,operation,payload.reason,
        detail={"kind":kind,"before":_json(previous) if previous else None,"after":_json(item)})
    result = FollowupResult(activity=after,item=item)
    _execute(conn,"""INSERT INTO friday_mutation_receipts(actor_user_id,operation,idempotency_key,request_hash,activity_id,response_data)
        VALUES (%s,%s,%s,%s,%s,%s)""",(actor,operation,payload.idempotency_key,fingerprint,activity_id,Json(_json(result))))
    return result


def write_item(activity_id, kind, payload, actor, item_id=None):
    with nl_db.get_connection() as conn:
        result = write_item_in_transaction(conn,activity_id,kind,payload,actor,item_id)
        conn.commit()
        return result
