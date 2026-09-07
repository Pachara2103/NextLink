from schemas.company import Company, CompanyName
from schemas.base import ListResponse
from typing import Any
from core.exceptions import DatabaseError, BadRequestError, NotFoundError
from core.db import graph_db, pg_db
from psycopg2.errors import ForeignKeyViolation, UniqueViolation
from utils.mapping import rows_to_models, columns_of


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
    query = f"select {columns_of(Company)} from companies where group_id is not null;"
    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query)
            items = rows_to_models(cursor, Company)            
            return ListResponse(items=items, total=len(items))
        
     
def create_company_pg(payload: CompanyName, group_id: str, is_linked: bool = False, conn: Any = None):
    if not payload.company_th and not payload.company_en:
        raise BadRequestError(message="ไม่ระบุชื่อบริษัทที่ต้องการอัปเดต")
    
    if not conn:
         raise BadRequestError()
    
    query = f"""
        INSERT INTO companies (group_id, company_th, company_en, aliases, is_linked)
        VALUES (%(group_id)s, %(company_th)s, %(company_en)s, %(aliases)s, %(is_linked)s)
        RETURNING id;
    """

    params = {
        "company_th": payload.company_th,
        "company_en": payload.company_en,
        "aliases": payload.aliases,
        "group_id": group_id,
        "is_linked": is_linked
    }
    
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            row = cursor.fetchone()
            if not row:
                raise BadRequestError(message="ไม่สามารถสร้างบริษัทได้")
            
            if is_linked:
                return row[0]

    except ForeignKeyViolation as e:
        raise BadRequestError( message=f"ไม่พบกลุ่ม LINE ในระบบ") from e

    except UniqueViolation as e:
        raise BadRequestError(message="กลุ่ม LINE นี้ถูกผูกบริษัทไปแล้ว") from e
        
    except BadRequestError:
        raise
     
     
        
def update_company_pg(payload: CompanyName, id: str, conn: Any = None):
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
            is_linked = true,
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
    

def update_company_graph(payload: CompanyName, group_id: str, id: int):
    if not id:
        raise BadRequestError(message="ไม่เจอกลุ่มไลน์ที่ต้องการอัปเดต") 
    
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
    with pg_db.get_connection() as conn:
        target = get_company(id, conn=conn)
        update_company_pg(payload, id=id, conn=conn)
        graph_updated = False
        try:
            update_company_graph(payload, group_id=target.group_id, id=id)
            graph_updated = True
            conn.commit()
        except Exception as e:
            conn.rollback()
            if graph_updated:
                update_company_graph(
                    CompanyName(
                        company_th=target.company_th,
                        company_en=target.company_en,
                        aliases=target.aliases
                    ),
                    group_id=target.group_id,
                    id=id
                )
            raise e
       
def sync_create_company(payload: CompanyName, group_id: str):
    with pg_db.get_connection() as conn:  
        id = create_company_pg(payload, group_id=group_id, is_linked=True, conn=conn)
        graph_created = False
        try:
            update_company_graph(payload, group_id=group_id, id=id)
            graph_created = True
            conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_created:
                delete_company_graph(id)
            raise e


def delete_company_pg(id: int, conn: Any = None):
    if not id or not conn:
        raise BadRequestError() 
    
    query = f"delete from companies where id = %s;"
    with conn.cursor() as cursor:
        cursor.execute(query, (id,))
        if cursor.rowcount == 0:
            raise NotFoundError(message=f"ไม่พบข้อมูลบริษัท id = {id}")

def delete_company_graph(id: int):
    if not id:
        raise BadRequestError() 

    query = """
    MATCH (c:Company {id: $id})
    WITH c, c.id AS removedId
    DETACH DELETE c
    RETURN removedId;
    """
    with graph_db.get_session() as session:
        result = session.run(query, {"id": id})
        if not result.single():
            raise NotFoundError(message=f"ไม่พบข้อมูลบริษัท id = {id}")
    
    
def sync_delete_company(id: int):
    if not id:
        raise BadRequestError() 
    with pg_db.get_connection() as conn:
        company = get_company(id, conn=conn)
        delete_company_pg(id=id, conn=conn)
        graph_deleted = False
        
        try:
           delete_company_graph(id=id)
           graph_deleted = True
           conn.commit()
        except Exception as e:
            conn.rollback() 
            if graph_deleted:
                update_company_graph(
                    CompanyName(
                    company_th=company.company_th,
                    company_en=company.company_en,
                    aliases=company.aliases,
                ), 
                    group_id=company.group_id, 
                    id=id
                )
            raise e