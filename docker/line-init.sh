#!/bin/sh
# ตาราง LINE ฉบับย่อสำหรับพัฒนาเท่านั้น ดู backend/migrations/local/README.md
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --file "/migrations/line_local.sql"

echo "== ฐาน $POSTGRES_DB (LINE ฉบับย่อ) พร้อมใช้งาน"
