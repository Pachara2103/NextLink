from core.db import pg_db, graph_db
from core.exceptions import BadRequestError, NotFoundError
from services import outbox
from schemas.base import ListResponse
from schemas.enums import NoteType
from schemas.note import Note, NoteCreate
from utils.mapping import rows_to_models, columns_of, placeholders_of, assignments_of, graph_assignments_of
from typing import Any

# from core.ai import get_embedder
# from utils.tokenizer import thai_tokenizer


SELECT_NOTES = """
    SELECT
        p.name_th, 
        p.name_en,
        p.nickname,
    
        c.company_th,
        c.company_en,
        COALESCE(c.aliases, '{}'::text[]) AS aliases,
        
        n.created_at,
        n.updated_at,
        n.content,
        n.type,
        n.sentiment,
        n.source,
        n.year,
        n.semester,
        
        n.company_id,
        n.employee_id,
        n.id
    
    FROM notes n
    LEFT JOIN companies c ON c.id = n.company_id
    LEFT JOIN employees p ON p.id = n.employee_id
"""


def _validate(payload: NoteCreate) -> None:
    if not payload.content or not payload.content.strip():
        raise BadRequestError(message="กรุณากรอกเนื้อหาโน้ต")

    if not payload.company_id:
        raise BadRequestError(message="กรุณาเลือกบริษัทของโน้ตนี้")

    if payload.type == NoteType.PERSON and payload.employee_id is None:
        raise BadRequestError(message="โน้ตประเภทนี้ต้องเลือกผู้ประสานงานด้วย")

    if payload.type != NoteType.PERSON and payload.employee_id is not None:
        raise BadRequestError( message="โน้ตประเภทนี้ผูกกับบริษัท ไม่ต้องระบุผู้ประสานงาน")


def _params(payload: NoteCreate) -> dict:
    content = payload.content.strip()
    return { 
            **payload.model_dump(by_alias=False, exclude={"content"}), 
            "content": content 
    }

# def embed_text(text: str) -> list[float]:
#     embedder = get_embedder()
#     return embedder.embed_query(text)


def get_note(id: int, conn: Any = None) -> Note:
    if not conn:
        raise BadRequestError(message="no connection provided on pg")
    query = f"{SELECT_NOTES} WHERE n.id = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        rows = rows_to_models(cursor, Note)
        if not rows:
            raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")
        return rows[0]

def get_notes() -> ListResponse[Note]:
    query = f"{SELECT_NOTES} ORDER BY n.year DESC NULLS LAST, n.semester DESC NULLS LAST, n.updated_at DESC;"

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            rows = rows_to_models(cursor, Note)
            return ListResponse(items=rows, total=len(rows))

def create_note_pg(payload: NoteCreate, conn: Any = None) -> int:
    if not conn:
        raise BadRequestError(message="no connection provided on pg")

    query = f"""
        INSERT INTO notes ({columns_of(NoteCreate)}) 
        VALUES ({placeholders_of(NoteCreate)})
        RETURNING id;
    """

    with conn.cursor() as cursor:
        cursor.execute(query, _params(payload))
        result = cursor.fetchone()
        if not result:
            raise BadRequestError(message="ไม่สามารถบันทึกโน้ตได้")
        return result[0]

def delete_note_graph(id: int) -> int:
    """ลบ node โน้ต - ไม่เจอก็ถือว่าสำเร็จ

    idempotent เพราะ outbox อาจ replay งานเดิมซ้ำ และเพราะ postgres คือ
    ความจริง: "ไม่มี node" คือผลลัพธ์ที่ต้องการอยู่แล้ว
    """
    query = f"""
    MATCH (n:Note {{id: $id}})
    DETACH DELETE n
    RETURN count(n) AS removed;
    """
    with graph_db.get_session() as session:
        record = session.run(query, {"id": id}).single()
        return record["removed"] if record else 0

def merge_note_graph(payload: NoteCreate, id: int, embedding: list[float] | None = None) -> None:
    """upsert โน้ตหนึ่งใบ + ความสัมพันธ์กับสิ่งที่มันพูดถึง

    ตัวเดียวจบทั้ง create และ update เพราะ outbox ต้องการงานที่ replay ซ้ำได้:
    - MERGE node จึงไม่พังถ้ามีอยู่แล้ว (create ซ้ำ) และไม่พังถ้ายังไม่มี
      (update ที่ node หายไป - ของเดิมใช้ MATCH แล้วโยน NotFound)
    - SET อยู่นอก ON CREATE จึงเขียนทับค่าทุกครั้ง = สถานะสุดท้ายตรงกับ pg เสมอ
    - MERGE ความสัมพันธ์ ไม่สร้างเส้นซ้ำ
    """
    label = None
    ref_id = None
    if payload.type == NoteType.PERSON:
      ref_id = payload.employee_id
      label = "Employee"
    else:
      ref_id = payload.company_id
      label = "Company"

    if not label:
        raise BadRequestError(message="Unknown note type")
    if not ref_id:
        raise BadRequestError(message="ไม่พบ ref_id")

    query = f"""
    MATCH (ref:{label} {{id: $ref_id}})
    MERGE (n:Note {{id: $id}})
    ON CREATE SET n.createdAt = datetime()
    SET
      {graph_assignments_of(NoteCreate, prefix="n.")},
      n.updatedAt = datetime()
    MERGE (ref)-[:HAS_NOTE]->(n)
    RETURN n as note;
    """
    # n.search = $search,
    # n.embedding = $embedding,
    params = {
       **payload.model_dump(by_alias=False),
       "ref_id": ref_id,
       "id": id,
    #    "embedding": embedding,
    #    "search": thai_tokenizer(payload.content)
    }

    with graph_db.get_session() as session:
        result = session.run(query, params)
        if not result.single():
            raise NotFoundError(message="ไม่พบ node ที่ต้องการผูกโน้ต")


#: ชื่อเดิมสองตัว - ตอนนี้เป็นฟังก์ชันเดียวกัน
create_note_graph = merge_note_graph
        
def _payload(note: NoteCreate) -> dict:
    """สิ่งที่ outbox เก็บไว้ทำ MERGE ทีหลัง - JSON ล้วน"""
    return note.model_dump(mode="json", by_alias=False)


def sync_create_note(payload: NoteCreate):
    """เขียน pg + จองงานกราฟใน transaction เดียว แล้วค่อยยิงกราฟ

    ดูเหตุผลเต็มที่หัวไฟล์ services/outbox.py - ย่อ ๆ คือการย้อนกราฟด้วยมือ
    แบบเดิมช่วยอะไรไม่ได้เลยตอน process ถูกฆ่ากลางคัน
    """
    _validate(payload)
    # embedding = embed_text(payload.content)
    with pg_db.get_connection() as conn:
        id = create_note_pg(payload, conn=conn)
        outbox.enqueue(conn, outbox.NOTE, id, outbox.UPSERT, _payload(payload))
        conn.commit()

    outbox.flush(outbox.NOTE, id)
        
def update_note_graph(payload: NoteCreate, id: int, embedding: list[float] | None = None) -> None:
    """แก้เฉพาะ node ที่มีอยู่ - เหลือไว้ให้โค้ดเก่า

    ทางเดินปกติใช้ merge_note_graph ผ่าน outbox แทน: MATCH ที่ไม่เจอ node จะพัง
    ส่วน MERGE สร้างให้เอง ซึ่งคือสิ่งที่ replay ต้องการ
    """
    query = f"""
    MATCH (n:Note {{id: $id}})
    SET 
      {graph_assignments_of(NoteCreate, prefix="n.")}, 
      n.updatedAt = datetime()
    RETURN n as note;
    """  
    # n.search = $tokenize_text,
    # n.embedding = $embedding,
    # tokenize_text = thai_tokenizer(payload.content)
    params = {
        **payload.model_dump(by_alias=False), 
        "id": id,
        # "embedding": embedding,
        # "tokenize_text": tokenize_text
    }
    with graph_db.get_session() as session:
        result = session.run(query, params)
        if not result.single():
            raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")
    

def update_note_pg(id: int, payload: NoteCreate, conn: Any = None) -> None:
    if not conn:
        raise BadRequestError()
    query = f"""
        UPDATE notes 
        SET {assignments_of(NoteCreate)}, updated_at = now()
        WHERE id = %(id)s;
    """
    with conn.cursor() as cursor:
        cursor.execute(query, {**_params(payload), "id": id})
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")

def sync_update_note(id: int, payload: NoteCreate) :
    if not id:
        raise BadRequestError(message="ไม่พบโน้ตที่ต้องการแก้ไข")
    _validate(payload)
    # new_embedding = embed_text(payload.content)
    with pg_db.get_connection() as conn:
        old_note = get_note(id, conn=conn)
        if not old_note:
          raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")
        if old_note.type != payload.type:
          raise BadRequestError()

        update_note_pg(id, payload, conn=conn)
        outbox.enqueue(conn, outbox.NOTE, id, outbox.UPSERT, _payload(payload))
        conn.commit()

    outbox.flush(outbox.NOTE, id)


def delete_note_pg(id: int, conn: Any = None) -> None:
    if not id:
        raise BadRequestError(message="ไม่พบโน้ตที่ต้องการลบ")

    with conn.cursor() as cursor:
        cursor.execute("DELETE FROM notes WHERE id = %s;", (id,))
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")



def sync_delete_note(id: int):
    if not id:
        raise BadRequestError(message="ไม่พบโน้ตที่ต้องการลบ")

    with pg_db.get_connection() as conn:
        # อ่านก่อนลบ: ไม่มีแถวก็ 404 ตั้งแต่ตรงนี้ ไม่ต้องจองงานลบกราฟเปล่า ๆ
        get_note(id, conn=conn)
        delete_note_pg(id, conn=conn)
        outbox.enqueue(conn, outbox.NOTE, id, outbox.DELETE)
        conn.commit()

    outbox.flush(outbox.NOTE, id)
