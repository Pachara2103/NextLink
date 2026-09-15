"""ตรวจว่าทำไม POST /api/v1/auth/login ถึงตอบ 500 — อ่านอย่างเดียว ไม่แก้ข้อมูลใด ๆ

รันจากโฟลเดอร์ backend (ใน venv เดียวกับที่รัน uvicorn):

    .venv\\Scripts\\python check_login.py            # ตรวจ config + การต่อ DB + ตาราง
    .venv\\Scripts\\python check_login.py myusername # ตรวจบัญชีนั้นและโควตาการล็อกอินด้วย

ทำสามอย่างตามลำดับที่ services/user.py::login ทำจริง คือ
1) ต่อ Postgres ได้ไหม  2) ตารางที่ login ต้องใช้มีครบไหม  3) บัญชีนั้นโดน
rate limit อยู่หรือเปล่า — ข้อไหนพังจะเป็นข้อเดียวกับที่ทำให้ขึ้น 500

หมายเหตุ: ผลลัพธ์มีชื่อโฮสต์ของฐานข้อมูล (ไม่มีรหัสผ่าน) อย่าโพสต์สาธารณะ
ไฟล์นี้เป็นเครื่องมือชั่วคราว ลบทิ้งได้เมื่อไม่ใช้แล้ว
"""

import hashlib
import sys
from urllib.parse import urlsplit

OK = "  ok   "
BAD = " ผิด   "
WARN = " เตือน "


def main() -> int:
    username = sys.argv[1] if len(sys.argv) > 1 else None
    problems: list[str] = []

    try:
        from core import config
    except ModuleNotFoundError as error:
        print(f"{BAD} import core.config ไม่ได้ ({error}) — ต้องรันจากโฟลเดอร์ backend")
        return 2

    print(f"อ่าน .env จาก {config.ENV_PATH}")
    missing = config.missing_required()
    if missing:
        problems.append("config ที่จำเป็นยังว่าง: " + ", ".join(missing))
        print(f"{BAD} config ที่จำเป็นยังว่างอยู่: {', '.join(missing)}")
    else:
        print(f"{OK} config ที่จำเป็นตั้งครบ")

    dsn = config.DATABASE_PUBLIC_URL
    if not dsn:
        print(f"{BAD} ไม่มี DATABASE_PUBLIC_URL — login จะพังทุกครั้ง")
        return 1
    parts = urlsplit(dsn)
    print(f"       ฐานข้อมูล: host={parts.hostname} port={parts.port} db={(parts.path or '/').lstrip('/')}")

    import psycopg2

    try:
        # ต่อตรง ไม่ผ่าน pool ของแอป เพื่อแยกให้ออกว่า "ต่อไม่ได้" หรือ
        # "ต่อได้แต่ connection ใน pool ของ process ที่รันอยู่ตายไปแล้ว"
        conn = psycopg2.connect(dsn, connect_timeout=5)
    except Exception as error:
        print(f"{BAD} ต่อ Postgres ไม่ได้: {type(error).__name__}: {str(error).strip()}")
        print("       → นี่คือสาเหตุของ 500 ฐานข้อมูลไม่รับการเชื่อมต่อ (ดับ/หลับ/รหัสเปลี่ยน/เน็ตกั้น)")
        return 1

    with conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT current_database(), version();")
            database, version = cursor.fetchone()
            print(f"{OK} ต่อ Postgres ได้ (db={database}, {version.split(',')[0]})")

            needed = ("users", "auth_sessions", "auth_login_buckets")
            cursor.execute(
                "SELECT " + ", ".join(f"to_regclass('public.{name}')" for name in needed) + ";"
            )
            found = cursor.fetchone()
            absent = [name for name, table in zip(needed, found) if table is None]
            for name, table in zip(needed, found):
                print(f"{OK if table else BAD} ตาราง {name}: {'มี' if table else 'ไม่มี'}")
            if absent:
                print(f"       → login ใช้ทั้งสามตาราง ตารางที่หายคือสาเหตุของ 500")
                if {"auth_sessions", "auth_login_buckets"} & set(absent):
                    print("       → สองตารางนี้อยู่ใน migrations/security.sql เท่านั้น (init.sql ไม่มี)")
                    print("         รัน: psql <DATABASE_PUBLIC_URL> -f migrations/security.sql")
                return 1

            cursor.execute("SELECT count(*) FROM users;")
            print(f"{OK} มีผู้ใช้ในตาราง users {cursor.fetchone()[0]} คน")

            if username:
                cursor.execute("SELECT id, password FROM users WHERE username = %s;", (username,))
                row = cursor.fetchone()
                if not row:
                    print(f"{WARN} ไม่มีผู้ใช้ชื่อ {username} — กรณีนี้ระบบตอบ 401 ไม่ใช่ 500")
                else:
                    stored = row[1] or ""
                    usable = stored.startswith(("$2a$", "$2b$", "$2y$")) and len(stored) == 60
                    if not usable:
                        problems.append(f"รหัสผ่านของ {username} ในฐานข้อมูลไม่ใช่ bcrypt hash")
                    print(f"{OK if usable else BAD} รหัสผ่านของ {username} "
                          + ("เป็น bcrypt hash ปกติ" if usable else
                             f"ไม่ใช่ bcrypt hash (ยาว {len(stored)}) → ตอบ 500 ทุกครั้งที่ล็อกอินบัญชีนี้"))

                key = "account:" + hashlib.sha256(username.strip().casefold().encode()).hexdigest()
                cursor.execute(
                    """SELECT attempts, CEIL(EXTRACT(EPOCH FROM expires_at - now()))::int
                       FROM auth_login_buckets WHERE bucket_key = %s AND expires_at > now();""",
                    (key,),
                )
                bucket = cursor.fetchone()
                limit = config.LOGIN_ACCOUNT_LIMIT
                if not bucket:
                    print(f"{OK} โควตาการล็อกอินของบัญชีนี้ว่าง (ลองได้ {limit} ครั้ง/{config.LOGIN_WINDOW_SECONDS} วินาที)")
                elif bucket[0] > limit:
                    problems.append(f"บัญชี {username} ถูกจำกัดการล็อกอินอยู่ อีก {bucket[1]} วินาที")
                    print(f"{BAD} บัญชีนี้โดนจำกัดอยู่: ลองไป {bucket[0]} ครั้ง เกิน {limit} — รออีก {bucket[1]} วินาที")
                    print("       → กรณีนี้ระบบตอบ 429 ไม่ใช่ 500")
                else:
                    print(f"{OK} ใช้โควตาไป {bucket[0]}/{limit} ครั้ง (เหลืออีก {bucket[1]} วินาทีจะรีเซ็ต)")

    print()
    if problems:
        print("เจอปัญหา:")
        for problem in problems:
            print(f"  · {problem}")
        return 1
    print("ทุกอย่างที่ตรวจได้จากสคริปต์นี้ผ่านหมด")
    print("ถ้ายังขึ้น 500 อยู่ ให้ดู traceback บรรทัดสุดท้ายในหน้าต่างที่รัน uvicorn:")
    print("  · OperationalError / InterfaceError 'server closed the connection' = connection ใน pool ตายแล้ว → รีสตาร์ต uvicorn")
    print("  · UndefinedTable = ตารางหาย (ดูด้านบน)")
    print("  · อย่างอื่น ส่ง traceback มาได้เลย")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
