-- ==========================================================================
-- NextLink - ลบตารางฝั่งแอปทิ้งทั้งหมด เพื่อสร้างใหม่ด้วย init.sql
--
--   !! ลบข้อมูลจริงทิ้งถาวร กู้คืนไม่ได้ !!
--
-- สำรองก่อนรันทุกครั้ง:
--   pg_dump "$DATABASE_PUBLIC_URL" > backup_ก่อนลบ.sql
--
-- รัน:
--   psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f migrations/delete.sql
--
-- ทั้งไฟล์อยู่ใน transaction เดียว ถ้าพังกลางทางจะไม่มีอะไรถูกลบเลย
--
-- --------------------------------------------------------------------------
-- ตารางที่ "ไม่ลบ"
--   users        - บัญชีผู้ใช้ console (init.sql อ้าง FK ไปหา users(id))
--   line_*       - ทั้งหมด 9 ตาราง เป็นของฝั่ง LINE webhook ไม่ใช่ของ backend นี้
--                  (line_attachments, line_group_members, line_groups,
--                   line_messages, line_outbound_*, line_stickers,
--                   line_unsent_messages, line_users, line_webhook_events)
--
-- ตารางที่ลบ (8 ตาราง)
--   companies, coordinators, contacts, mous, notes,
--   chat_histories, token_logs, update_logs
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- ก่อนลบ: ดูว่ามีตาราง line_* ตัวไหนผูก FK มาหาตารางที่จะลบหรือไม่
-- ถ้ามี CASCADE ข้างล่างจะลบ FK ตัวนั้นทิ้งไปด้วยแบบไม่บอก
-- ยกเลิกด้วย ROLLBACK; แล้วมาคุยกันก่อน ถ้า query นี้คืนแถวออกมา
--
--   SELECT conrelid::regclass AS ตารางที่ผูกมา, conname, confrelid::regclass AS ชี้ไปหา
--   FROM pg_constraint
--   WHERE contype = 'f'
--     AND confrelid::regclass::text IN ('companies','coordinators','contacts',
--         'mous','notes','chat_histories','token_logs','update_logs')
--     AND conrelid::regclass::text LIKE 'line\_%';
-- --------------------------------------------------------------------------

-- เรียงตามสายพึ่งพา ลูกก่อนแม่ (CASCADE ใส่ไว้กันตกหล่นอยู่แล้ว)
DROP TABLE IF EXISTS update_logs    CASCADE;
DROP TABLE IF EXISTS token_logs     CASCADE;
DROP TABLE IF EXISTS chat_histories CASCADE;
DROP TABLE IF EXISTS notes          CASCADE;
DROP TABLE IF EXISTS mous           CASCADE;
DROP TABLE IF EXISTS contacts       CASCADE;
DROP TABLE IF EXISTS coordinators   CASCADE;
DROP TABLE IF EXISTS companies      CASCADE;


-- --------------------------------------------------------------------------
-- เก็บกวาดของที่ init.sql รุ่นก่อนไปสร้างไว้บนตารางที่เก็บเอาไว้
-- (trigger ตายไปพร้อมตารางที่ถูก DROP อยู่แล้ว เหลือแต่บน users / line_groups)
-- --------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_users_updated_at       ON users;
DROP TRIGGER IF EXISTS trg_line_groups_updated_at ON line_groups;

DROP FUNCTION IF EXISTS set_updated_at();

-- helper ชั่วคราวของ init.sql รุ่นก่อน เผื่อค้างอยู่จากรอบที่รันไม่จบ
DROP FUNCTION IF EXISTS _nl_add_constraint(text, text, text);
DROP FUNCTION IF EXISTS _nl_add_validated(text, text, text);
DROP FUNCTION IF EXISTS _nl_set_not_null(text, text);
DROP FUNCTION IF EXISTS _nl_to_bigint(text, text, boolean);

-- index ที่ init.sql รุ่นก่อนสร้างบนตาราง line_* (ตัวอื่นหายไปกับตารางแล้ว)
-- คอมเมนต์ไว้: มันช่วย query ของ services/line.py::get_group_messages จริง
-- เอาออกเฉพาะเมื่ออยากคืนสภาพตาราง line_* ให้เหมือนที่ webhook สร้างไว้เป๊ะ ๆ
-- DROP INDEX IF EXISTS idx_line_messages_unread;


-- --------------------------------------------------------------------------
-- schema_migrations - ไม่ลบให้ ตัดสินใจเอง
--
-- ชื่อนี้คือสมุดบันทึกของเครื่องมือ migration (Prisma / node-pg-migrate /
-- golang-migrate ฯลฯ) ซึ่งเกือบแน่ว่าเป็นของฝั่ง LINE webhook ที่สร้าง
-- ตาราง line_* ทั้ง 9 ตัว ถ้าลบทิ้ง เครื่องมือนั้นจะคิดว่ายังไม่เคยรัน
-- migration เลย แล้วอาจไล่สร้าง/แก้ตาราง line_* ใหม่ทั้งชุด
--
-- ดูก่อนว่าใครเป็นเจ้าของ:  SELECT * FROM schema_migrations;
-- ถ้าในนั้นเป็นชื่อ migration ของ backend ตัวนี้เท่านั้น ค่อยเปิดบรรทัดล่าง
--
-- DROP TABLE IF EXISTS schema_migrations CASCADE;
-- --------------------------------------------------------------------------

COMMIT;

-- ตรวจหลังลบ: ควรเหลือแต่ users, line_* และ schema_migrations
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY 1;
