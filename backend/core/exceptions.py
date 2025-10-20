from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import uuid

class APIException(Exception):
    """自定义API异常"""
    def __init__(self, status_code: int, error_code: str, message: str, details: dict = None):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or {}

async def api_exception_handler(request: Request, exc: APIException):
    """处理自定义API异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """处理请求验证异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 提取第一个错误信息
    errors = exc.errors()
    error_detail = errors[0] if errors else {}

    field = None
    if "loc" in error_detail and len(error_detail["loc"]) > 0:
        field = str(error_detail["loc"][-1])

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_FAILED",
                "message": str(error_detail.get("msg", "Validation failed")),
                "details": {"field": field} if field else {}
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """处理HTTP异常"""
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 如果已经是标准格式，直接返回
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={**exc.detail, "requestId": request_id},
            headers={"X-Request-ID": request_id}
        )

    # 否则包装成标准格式
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail)
            },
            "requestId": request_id
        },
        headers={"X-Request-ID": request_id}
    )