"""สร้างบัญชีสำหรับล็อกอินเข้าเว็บ — เขียนลงตาราง users ของฐาน nextlink

รันจากโฟลเดอร์ backend (ใน venv เดียวกับที่รัน uvicorn):

    .venv\\Scripts\\python create_user.py admin
    .venv\\Scripts\\python create_user.py admin --display "เจ้าหน้าที่ภาค"
    .venv\\Scripts\\python create_user.py admin --password-from-env NEW_USER_PASSWORD

รหัสผ่านถูกถามแบบไม่แสดงบนจอ (getpass) โดยค่าเริ่มต้น จะได้ไม่ติดอยู่ใน
ประวัติคำสั่งของ shell — ตัวเลือก --password-from-env มีไว้สำหรับสคริปต์
ตั้งค่าเครื่องเท่านั้น

ทำไมต้องมีไฟล์นี้แทนที่จะ INSERT เอง: คอลัมน์ password เก็บ bcrypt hash และ
services/user.py::login เทียบด้วย bcrypt.checkpw แถวที่ใส่รหัสผ่านเป็นข้อความ
ธรรมดาจะล็อกอินไม่ผ่าน และจะขึ้นเป็น 500 ("stored hash is unusable") ไม่ใช่
"รหัสผ่านไม่ถูกต้อง" ซึ่งหาสาเหตุยากกว่ามาก ไฟล์นี้จึงเรียก create_user ตัวเดียว
กับที่แอปใช้ แทนที่จะเขียน SQL เองให้มีที่ที่ตัดสินใจเรื่อง hash สองที่
"""

import argparse
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    parser = argparse.ArgumentParser(description="สร้างบัญชีผู้ใช้สำหรับล็อกอิน")
    parser.add_argument("username", help="ชื่อผู้ใช้ (ต้องไม่ซ้ำกับที่มีอยู่)")
    parser.add_argument("--display", default=None, help="ชื่อที่แสดงในเว็บ (ไม่ใส่ก็ได้)")
    parser.add_argument(
        "--password-from-env",
        default=None,
        metavar="NAME",
        help="อ่านรหัสผ่านจาก environment variable ชื่อนี้ แทนการถามบนจอ",
    )
    args = parser.parse_args()

    if args.password_from_env:
        password = os.environ.get(args.password_from_env) or ""
        if not password:
            print(f"ผิด: ไม่มีค่าใน {args.password_from_env}")
            return 1
    else:
        password = getpass.getpass("รหัสผ่าน: ")
        if password != getpass.getpass("พิมพ์รหัสผ่านอีกครั้ง: "):
            print("ผิด: รหัสผ่านสองครั้งไม่ตรงกัน")
            return 1

    # เท่ากับ update_password ซึ่งเป็นทางเดียวที่รหัสผ่านจะถูกเปลี่ยนทีหลัง
    # ถ้าที่นี่ยอมให้สั้นกว่านั้น บัญชีที่สร้างวันนี้จะแก้รหัสของตัวเองไม่ได้
    if len(password) < 8:
        print("ผิด: รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
        return 1

    try:
        from core import config
        from core.db import nl_db
        from services.user import create_user
    except Exception as error:  # noqa: BLE001
        print(f"ผิด: โหลดโมดูลของ backend ไม่ได้ — {error}")
        return 1

    if not config.NEXTLINK_DATABASE_URL:
        print(f"ผิด: ยังไม่ได้ตั้ง NEXTLINK_DATABASE_URL ใน {config.ENV_PATH}")
        return 1

    try:
        profile = create_user(args.username, password)
    except Exception as error:  # noqa: BLE001
        # core/db.py ห่อ psycopg2 ไว้ใน DatabaseError ที่ข้อความเป็น "เกิดข้อ
        # ผิดพลาดไม่ทราบสาเหตุ" ชื่อ constraint จึงไม่อยู่ในข้อความ - ต้นเหตุจริง
        # อยู่ที่ pgcode ของ exception ชั้นใน (23505 = unique_violation)
        cause = error.__cause__ or error.__context__
        if getattr(cause, "pgcode", None) == "23505":
            print(f"ผิด: มีผู้ใช้ชื่อ {args.username} อยู่แล้ว")
        else:
            print(f"ผิด: สร้างบัญชีไม่สำเร็จ — {error}")
        return 1

    if args.display:
        with nl_db.get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET display_name = %s, updated_at = now() WHERE id = %s;",
                    (args.display, profile.id),
                )
            conn.commit()

    print(f"  ok   สร้างบัญชี {args.username} แล้ว (id = {profile.id}) — ล็อกอินได้เลย")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
