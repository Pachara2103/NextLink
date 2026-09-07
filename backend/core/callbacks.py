from typing import Any, Optional
from uuid import UUID
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from core.db import pg_db

class TokenTrackerHandler(BaseCallbackHandler):
    def __init__(self,  log_type: str, step_name: str, group_id: str, user_id: int=0):
        super().__init__()
        self.log_type = log_type
        self.step_name = step_name 
        self.group_id = group_id  
        self.user_id = user_id
        self.usage_data = {}

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        
      try:
        llm_output = response.llm_output or {}
        token_usage = llm_output.get("token_usage", {})

        # กรณีใช้ Provider อย่าง OpenAI/Anthropic ผ่าน LangChain บางเวอร์ชัน ค่าอาจอยู่ที่ generations
        if not token_usage and response.generations:
            for gen_list in response.generations:
                for gen in gen_list:
                    message = getattr(gen, "message", None)
                    if message and hasattr(message, "usage_metadata"):
                        token_usage = message.usage_metadata
                        break

# OpenAI ->  prompt_tokens (input) + completion_tokens (output)
# Anthropic (Claude) / Google (Gemini):  input_tokens และ output_tokens
        input_tokens = (
            token_usage.get("prompt_tokens")
            or token_usage.get("input_tokens")
            or 0
        )
        output_tokens = (
            token_usage.get("completion_tokens")
            or token_usage.get("output_tokens")
            or 0
        )
        total_tokens = token_usage.get("total_tokens") or (
            input_tokens + output_tokens
        )

        self.usage_data = {
            "log_type": self.log_type,
            "step_name": self.step_name,
            "group_id": self.group_id,
            "user_id": self.user_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": total_tokens,
        }

        self._save_to_db(self.usage_data)

      except Exception as e:
        print(f"\n[Error] Failed to save token log: {e}\n")

    def _save_to_db(self, data: dict):
        sql = """
            INSERT INTO token_logs (
                log_type, 
                step_name, 
                group_id, 
                user_id, 
                input_tokens, 
                output_tokens, 
                total_tokens
            ) 
            VALUES (%s, %s, %s, %s, %s, %s, %s);
        """
        try:
            with pg_db.get_connection() as conn:
              with conn.cursor() as cursor:
                cursor.execute(sql, (
                    data["log_type"],
                    data["step_name"],
                    data["group_id"],
                    data["user_id"],
                    data["input_tokens"],
                    data["output_tokens"],
                    data["total_tokens"],
                ))
                conn.commit()
                print(f"\n[DB Saved] Type: {data['log_type']}, Step: {data['step_name']}, Total Tokens: {data['total_tokens']}\n")
                
        except Exception as e:
            print(f"\n[Error] Failed to save token log: {e}\n")