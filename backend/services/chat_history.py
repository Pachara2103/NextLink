from core.db import pg_db
from core.exceptions import DatabaseError
from schemas.chat_history import ChatHistory
from schemas.base import ListResponse
from schemas.enums import ChatRole
from utils.mapping import rows_to_models, columns_of

def save_chat_history(user_id: int, role: ChatRole, message: str) -> ChatHistory:
    query = f"""
        INSERT INTO chat_histories (user_id, role, message)
        VALUES (%s, %s, %s)
        RETURNING user_id, role, message, id, created_at;      
    """

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, (user_id, role, message))
            rows = rows_to_models(cursor, ChatHistory)
            if not rows:
                raise DatabaseError(message="บันทึกข้อความไม่สำเร็จ")
        conn.commit()
    return rows[0]


HISTORY_LIMIT = 20

def get_chat_histories(user_id: int) -> ListResponse[ChatHistory]:
    query = f"""
    SELECT * FROM (
        SELECT {columns_of(ChatHistory)}
        FROM chat_histories
        WHERE user_id = %s 
        ORDER BY created_at DESC
        LIMIT %s
    ) AS recent_chats
    ORDER BY created_at ASC
"""

    with pg_db.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, (user_id, HISTORY_LIMIT))
            rows = rows_to_models(cursor, ChatHistory)
    return ListResponse(items=rows, total=len(rows))