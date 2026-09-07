import logging
import os
import threading

from langchain_google_genai import ChatGoogleGenerativeAI
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings

# import นี้ทำให้ .env ถูกอ่านแน่นอน ไม่ว่าใครจะ import ไฟล์นี้ก่อนใคร
from core import config

logger = logging.getLogger(__name__)

_llm_instance = None
_embedder_instance = None

_llm_lock = threading.Lock()
_embedder_lock = threading.Lock()


def get_llm():
    """LLM ตัวเดียวของ process นี้ ครั้งแรกสร้าง ครั้งต่อไปคืนตัวเดิม"""
    global _llm_instance
    if _llm_instance is None:
        with _llm_lock:
            if _llm_instance is None:
                logger.info(
                    "loading LLM model %s... (pid=%s)", config.LLM_MODEL, os.getpid()
                )
                # ส่ง key เข้าไปตรง ๆ แทนที่จะให้ langchain ไปหยิบจาก env เอง
                # เพื่อให้ key ที่หายกลายเป็น error ที่บอกชื่อ key และไฟล์ .env
                _llm_instance = ChatGoogleGenerativeAI(
                    model=config.LLM_MODEL,
                    google_api_key=config.require("GOOGLE_API_KEY"),
                    # temperature=0,
                )
                logger.info("LLM model ready")
    return _llm_instance


def get_embedder():
    global _embedder_instance
    if _embedder_instance is None:
        with _embedder_lock:
            if _embedder_instance is None:
                logger.info(
                    "loading embedding model %s... (pid=%s)",
                    config.EMBEDDING_MODEL,
                    os.getpid(),
                )
                _embedder_instance = SentenceTransformerEmbeddings(
                    model=config.EMBEDDING_MODEL
                )
                logger.info("embedding model ready (%s)", config.EMBEDDING_MODEL)
    return _embedder_instance


def warmup() -> None:
    get_llm()
    get_embedder()
