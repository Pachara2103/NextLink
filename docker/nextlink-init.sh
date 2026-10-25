#!/bin/sh
# ลำดับสำคัญ: postgres image รันทุกไฟล์ใน /docker-entrypoint-initdb.d เรียงตาม
# ชื่อ ซึ่งจะได้ elective_seed.sql ก่อน electives.sql ก่อน init.sql - พังทันที
# เพราะ electives อ้าง companies/employees และ seed อ้างตาราง elective_*
# สคริปต์นี้จึงเป็นที่เดียวที่ตัดสินลำดับ และ ON_ERROR_STOP ทำให้ฐานที่สร้าง
# ไม่สำเร็จไม่ถูกส่งต่อไปเป็น "ฐานที่ใช้ได้" แบบเงียบ ๆ
set -eu

for file in init.sql security.sql electives.sql elective_seed.sql; do
    echo "== migrations/$file"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        --file "/migrations/$file"
done

echo "== ฐาน $POSTGRES_DB พร้อมใช้งาน"
