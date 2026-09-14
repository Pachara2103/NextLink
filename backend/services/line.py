import logging
from collections import defaultdict
from ai.chains.contact import get_extract_contact_chain

from core.db import nl_db, line_db
from core.exceptions import DatabaseError, NotFoundError, BadRequestError
from core.callbacks import TokenTrackerHandler

from schemas.line import GroupInfo, LineGroup, UpdateLog
from schemas.company import CompanyName, Company
from schemas.employee import EmployeeBase
from schemas.enums import ContactStatus
from schemas.base import ListResponse


from services.company import create_company_pg
from services.employee import create_employee_pg

from typing import Any
from utils.mapping import columns_of, rows_to_models


from datetime import datetime

logger = logging.getLogger(__name__)


def get_groups_messages(group_reads: dict[str, datetime | None], conn: Any = None) :
    if not conn:
        raise BadRequestError("Database connection is required")
    
    if not group_reads:
        return {}

    group_messages = defaultdict(lambda: {"messages": [], "last_read_at": None})
    group_ids = list(group_reads.keys())
    last_reads = [group_reads[gid] for gid in group_ids]

    query = """
        WITH target_groups (group_id, last_read_at) AS (
            SELECT * FROM UNNEST(%(group_ids)s::text[], %(last_reads)s::timestamptz[])
        )
        SELECT m.group_id, m.text_content, m.created_at
        FROM line_messages m
        JOIN target_groups tg ON m.group_id = tg.group_id
        WHERE m.message_type = 'text'
          AND m.text_content IS NOT NULL
          AND (tg.last_read_at IS NULL OR m.created_at > tg.last_read_at)
        ORDER BY m.group_id, m.created_at ASC;
    """

    with conn.cursor() as cursor:
        cursor.execute(query, {
            "group_ids": group_ids,
            "last_reads": last_reads
        })
        rows = cursor.fetchall()
        
        for g_id, text_content, created_at in rows:
            group_messages[g_id]["messages"].append(text_content)
            group_messages[g_id]["last_read_at"] = created_at

    return dict(group_messages)

def get_groups_last_read(group_ids: list[str], conn: Any = None) -> dict[str, datetime | None]:
    if not conn:
        raise BadRequestError("Database connection is required")
    
    if not group_ids:
        return {}

    insert_missing = """
        INSERT INTO line_group_reads (group_id)
        SELECT unnest(%(group_ids)s::text[])
        ON CONFLICT (group_id) DO NOTHING;
    """

    select_reads = """
        SELECT group_id, last_read_at
        FROM line_group_reads
        WHERE group_id = ANY(%(group_ids)s);
    """

    with conn.cursor() as cursor:
        cursor.execute(insert_missing, {"group_ids": group_ids})
        cursor.execute(select_reads, {"group_ids": group_ids})
        rows = cursor.fetchall()

    return {group_id: last_read_at for group_id, last_read_at in rows}
        
def _read_group_messages(group_id: str = None, last_read_at: datetime = None, conn: Any = None):
    if not group_id or not last_read_at:
        raise BadRequestError(message="no group_id or last_read_at provided")
    if not conn:
        raise BadRequestError(message="no connection provided on pg")
    
    query = """
      UPDATE line_group_reads 
      SET last_read_at = %(last_read_at)s
      WHERE group_id = %(group_id)s;
    """
    with conn.cursor() as cursor:
        cursor.execute(query, {"group_id": group_id, "last_read_at": last_read_at})
            
            
def get_line_groups() -> ListResponse[LineGroup]:
    """แถวของ line_groups ล้วน ๆ จาก line_db

    companies อยู่ใน nl_db คนละ connection กัน JOIN ตรงนี้ไม่ได้ - ฝั่ง console
    เอาผลนี้ไป merge กับ GET /companies ด้วย group_id เอง
    """
    query = f"""SELECT {columns_of(LineGroup)} FROM line_groups;"""
    with line_db.get_connection() as lconn:
      with lconn.cursor() as cursor:
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
    with nl_db.get_connection() as conn:
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


def update_information(user_id: int, group_data: dict[str, GroupInfo]) ->  ListResponse[str]:
    """สรุปข้อความที่ยังไม่ได้อ่านของแต่ละกลุ่ม แล้วเขียนคนที่เจอลง postgres

    group_data มาจาก console: key = group_id, value = GroupInfo (กลุ่มไลน์ที่
    merge กับบริษัทแล้ว) จอถือข้อมูลชุดนี้อยู่แล้วตั้งแต่ GET /line/groups +
    GET /companies จึงส่งกลับมาแทนที่จะให้ที่นี่ query ซ้ำ

    เขียนเฉพาะ postgres เท่านั้น (create_company_pg / create_employee_pg) ไม่
    แตะกราฟ - แถวที่ได้จากรอบนี้ยังเป็น pending รอคนยืนยัน จะ sync ขึ้นกราฟ
    ตอนที่มีคนกดยืนยันผ่าน sync_* ตามทางเดินปกติ
    """
    if not user_id:
        raise BadRequestError()

    if not group_data:
        return ListResponse(items=[], total=0)
    print(group_data['C46f16841ad21ef734794f7390ab91dd3'])
    # return ListResponse(items=[], total=0)

    error_groups = []
    group_ids = list(group_data.keys())
    
    with nl_db.get_connection() as conn:
      group_reads = get_groups_last_read(group_ids=group_ids, conn=conn)
      conn.commit()

    with line_db.get_connection() as lconn:
      group_messages = get_groups_messages(group_reads=group_reads, conn=lconn)

    logger.info(
        "update_information: กลุ่มที่ส่งมา %d, เครื่องหมายอ่านแล้ว %d, กลุ่มที่มีข้อความใหม่ %d",
        len(group_data), len(group_reads), len(group_messages),
    )
    with nl_db.get_connection() as conn:
        for group_id, msg_data in group_messages.items():
          group_info = group_data.get(group_id)
          last_read_at = msg_data.get("last_read_at")
          messages = msg_data.get("messages", [])
          if not group_info or not last_read_at or not messages:
            continue

          group_name = group_info.display_name or "<ไม่มีชื่อกลุ่ม>"
          company_id = group_info.company_id
          try: 
            summary = summarize_line_group_messages(
                "\n".join(group_messages[group_id]["messages"]), 
                group_id=group_id, 
                user_id=user_id
            )
            contacts = summary.get("contacts")
            
            if not contacts:
                _read_group_messages(group_id=group_id, last_read_at=group_messages[group_id]["last_read_at"], conn=conn)
                continue
            
            print(f"\nSummary group {group_name}\n")

            for i in contacts:
                for key in i:
                    print(f"{key}: {i.get(key) or '<ไม่มีข้อมูล>'}")

           
            if not group_info.is_linked:
                company_id = create_company_pg(
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
            
            if company_id is None:
                raise NotFoundError( message=f"ไม่พบบริษัทของกลุ่ม {group_name} ในฐานข้อมูล")

            for contact in contacts:
                _ = create_employee_pg(
                    EmployeeBase(
                        **contact,
                        status=ContactStatus.PENDING,
                        company_id=company_id,
                    ),
                    user_id=user_id,
                    conn=conn,
                )

            _read_group_messages(group_id=group_id, last_read_at=group_messages[group_id]["last_read_at"], conn=conn)
            conn.commit()
            print(f"Ectract Information for group: {group_name} successfully\n")

          except Exception as e:
            conn.rollback()
            group_row = group_data.get(group_id)
            error_group_name = (
                group_row.display_name if group_row else None
            ) or "<ไม่มีชื่อกลุ่ม>"
            
            print(f"Error occured for group: {error_group_name}, message: {e}\n")
            print(f"Roll back successfully\n")
            if error_group_name not in error_groups:
               error_groups.append(error_group_name)
    try:
        with nl_db.get_connection() as conn:
          create_update_logs(user_id=user_id, error_groups=error_groups, conn=conn)
          conn.commit()
    except Exception as e:   
        print(f"Failed to create update logs: {e}")
    
    return  ListResponse(items=error_groups, total=len(error_groups))