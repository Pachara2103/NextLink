
from datetime import datetime
from core.db import graph_db, pg_db
from schemas.coordinator import Coordinator, CoordinatorCreate
from schemas.base import ListResponse
from typing import Any
from core.exceptions import NotFoundError, DatabaseError, BadRequestError
from utils.mapping import rows_to_models, columns_of, placeholders_of, assignments_of

def get_coordinator(id: int) -> Coordinator:
    query = f"select {columns_of(Coordinator)} from coordinators where id = %s;"
    with pg_db.get_connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        rows = rows_to_models(cursor, Coordinator)
        if not rows:
          raise NotFoundError(f"ไม่พบข้อมูลผู้ประสานงาน id = {id}")
        return rows[0]

    
def get_coordinators() -> ListResponse[Coordinator]:
    query = f"select {columns_of(Coordinator)} from coordinators;"
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            rows = rows_to_models(cursor, Coordinator)
            return ListResponse(items=rows, total=len(rows))
    
    
def approve_pg(id: int, user_id: int=0, conn: Any = None) -> Coordinator:
    if not id:
        raise BadRequestError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการ")
    if not conn:
        raise BadRequestError()
    
    query = f"""
    UPDATE coordinators 
    SET user_id = %(user_id)s,
        status = %(status)s,
        updated_at = now()
    WHERE id = %(id)s
    RETURNING {columns_of(Coordinator)};
    """
    
    params = {
        "id": id,
        "user_id": user_id,
        "status": "approved"
    }
    with conn.cursor() as cursor:
        cursor.execute(query, params)
        result = rows_to_models(cursor, Coordinator)
        if not result:
            raise NotFoundError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการ")
        return result[0]
       
def create_coordinator_graph(payload: Coordinator):
    if not payload.id:
        raise BadRequestError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการ")
   
    query = """
    MATCH (c:Company {groupId: $props.groupId})
    MERGE (p:Coordinator {id: $props.id})
    ON CREATE SET 
        p = $props,
        p.createdAt = datetime(),
        p.updatedAt = datetime()
        
    MERGE (c)-[:HAS_COORDINATOR]->(p)
    RETURN p AS coordinator
    """

    params ={
      "props": payload.model_dump(exclude={"created_at", "updated_at"})
    }
        
    with graph_db.get_session() as session:
        result = session.run( query, params)
        record = result.single()
        if not record:
            raise NotFoundError(message="ไม่พบข้อมูลบริษัทที่ต้องการอัปเดต")

def delete_coordinator_graph(id: int):
    if not id:
        raise BadRequestError()
    query = """
    match (p:Coordinator)
    where p.id = $id
    detach delete p
    return p;
    """
    with graph_db.get_session() as session:
        result = session.run( query, {"id": id})
        record = result.single()
        if not record:
            raise NotFoundError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการลบ")

        
def sync_approve_and_create(id: int, user_id: int):
    if not id or not user_id:
        raise BadRequestError()
    
    with pg_db.get_connection() as conn:
        coordinator = approve_pg(id, user_id, conn=conn)
        graph_created = False
        try:
            create_coordinator_graph(coordinator)
            graph_created = True
            conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_created:
                delete_coordinator_graph(coordinator.id)
            raise e
        
def decline(id: int):
    if not id:
        raise BadRequestError()
    
    query ="""
    Delete from coordinators
    where id = %(id)s
    """

    with pg_db.get_connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute( query, {"id": id})
        if cursor.rowcount == 0:
            raise NotFoundError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการลบ")
        conn.commit()

def create_pending_coordinator(payload: CoordinatorCreate, group_id: str, user_id: int=0, conn: Any = None):
    if not group_id:
        raise BadRequestError(message="ไม่พบข้อมูลกลุ่มไลน์ที่ต้องการ")
    if not conn:
        raise BadRequestError(message="ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้")
    
    query = f"""
        INSERT INTO coordinators ({columns_of(CoordinatorCreate)}, group_id, user_id, status)
        VALUES ({placeholders_of(CoordinatorCreate)}, %(group_id)s, %(user_id)s, %(status)s);
    """
        
    params = {
        "group_id": group_id,
        **payload.model_dump(by_alias=False),
        "status" : "pending",
        "user_id" : user_id
    }
    
    with conn.cursor() as cursor:
        cursor.execute(query, params)    
        if cursor.rowcount == 0:
            raise BadRequestError(message="ไม่สามารถสร้างข้อมูลผู้ประสานงานได้")    

    
def update_coordinator_pg(payload: CoordinatorCreate, id: int, user_id: int):
    if not id or not user_id:
        raise BadRequestError()
    
    query = f"""
    UPDATE coordinators 
    SET  {assignments_of(CoordinatorCreate)}, user_id = %(user_id)s, updated_at = now()
    WHERE id = %(id)s;
    """

    params = {
        **payload.model_dump(by_alias=False),
        "user_id": user_id,
        "id": id
    }
    
    with pg_db.get_connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute( query, params)
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบข้อมูลผู้ประสานงาน id = {id}")
        conn.commit()

# def update_coordinator_graph(payload: Coordinator):
#     if not payload.id:
#         raise BadRequestError(message="ไม่พบข้อมูลผู้ประสานงานที่ต้องการ")
    
#     params = {
#         "id": payload.id,
#         # "group_id": payload.group_id,
#         "name_th": payload.name_th,
#         "name_en": payload.name_en,
#         "nickname": payload.nickname,
#         "job_title": payload.job_title,
#         "phone": payload.phone,
#         "email": payload.email,
#         "relevant": payload.relevant,
#         # "status": payload.status,
#         # "user_id": user_id,
#         # "updated_at": datetime.now().isoformat()
#     }
    
#     try:
        
#         with graph_db.get_session() as session:
#             result = session.run(
#                 UPDATE_COORDINATOR_GRAPH, 
#                 params
#             )
#             record = result.single()
#             if not record:
#                 raise NotFoundError(message="ไม่พบข้อมูลบริษัทที่ต้องการอัปเดต")
            
#     except NotFoundError:
#         raise
#     except BadRequestError:
#         raise
#     except Exception as e:
#         raise DatabaseError() from e
    
    
    
# def sync_update_coordinator(payload: Coordinator, user_id: int):
#     with pg_db.get_connection() as conn:
#         try:
#             update_coordinator_pg(payload, user_id, conn=conn)
#             approve_graph(payload)
#             conn.commit()
            
#         except Exception as e:
#             conn.rollback()
#             raise e
