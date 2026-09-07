from core.db import pg_db, graph_db
from core.exceptions import BadRequestError, NotFoundError
from schemas.base import ListResponse
from schemas.enums import NoteType
from schemas.note import Note, NoteCreate
from utils.mapping import rows_to_models, columns_of, placeholders_of, assignments_of, graph_assignments_of
from typing import Any

from core.ai import get_embedder
from utils.tokenizer import thai_tokenizer




PERSON_NOTE_TYPES = {NoteType.HR, NoteType.COORDINATOR, NoteType.INSTRUCTOR}
PERSON_LABELS = {
    NoteType.HR: "HR",
    NoteType.COORDINATOR: "Coordinator",
    NoteType.INSTRUCTOR: "Instructor",
}   

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
        n.academic_year,
        n.term,
        
        n.group_id,
        n.person_id::int AS person_id,
        n.id
    
    FROM notes n
    LEFT JOIN companies c ON c.group_id = n.group_id
    LEFT JOIN coordinators p ON p.id = n.person_id
"""


def _validate(payload: NoteCreate) -> None:
    if not payload.content or not payload.content.strip():
        raise BadRequestError(message="กรุณากรอกเนื้อหาโน้ต")

    if not payload.group_id:
        raise BadRequestError(message="กรุณาเลือกบริษัทของโน้ตนี้")

    if payload.type in PERSON_NOTE_TYPES and payload.person_id is None:
        raise BadRequestError(message="โน้ตประเภทนี้ต้องเลือกผู้ประสานงานด้วย")

    if payload.type not in PERSON_NOTE_TYPES and payload.person_id is not None:
        raise BadRequestError( message="โน้ตประเภทนี้ผูกกับบริษัท ไม่ต้องระบุผู้ประสานงาน")


def _params(payload: NoteCreate) -> dict:
    content = payload.content.strip()
    return { 
            **payload.model_dump(by_alias=False, exclude={"content"}), 
            "content": content 
    }

def embed_text(text: str) -> list[float]:
    embedder = get_embedder()
    return embedder.embed_query(text)


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
    query = f"{SELECT_NOTES} ORDER BY n.academic_year DESC NULLS LAST, n.term DESC NULLS LAST, n.updated_at DESC;"

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

def delete_note_graph(id: int) -> None:
    query = f"""
    MATCH (n:Note {{id: $id}})
    WITH n, n.id as id
    DETACH DELETE n
    return id;
    """
    with graph_db.get_session() as session:
        result = session.run( query, {"id": id})
        record = result.single()
        if not record:
            raise NotFoundError(message="ไม่พบโน้ตที่ต้องการลบ")

def create_note_graph(payload: NoteCreate, id: int, embedding: list[float]) -> None:
    print("graph ",payload)
    label = None
    ref_id = None
    match_label = "id"
    if payload.type in PERSON_NOTE_TYPES:
      ref_id = payload.person_id
      label = PERSON_LABELS.get(payload.type)
    else:
      ref_id = payload.group_id
      label = "Company"
      match_label = "groupId"
    
    if not label:
        raise BadRequestError(message="Unknown note type")
  
    query = f"""
    MATCH (ref:{label} {{{match_label}: $ref_id}})
    CREATE (n:Note {{id: $id}})
    SET 
      {graph_assignments_of(NoteCreate, prefix="n.", exclude={"id"})},
      n.search = $tokenize_text,
      n.embedding = $embedding,
      n.createdAt = datetime(),
      n.updatedAt = datetime()
    MERGE (ref)-[:HAS_NOTE]->(n)
    RETURN n as note;
    """  
    tokenize_text = thai_tokenizer(payload.content)
    params = {
       **payload.model_dump(by_alias=False),
       "ref_id": ref_id,
       "id": id,
       "embedding": embedding,
       "tokenize_text": tokenize_text
    }

    with graph_db.get_session() as session:
        result = session.run(query, params)
        if not result.single():
            raise NotFoundError(message="ไม่พบ node ที่ต้องการผูกโน้ต")
        
def sync_create_note(payload: NoteCreate):
    _validate(payload)
    embedding = embed_text(payload.content)
    with pg_db.get_connection() as conn:
        id = create_note_pg(payload, conn=conn)
        graph_created = False
        try:
            create_note_graph(payload, id=id, embedding=embedding)
            graph_created = True
            conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_created:
                delete_note_graph(id)
            raise e
        
def update_note_graph(payload: NoteCreate, id: int, embedding: list[float]) -> None:  
    query = f"""
    MATCH (n:Note {{id: $id}})
    SET 
      {graph_assignments_of(NoteCreate, prefix="n.")}, 
      n.search = $tokenize_text,
      n.embedding = $embedding,
      n.updatedAt = datetime()
    RETURN n as note;
    """  
    tokenize_text = thai_tokenizer(payload.content)
    params = {
        **payload.model_dump(by_alias=False), 
        "id": id,
        "embedding": embedding,
        "tokenize_text": tokenize_text
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
    new_embedding = embed_text(payload.content) 
    with pg_db.get_connection() as conn:
        old_note = get_note(id, conn=conn)
        if not old_note:
          raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")
        if old_note.type != payload.type:
          raise BadRequestError()
      
        update_note_pg(id, payload, conn=conn)
        graph_updated = False
        try:
            update_note_graph(payload, id=id, embedding=new_embedding)
            graph_updated = True
            conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_updated:
                
                update_note_graph(
                    NoteCreate(
                        content=old_note.content,
                        type=old_note.type,
                        sentiment=old_note.sentiment,
                        source=old_note.source,
                        academic_year=old_note.academic_year,
                        term=old_note.term,
                        person_id=old_note.person_id,
                        group_id=old_note.group_id,
                    ),
                    id=id,
                    embedding=embed_text(old_note.content)
                )
            raise e
    

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
        old_note = get_note(id, conn=conn)
        if not old_note:
          raise NotFoundError(message=f"ไม่พบโน้ต id = {id}")
      
        delete_note_pg(id, conn=conn)
        graph_deleted = False
        try:
            delete_note_graph(id)
            graph_deleted = True
            conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_deleted:
                create_note_graph(
                    NoteCreate(
                        content=old_note.content,
                        type=old_note.type,
                        sentiment=old_note.sentiment,
                        source=old_note.source,
                        academic_year=old_note.academic_year,
                        term=old_note.term,
                        person_id=old_note.person_id,
                        group_id=old_note.group_id,
                    ),
                    id=id,
                    embedding=embed_text(old_note.content)
                )
            raise e
        
