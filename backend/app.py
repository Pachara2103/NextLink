import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ai.graph import get_graph
from api.v1.router import api_router
from core import config
from core.ai import warmup
from core.db import graph_db, pg_db
from core.exceptions import AppException

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


MODELS_READY = False


@asynccontextmanager
async def lifespan(app: FastAPI):
  
    global MODELS_READY

    missing = config.missing_required()
    if missing:
        logger.warning(
            "config ที่จำเป็นยังไม่ได้ตั้ง: %s (เติมใน %s)",
            ", ".join(missing),
            config.ENV_PATH,
        )

    try:
        await asyncio.to_thread(warmup)
        await asyncio.to_thread(get_graph)
        MODELS_READY = True
        logger.info("models ready - accepting requests")
    except Exception:
        logger.exception(
            "model warmup failed - starting anyway; the first request that needs "
            "a model will retry the load"
        )

    for name, db in (("postgres", pg_db), ("neo4j", graph_db)):
        try:
            await asyncio.to_thread(db.check)
            logger.info("%s reachable", name)
        except Exception:
            logger.exception("%s is not reachable at startup", name)

    yield

    for name, db in (("postgres", pg_db), ("neo4j", graph_db)):
        try:
            db.close()
        except Exception:
            logger.exception("failed to close %s", name)


app = FastAPI(
    title="NextLink AI API",
    version="1.0.0",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Every deliberate failure, with the status the service layer chose.

    `exc.message` is written for the person using the console, so it is safe to
    show as-is — that is what the frontend puts in its toast.
    """
    logger.warning(
        "[%s] %s %s -> %s", type(exc).__name__, request.method, request.url.path, exc.message
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(Exception)
async def global_unknown_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้งภายหลัง"},
    )


@app.get("/api/v1/health", tags=["health"])
def health_api():
    return {"status": "ok", "models": MODELS_READY}

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run(app, host=config.HOST, port=config.PORT)
