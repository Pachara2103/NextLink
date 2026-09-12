
class AppException(Exception):
    status_code: int = 500
    message: str = "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง"

    def __init__(self, message: str | None = None, status_code: int | None = None):
        if message:
            self.message = message
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class BadRequestError(AppException):
    status_code = 400
    message = "ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"


class UnauthorizedError(AppException):
    status_code = 401
    message = "กรุณาเข้าสู่ระบบใหม่อีกครั้ง"


class NotFoundError(AppException):
    status_code = 404
    message = "ไม่พบข้อมูลที่ต้องการ"


class DatabaseError(AppException):
    status_code = 500
    message = "ฐานข้อมูลมีปัญหา กรุณาลองใหม่อีกครั้ง"





# --------------------------------------------------------------------------- #
# services/user.py
# --------------------------------------------------------------------------- #

class InvalidCredentialsError(UnauthorizedError):
    """Wrong username or wrong password.

    Deliberately one error for both: telling the caller which half was wrong
    hands an attacker a way to enumerate usernames.
    """

    message = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"


class PasswordHashError(AppException):
    """The stored hash is not something bcrypt can check. A data problem."""

    status_code = 500
    message = "ข้อมูลรหัสผ่านของผู้ใช้นี้เสียหาย กรุณาติดต่อผู้ดูแลระบบ"


class MissingTokenError(UnauthorizedError):
    message = "ไม่พบสิทธิ์การเข้าใช้งาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง"


class InvalidTokenError(UnauthorizedError):
    message = "เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง"


class TooManyAttemptsError(AppException):
    status_code = 429
    message = "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"

    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__()
