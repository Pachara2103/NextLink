-- ==========================================================================
-- ตาราง LINE ขั้นต่ำสำหรับ "รันบนเครื่องตัวเอง" เท่านั้น
--
-- ฐาน LINE ของจริงมีเจ้าของเป็นบริการฝั่ง LINE webhook (ดูหัว init.sql) ไฟล์
-- นี้ไม่ใช่ schema ของบริการนั้น และไม่ควรถูกรันกับฐานจริงเด็ดขาด - มันสร้าง
-- เฉพาะสองตารางกับคอลัมน์เท่าที่ backend ตัวนี้ "อ่าน" เพื่อให้ console เปิดได้
-- โดยไม่ต้องต่อ Neon:
--
--   line_groups   <- services/line.py::get_line_groups
--   line_messages <- services/line.py::get_groups_messages
--
-- line_group_reads ไม่ได้อยู่ในนี้ เพราะเป็นสถานะของ backend เอง อยู่ฝั่ง
-- nextlink (ดู migrations/line_group_reads.sql)
--
-- รันกับฐานที่ LINE_DATABASE_URL ชี้ไปตอนพัฒนา:
--   psql postgresql://postgres:<รหัส>@localhost:5433/line -f migrations/line_local.sql
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS line_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NULL,
    picture_url TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_messages (
    id BIGSERIAL PRIMARY KEY,
    group_id TEXT NULL,
    -- โค้ดกรอง message_type = 'text' และอ่านเฉพาะ text_content
    message_type TEXT NOT NULL DEFAULT 'text',
    text_content TEXT NULL,
    -- ฝั่ง LINE ใช้คอลัมน์นี้ทำเครื่องหมายว่าอ่านแล้ว init.sql อ้างถึงใน index
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- query ของ "อัปเดตข้อมูล" ไล่ตามกลุ่มและเวลาเสมอ
CREATE INDEX IF NOT EXISTS idx_line_messages_group_created
    ON line_messages (group_id, created_at);

COMMIT;


-- --------------------------------------------------------------------------
-- ข้อมูลตัวอย่าง: เปิดคอมเมนต์ถ้าอยากให้หน้า "สรุปข้อมูลจากไลน์" มีของให้ดู
-- group_id ต้องตรงกับ companies.group_id ในฐาน nextlink ถึงจะ merge กันติด
-- --------------------------------------------------------------------------
-- INSERT INTO line_groups (group_id, display_name) VALUES
--     ('Clocaldev00000000000000000000001', 'กลุ่มทดสอบ - บริษัทตัวอย่าง')
-- ON CONFLICT (group_id) DO NOTHING;
--
-- INSERT INTO line_messages (group_id, message_type, text_content, created_at) VALUES
--     ('Clocaldev00000000000000000000001', 'text', 'สวัสดีครับ ผมชื่อสมชาย ดูแลเรื่องวิชาเลือกของบริษัทครับ', now() - interval '2 hour'),
--     ('Clocaldev00000000000000000000001', 'text', 'ติดต่อผมได้ที่ somchai@example.com เบอร์ 081-234-5678 ครับ', now() - interval '1 hour');
