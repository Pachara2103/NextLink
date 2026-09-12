import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from core.exceptions import AppException

logger = logging.getLogger(__name__)


async def app_exception_handler(request: Request, exc: AppException):
    """Preserve application status codes, including the shared login budget."""
    logger.warning(
        "[%s] %s %s -> %s", type(exc).__name__, request.method, request.url.path, exc.message
    )
    headers = {"Retry-After": str(exc.retry_after)} if hasattr(exc, "retry_after") else None
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message}, headers=headers)
