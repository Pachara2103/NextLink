import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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
from services import outbox

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


MODELS_READY = False
#: True เมื่อ lifespan ทำงานจบ - ก่อนหน้านั้นทุก request ที่ไม่ใช่ /health ได้ 503
APP_READY = False

#: เปลี่ยนทุกครั้งที่ process เกิดใหม่ (uvicorn --reload = เกิดใหม่ทุกครั้งที่ save)
#:
#: frontend จำค่านี้ไว้ พอเห็นค่าใหม่ = "เซิร์ฟเวอร์ที่คุยอยู่ไม่ใช่ตัวเดิมแล้ว"
#: จึงล้างข้อมูลที่ถืออยู่แล้วอ่านใหม่ทั้งหมด แทนที่จะเชื่อ state ที่อาจ
#: ค้างมาจากคำสั่งที่ถูกตัดกลางคัน - นี่คือของที่ควร invalidate ตอน restart
#: ไม่ใช่ session ของผู้ใช้
BOOT_ID = uuid.uuid4().hex
STARTED_AT = datetime.now(timezone.utc).isoformat()

#: path ที่ตอบได้เสมอแม้ยังไม่พร้อม - ไม่งั้น client ไม่มีทางรู้ว่าต้องรออีกนานแค่ไหน
_ALWAYS_OPEN = ("/api/v1/health", "/docs", "/redoc", "/openapi.json")


async def _replay_outbox_forever():
    """ตามเก็บงานเขียนกราฟที่ค้างอยู่ เป็นระยะ ตลอดอายุของ process

    งานส่วนใหญ่ถูกยิงทันทีหลัง commit อยู่แล้ว (services/outbox.py::flush)
    ตัวนี้มีไว้สำหรับงานที่ flush ไม่สำเร็จ และงานที่ commit ไปแล้วแต่ process
    ถูกฆ่าก่อนได้ยิง - ซึ่งคือเคสที่ทำให้ pg กับ neo4j ไม่ตรงกันแบบเดิม
    """
    while True:
        try:
            await asyncio.sleep(config.OUTBOX_INTERVAL_SECONDS)
            result = await asyncio.to_thread(outbox.replay_pending)
            if result["applied"] or result["failed"]:
                logger.info(
                    "outbox replay: สำเร็จ %s งาน, ยังค้าง %s งาน",
                    result["applied"], result["failed"],
                )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("outbox replay รอบนี้ล้ม - จะลองใหม่รอบหน้า")


@asynccontextmanager
async def lifespan(app: FastAPI):

    global MODELS_READY, APP_READY

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

    # ก่อนเปิดรับ request: เก็บงานกราฟที่ค้างจาก process ก่อนหน้าให้หมดก่อน
    # ถ้า process ที่แล้วถูกฆ่ากลางคำสั่ง งานที่ค้างอยู่คือความไม่ตรงกันที่
    # ยังไม่ถูกซ่อม - ซ่อมตอนนี้ ก่อนที่ใครจะอ่านข้อมูลผิด ๆ ไป
    try:
        result = await asyncio.to_thread(outbox.replay_pending)
        if result["applied"] or result["failed"]:
            logger.info(
                "outbox ตอน start: สำเร็จ %s งาน, ยังค้าง %s งาน",
                result["applied"], result["failed"],
            )
    except Exception:
        logger.exception("replay outbox ตอน start ไม่สำเร็จ")

    replay_task = asyncio.create_task(_replay_outbox_forever())
    APP_READY = True
    logger.info("app ready - boot id %s", BOOT_ID)

    yield

    APP_READY = False
    replay_task.cancel()
    try:
        await replay_task
    except asyncio.CancelledError:
        pass

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


@app.middleware("http")
async def readiness_gate(request: Request, call_next):
    """ยังไม่พร้อม = ตอบ 503 ทันที ไม่ใช่ปล่อยให้ค้าง

    ตอน uvicorn --reload สร้าง worker ใหม่ การโหลดโมเดลกินเวลาหลายวินาที
    request ที่ยิงเข้ามาช่วงนั้นเคยไปค้างรอ (หรือเจอ connection refused แล้ว
    เบราว์เซอร์รอจน timeout เอง) จนคนกดปุ่มเห็นแค่วงกลมหมุนเป็นนาที
    503 + Retry-After บอกได้ตรง ๆ ว่า "ยังไม่พร้อม อีกเดี๋ยวค่อยมา" และ
    frontend เอาไปขึ้นแบนเนอร์กับตั้งเวลาลองใหม่ได้
    """
    if not APP_READY and not request.url.path.startswith(_ALWAYS_OPEN):
        return JSONResponse(
            status_code=503,
            content={"detail": "เซิร์ฟเวอร์กำลังเริ่มระบบ กรุณารอสักครู่แล้วลองใหม่"},
            headers={"Retry-After": "2"},
        )
    return await call_next(request)


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
    """ตัวเดียวที่ตอบได้เสมอ และตั้งใจให้ถูกยิงถี่ ๆ ตอนเซิร์ฟเวอร์ล่ม

    ไม่แตะฐานข้อมูลเลย: frontend poll ทุก 2 วินาทีตอนเชื่อมต่อไม่ได้ ถ้าตัวนี้
    ต้องคุยกับ pg ทุกครั้ง มันจะกลายเป็นภาระตอนที่ระบบกำลังแย่อยู่แล้ว
    จำนวนงานกราฟที่ค้างดูได้ที่ /api/v1/admin/graph/outbox แทน
    """
    return {
        "status": "ok",
        "models": MODELS_READY,
        "ready": APP_READY,
        "bootId": BOOT_ID,
        "startedAt": STARTED_AT,
    }

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run(app, host=config.HOST, port=config.PORT)
