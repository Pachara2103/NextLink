-- ==========================================================================
-- ปรับรูปตารางวิชาเลือกสำหรับ "ฐานที่สร้างไปแล้ว"
--
-- สองอย่างที่ electives.sql เปลี่ยนไป และ CREATE TABLE IF NOT EXISTS ตามไม่ทัน
-- เพราะตารางมีอยู่แล้ว:
--
--   1. elective_rooms.tier            -> elective_rooms.type
--   2. elective_availability          -> หนึ่งแถวต่อหนึ่งวิชา เก็บ slots TEXT[]
--      (เดิมหนึ่งแถวต่อหนึ่งคาบ คอลัมน์ slot TEXT)
--
-- ฐานที่สร้างใหม่จาก electives.sql ไม่ต้องรันไฟล์นี้ - รันแล้วก็ไม่เป็นไร ทุก
-- ขั้นตรวจก่อนว่าต้องทำหรือเปล่า ไฟล์นี้จึงรันซ้ำได้และรันผิดฐานไม่ได้ทำอะไรเสีย
--
--   psql -d nextlink -f backend/migrations/elective_reshape.sql
--
-- ข้อมูลเดิมย้ายครบ: คาบที่บริษัทแจ้งไว้ถูกยุบเป็นอาเรย์เรียงตามลำดับการอ่าน
-- ตาราง (จันทร์เช้าก่อน) เหมือนที่ _sorted_slots คืนค่า
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. tier -> type
--
-- การ RENAME COLUMN ทำให้ postgres แก้นิพจน์ของ CHECK ที่อ้างคอลัมน์นี้ให้เอง
-- เหลือแค่ *ชื่อ* ของ constraint ที่ยังพูดถึงคำเดิม
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'elective_rooms'
          AND column_name = 'tier'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'elective_rooms'
              AND column_name = 'type'
        ) THEN
            RAISE EXCEPTION
                'elective_rooms มีทั้ง tier และ type - ต้องรวมสองคอลัมน์ด้วยมือก่อน';
        END IF;

        ALTER TABLE elective_rooms RENAME COLUMN tier TO type;
        RAISE NOTICE 'elective_rooms: เปลี่ยนชื่อคอลัมน์ tier เป็น type แล้ว';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_elective_rooms_tier'
    ) THEN
        ALTER TABLE elective_rooms
            RENAME CONSTRAINT ck_elective_rooms_tier TO ck_elective_rooms_type;
    END IF;
END $$;


-- --------------------------------------------------------------------------
-- 2. elective_availability: หลายแถว -> อาเรย์แถวเดียว
--
-- สร้างตารางใหม่ ย้ายข้อมูล แล้วค่อยสลับชื่อ ไม่ใช่ ALTER ทีละขั้น: คอลัมน์
-- slot เป็นส่วนหนึ่งของ primary key อยู่ การแปลงในที่เดิมจึงต้องถอด PK ออก
-- ก่อน ซึ่งระหว่างนั้นตารางยอมให้มีแถวซ้ำ
-- --------------------------------------------------------------------------
DO $$
DECLARE
    moved int;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'elective_availability'
          AND column_name = 'slot'
    ) THEN
        RETURN;   -- ตารางเป็นรูปใหม่อยู่แล้ว
    END IF;

    CREATE TABLE elective_availability__new (
        elective_id BIGINT PRIMARY KEY REFERENCES electives(id) ON DELETE CASCADE,
        slots TEXT[] NOT NULL DEFAULT '{}'::text[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_elective_availability_slots CHECK (slots <@ ARRAY[
            'MON_AM','MON_PM','MON_EVE','TUE_AM','TUE_PM','TUE_EVE',
            'WED_AM','WED_PM','WED_EVE','THU_AM','THU_PM','THU_EVE',
            'FRI_AM','FRI_PM','FRI_EVE','SAT_AM','SAT_PM','SAT_EVE']::text[])
    );

    INSERT INTO elective_availability__new (elective_id, slots, created_at, updated_at)
    SELECT
        elective_id,
        array_agg(DISTINCT slot ORDER BY slot) FILTER (WHERE slot IS NOT NULL),
        min(created_at),
        now()
    FROM elective_availability
    GROUP BY elective_id;

    -- array_agg ข้างบนเรียงตามตัวอักษร (FRI ก่อน MON) - เรียงใหม่ตามลำดับการ
    -- อ่านตาราง ให้ตรงกับที่ _sorted_slots คืนค่า
    UPDATE elective_availability__new SET slots = ordered.slots
    FROM (
        SELECT
            a.elective_id,
            array_agg(s.slot ORDER BY array_position(ARRAY[
                'MON_AM','MON_PM','MON_EVE','TUE_AM','TUE_PM','TUE_EVE',
                'WED_AM','WED_PM','WED_EVE','THU_AM','THU_PM','THU_EVE',
                'FRI_AM','FRI_PM','FRI_EVE','SAT_AM','SAT_PM','SAT_EVE']::text[],
                s.slot)) AS slots
        FROM elective_availability__new a, unnest(a.slots) AS s(slot)
        GROUP BY a.elective_id
    ) AS ordered
    WHERE ordered.elective_id = elective_availability__new.elective_id;

    SELECT count(*) INTO moved FROM elective_availability__new;

    DROP TABLE elective_availability;
    ALTER TABLE elective_availability__new RENAME TO elective_availability;
    -- ชื่อ constraint ไม่ตามชื่อตารางไปเอง - ตั้งให้ตรงกับที่ electives.sql
    -- สร้าง เพื่อให้ฐานที่ย้ายมากับฐานที่สร้างใหม่หน้าตาเหมือนกันทุกจุด
    ALTER TABLE elective_availability
        RENAME CONSTRAINT elective_availability__new_pkey TO elective_availability_pkey;
    ALTER TABLE elective_availability
        RENAME CONSTRAINT elective_availability__new_elective_id_fkey
                       TO elective_availability_elective_id_fkey;

    CREATE INDEX IF NOT EXISTS idx_elective_availability_slots
        ON elective_availability USING GIN (slots);

    RAISE NOTICE 'elective_availability: ยุบเป็นอาเรย์แล้ว % วิชา', moved;
END $$;

COMMIT;
