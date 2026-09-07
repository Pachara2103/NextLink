import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

load_dotenv(ENV_PATH)


def _get(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default


def _int(name: str, default: int) -> int:
    raw = _get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


GOOGLE_API_KEY = _get("GOOGLE_API_KEY")
LLM_MODEL = _get("LLM_MODEL", "gemini-3.5-flash-lite")
EMBEDDING_MODEL = _get("EMBEDDING_MODEL", "BAAI/bge-m3")

DATABASE_PUBLIC_URL = _get("DATABASE_PUBLIC_URL")

# maxconn ควรสัมพันธ์กับจำนวน thread ที่เข้า DB พร้อมกันได้ (FastAPI รัน
# handler ที่เป็น def ใน threadpool 40 threads โดย default)
PG_POOL_MIN = _int("PG_POOL_MIN", 1)
PG_POOL_MAX = _int("PG_POOL_MAX", 10)

NEO4J_URI = _get("NEO4J_URI")
NEO4J_USERNAME = _get("NEO4J_USERNAME")
NEO4J_PASSWORD = _get("NEO4J_PASSWORD")
NEO4J_DATABASE = _get("NEO4J_DATABASE")


AUTH_SECRET = _get("AUTH_SECRET")
# นานพอสำหรับหนึ่งวันทำงาน สั้นพอที่ token ที่หลุดออกไปจะหมดอายุ
TOKEN_TTL_SECONDS = _int("TOKEN_TTL_SECONDS", 12 * 60 * 60)


CORS_ORIGINS = [
    origin.strip()
    for origin in (_get("CORS_ORIGINS", "http://localhost:3000") or "").split(",")
    if origin.strip()
]

HOST = _get("HOST", "127.0.0.1")
PORT = _int("PORT", 8000)



_REQUIRED = (
    "GOOGLE_API_KEY",
    "DATABASE_PUBLIC_URL",
    "NEO4J_URI",
    "NEO4J_USERNAME",
    "NEO4J_PASSWORD",
    "AUTH_SECRET",
)


def missing_required() -> list[str]:
    """ชื่อ config ที่จำเป็นแต่ยังไม่ได้ตั้ง (list ว่าง = ครบ)"""
    return [name for name in _REQUIRED if not globals().get(name)]


def require(name: str) -> str:
    """คืนค่า config ที่ต้องมี ไม่มีก็โยนพร้อมบอกว่าต้องไปเติมที่ไหน"""
    value = globals().get(name)
    if not value:
        raise RuntimeError(f"ยังไม่ได้ตั้งค่า {name} ใน {ENV_PATH}")
    return value
