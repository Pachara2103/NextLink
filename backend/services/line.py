from collections import defaultdict
from ai.chains.contact import get_extract_contact_chain

from core.db import pg_db
from core.exceptions import DatabaseError, NotFoundError, BadRequestError
from core.callbacks import TokenTrackerHandler

from schemas.line import LineGroup, UpdateLog
from schemas.company import CompanyName
from schemas.coordinator import CoordinatorCreate
from schemas.base import ListResponse

from services.company import create_company_pg
from services.coordinator import create_pending_coordinator

from typing import Any
from utils.mapping import columns_of, rows_to_models


def get_group_messages(conn: Any = None):
    if not conn:
        raise BadRequestError()
    
    group_messages = defaultdict(list)

    query = """
      SELECT group_id, message_type, text_content, created_at, is_read
      FROM line_messages 
      WHERE group_id IS NOT NULL and is_read = false
      ORDER BY group_id, created_at ASC
      FOR UPDATE SKIP LOCKED;
    """

    with conn.cursor() as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()

    for row in rows:
        group_id, message_type, text_content, _ , _ = row

        if message_type and message_type.strip() == "text" and text_content:
            group_messages[group_id].append(text_content)

    return group_messages


def update_read_group_messages(group_id: str = None, conn: Any = None):
    if not group_id:
        raise BadRequestError(message="group_id is required")
    if not conn:
        raise BadRequestError()
    
    query = """
      UPDATE line_messages 
      SET is_read = true 
      WHERE group_id = %(group_id)s AND is_read = false;
    """

    with conn.cursor() as cursor:
        cursor.execute(query, {"group_id": group_id})
            

def get_line_groups() -> ListResponse[LineGroup]:
    query = """
    SELECT 
      c.company_th,
      c.company_en,
      COALESCE(c.aliases, '{}'::text[]) AS aliases,
      lg.created_at,
      lg.updated_at,
      lg.group_id,
      lg.display_name,
      COALESCE(c.is_linked, false) AS is_linked,
      c.id AS company_id,
      lg.picture_url
    FROM line_groups lg
    LEFT JOIN companies c ON lg.group_id = c.group_id;
    """
    with pg_db.get_connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute(query)
        rows = rows_to_models(cursor, LineGroup)
        return ListResponse(items=rows, total=len(rows))


def summarize_line_group_messages(chat_history: str, group_id: str, user_id: int) -> dict:
    tracker = TokenTrackerHandler(
        log_type="line_group",
        step_name="summarize_line_group_messages", 
        group_id=group_id, 
        user_id=user_id
    )
    try:
      result = get_extract_contact_chain().invoke({"chat_history": chat_history}, config={"callbacks": [tracker]})
      return result.model_dump(by_alias=False)

    except Exception as e:
        raise e

def get_update_logs() -> ListResponse[UpdateLog]:
    query = """
    SELECT
      l.id,
      l.user_id,
      u.display_name,
      COALESCE(l.error_groups, '{}'::text[]) AS error_groups,
      l.created_at
    FROM update_logs l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.created_at DESC, l.id DESC;
    """
    with pg_db.get_connection() as conn:
      with conn.cursor() as cursor:
        cursor.execute(query)
        rows = rows_to_models(cursor, UpdateLog)
        return ListResponse(items=rows, total=len(rows))
        
def create_update_logs(user_id: int, error_groups: list[str], conn: Any = None):
    if not conn or not user_id:
        raise BadRequestError()
    
    query = """
    INSERT INTO update_logs (user_id, error_groups)
    VALUES (%(user_id)s, %(error_groups)s);
    """
    with conn.cursor() as cursor:
       cursor.execute(query, {"user_id": user_id, "error_groups": error_groups})
       if cursor.rowcount == 0:
           raise BadRequestError(message="ไม่สามารถสร้างเพิ่มประวัติการอัปเดตข้อมูลได้")


def update_information(user_id: int = 0) ->  ListResponse[str]:
    line_groups = get_line_groups()

    if not line_groups.items:
        raise NotFoundError(message="ไม่พบข้อมูลกลุ่ม Line")

    line_groups_map = {group.group_id: group for group in line_groups.items}
    error_groups = []
    
    with pg_db.get_connection() as conn:
        group_messages = get_group_messages(conn)
        if not group_messages:
            return ListResponse(items=[], total=0)
          
        for group_id, messages in group_messages.items():
          try: 
            group_info = line_groups_map.get(group_id)
            if not group_info or not messages:
               continue

            group_name = group_info.display_name or "<ไม่มีชื่อกลุ่ม>"
            
            summary = summarize_line_group_messages(
                "\n".join(messages), 
                group_id=group_id, 
                user_id=user_id
            )
            contacts = summary.get("contacts")
            
            if not contacts:
                update_read_group_messages(group_id=group_id, conn=conn)
                continue
            
            print(f"\nSummary group {group_name}\n")
            
            for i in contacts:  
                for key  in i:
                    print(f"{key}: {i.get(key, "<ไม่มีข้อมูล>")}")
            
            if not group_info.is_linked:
                create_company_pg(
                    CompanyName(
                        company_th=summary.get("company_th"),
                        company_en=summary.get("company_en"),
                        aliases=summary.get("aliases"),
                    ),
                    group_id=group_id, 
                    is_linked=False, 
                    conn=conn,
                )
                print("Create new unlinked company successfully\n")
            
            for contact in contacts:
                create_pending_coordinator(
                    CoordinatorCreate(**contact),
                    group_id=group_id,
                    user_id=user_id,
                    conn=conn,
                )
                
            update_read_group_messages(group_id=group_id, conn=conn)
            conn.commit()
            print(f"Ectract Information for group: {group_name} successfully\n")

          except Exception as e:
            conn.rollback()
            group_row = line_groups_map.get(group_id)
            error_group_name = (
                group_row.display_name if group_row else None
            ) or "<ไม่มีชื่อกลุ่ม>"
            
            print(f"Error occured for group: {error_group_name}, message: {e}\n")
            print(f"Roll back successfully\n")
            if error_group_name not in error_groups:
               error_groups.append(error_group_name)
               continue
    try:
        with pg_db.get_connection() as conn:
          create_update_logs(user_id=user_id, error_groups=error_groups, conn=conn)
          conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    return  ListResponse(items=error_groups, total=len(error_groups))