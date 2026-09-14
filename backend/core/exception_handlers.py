import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from core.exceptions import AppException

logger = logging.getLogger(__name__)


async def app_exception_handler(request: Request, exc: AppException):
    """Preserve application status codes, including the shared login budget.

    4xx = คนเรียกส่งอะไรมาไม่ถูก บรรทัดเดียวพอ
    5xx = ความผิดฝั่งเรา ต้องมี traceback เต็มรวมถึง __cause__ ที่ DatabaseError
    ห่อไว้ - ไม่งั้น log เหลือแค่ "เกิดข้อผิดพลาดไม่ทราบสาเหตุ" ซึ่งไม่บอกเลยว่า
    พังที่บรรทัดไหน แล้วต้องมานั่งเดาว่า connection ตัวไหนของใคร
    """
    is_ours = exc.status_code >= 500
    log = logger.error if is_ours else logger.warning
    log(
        "[%s] %s %s -> %s",
        type(exc).__name__, request.method, request.url.path, exc.message,
        exc_info=exc if is_ours else None,
    )
    headers = {"Retry-After": str(exc.retry_after)} if hasattr(exc, "retry_after") else None
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message}, headers=headers)
