-- ==========================================================================
-- วิชาเลือก: ข้อมูลวิชา ช่วงที่บริษัทสะดวก ผลการจัดตาราง ห้อง และเช็กลิสต์เอกสาร
--
-- รันหลัง init.sql (อ้าง companies / employees) ไฟล์นี้รันซ้ำได้
--
-- หน่วยของเวลาในไฟล์นี้คือ "คาบ" ไม่ใช่วันที่ - หกวัน (จ-ส) คูณสามช่วง
-- (เช้า/บ่าย/เย็น) = 18 คาบต่อสัปดาห์ เพราะบริษัทตอบว่า "พุธเช้าสะดวก"
-- ไม่ใช่ "วันที่ 12 พ.ย. สะดวก" และวิชาหนึ่งสอนคาบเดิมซ้ำไปตลอด weeks
-- สัปดาห์ เก็บเป็นวันที่จริงจะทำให้ตัวจัดตารางกับการตรวจชนใช้ข้อมูลไม่ได้
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- เทอม
--
-- แยกเป็นตารางแทนที่จะใส่ปี/ภาคซ้ำในทุกแถวของ electives เพราะสถานะ
-- "เทอมที่กำลังจัดอยู่" เป็นของเทอม ไม่ใช่ของวิชา และการเปิดเทอมใหม่/ปิดเทอม
-- เก่าเป็นการแก้แถวเดียว ไม่ใช่ไล่แก้ทุกวิชา
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elective_terms (
    id BIGSERIAL PRIMARY KEY,
    academic_year SMALLINT NOT NULL,          -- พ.ศ. เช่น 2569
    semester SMALLINT NOT NULL,               -- 1 = ต้น, 2 = ปลาย, 3 = ฤดูร้อน
    status TEXT NOT NULL DEFAULT 'current',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_elective_terms_year_semester UNIQUE (academic_year, semester),
    CONSTRAINT ck_elective_terms_year CHECK (academic_year BETWEEN 2500 AND 2700),
    CONSTRAINT ck_elective_terms_semester CHECK (semester IN (1, 2, 3)),
    CONSTRAINT ck_elective_terms_status CHECK (status IN ('current', 'archived'))
);

-- มีเทอมที่ "กำลังจัด" ได้ทีละเทอมเดียว - index บนค่าคงที่ เฉพาะแถว current
-- คือวิธีเขียนกฎนี้ลง DB โดยไม่ต้องมี trigger
CREATE UNIQUE INDEX IF NOT EXISTS uq_elective_terms_single_current
    ON elective_terms ((true)) WHERE status = 'current';


-- --------------------------------------------------------------------------
-- ห้องเรียนที่ใช้เปิดวิชาเลือกได้
--
-- แยกจาก classroom ที่เป็นข้อความ เพราะการเลือกห้องใช้ความจุ (ห้องเล็กกว่า
-- จำนวนที่รับ = จัดไม่ได้) และใช้ tier (ห้องภาคจัดได้เลย ห้องคณะต้องยื่นขอ
-- ก่อน ระบบจึงเลือกห้องภาคให้ก่อนเสมอ)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elective_rooms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    building TEXT NOT NULL,
    floor TEXT NOT NULL,
    seats INTEGER NOT NULL,
    -- true = ตัวเลขที่ได้จากการสังเกต ไม่ใช่ตัวเลขที่ผู้ดูแลอาคารยืนยัน
    -- ระบบถือเป็นขอบล่างและแสดงเป็น ~40
    seats_is_estimated BOOLEAN NOT NULL DEFAULT false,
    tier TEXT NOT NULL DEFAULT 'needs_approval',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_elective_rooms_name UNIQUE (building, name),
    CONSTRAINT ck_elective_rooms_seats CHECK (seats BETWEEN 1 AND 2000),
    CONSTRAINT ck_elective_rooms_tier CHECK (tier IN ('ready', 'needs_approval')),
    CONSTRAINT ck_elective_rooms_name_not_blank CHECK (btrim(name) <> '')
);

-- คาบที่ห้องถูกใช้ไปแล้วด้วยเรื่องอื่น (วิชาบังคับ สอบ งานคณะ)
-- reason คือข้อความที่จะขึ้นในช่องนั้นของตาราง
CREATE TABLE IF NOT EXISTS elective_room_blocks (
    room_id BIGINT NOT NULL REFERENCES elective_rooms(id) ON DELETE CASCADE,
    slot TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (room_id, slot),
    CONSTRAINT ck_elective_room_blocks_slot CHECK (slot IN (
        'MON_AM','MON_PM','MON_EVE','TUE_AM','TUE_PM','TUE_EVE',
        'WED_AM','WED_PM','WED_EVE','THU_AM','THU_PM','THU_EVE',
        'FRI_AM','FRI_PM','FRI_EVE','SAT_AM','SAT_PM','SAT_EVE'))
);


-- --------------------------------------------------------------------------
-- วิชาเลือกหนึ่งวิชาในหนึ่งเทอม
--
-- lecturer_id / coordinator_id เป็นคนของ employees ซึ่งผูกกับบริษัทอยู่แล้ว
-- FK คู่ (id, company_id) จึงบังคับได้ว่าอาจารย์ที่ใส่ต้องเป็นคนของบริษัทที่
-- เปิดวิชานี้ ไม่ใช่คนของบริษัทอื่นที่กดผิดแถว
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_id_company ON employees (id, company_id);

CREATE TABLE IF NOT EXISTS electives (
    id BIGSERIAL PRIMARY KEY,
    term_id BIGINT NOT NULL REFERENCES elective_terms(id) ON DELETE RESTRICT,
    -- RESTRICT: ลบบริษัทแล้ววิชาที่เคยเปิดหายไปทั้งแถวคือการลบประวัติ
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

    course_code TEXT NOT NULL,
    section SMALLINT NOT NULL DEFAULT 1,
    elective_name TEXT NOT NULL,
    category TEXT NOT NULL,
    delivery_mode TEXT NOT NULL DEFAULT 'ON_SITE',

    -- จำนวนที่รับ ใช้เป็นเกณฑ์เลือกห้องด้วย (ห้องต้องมีที่นั่งไม่น้อยกว่านี้)
    capacity INTEGER NOT NULL,
    sessions_per_week SMALLINT NOT NULL DEFAULT 1,
    weeks SMALLINT NOT NULL DEFAULT 10,

    lecturer_id BIGINT NOT NULL,
    coordinator_id BIGINT NULL,

    application_form_url TEXT NULL,
    course_syllabus_url TEXT NULL,
    notes TEXT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_electives_code_section UNIQUE (term_id, course_code, section),
    CONSTRAINT fk_electives_lecturer FOREIGN KEY (lecturer_id, company_id)
        REFERENCES employees (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT fk_electives_coordinator FOREIGN KEY (coordinator_id, company_id)
        REFERENCES employees (id, company_id) ON DELETE RESTRICT,
    CONSTRAINT ck_electives_section CHECK (section >= 1),
    CONSTRAINT ck_electives_capacity CHECK (capacity BETWEEN 0 AND 10000),
    CONSTRAINT ck_electives_sessions CHECK (sessions_per_week BETWEEN 1 AND 18),
    CONSTRAINT ck_electives_weeks CHECK (weeks BETWEEN 1 AND 52),
    CONSTRAINT ck_electives_delivery CHECK (delivery_mode IN ('ON_SITE', 'HYBRID', 'ONLINE')),
    CONSTRAINT ck_electives_code_not_blank CHECK (btrim(course_code) <> ''),
    CONSTRAINT ck_electives_name_not_blank CHECK (btrim(elective_name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_electives_term ON electives (term_id);
CREATE INDEX IF NOT EXISTS idx_electives_company ON electives (company_id);
CREATE INDEX IF NOT EXISTS idx_electives_lecturer ON electives (lecturer_id);
-- ปลายทางของ FK คู่จาก elective_sessions (ดูเหตุผลที่นั่น)
CREATE UNIQUE INDEX IF NOT EXISTS uq_electives_id_term ON electives (id, term_id);


-- --------------------------------------------------------------------------
-- ช่วงที่บริษัทแจ้งว่าสอนได้ (prefer_dates เดิม)
--
-- หนึ่งแถวต่อหนึ่งคาบ ไม่ใช่อาเรย์ เพราะเป็นสิ่งที่ต้อง join กับตารางคาบและ
-- ถูกถามว่า "วิชาไหนบ้างที่ว่างพุธเช้า" อยู่ตลอด
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elective_availability (
    elective_id BIGINT NOT NULL REFERENCES electives(id) ON DELETE CASCADE,
    slot TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (elective_id, slot),
    CONSTRAINT ck_elective_availability_slot CHECK (slot IN (
        'MON_AM','MON_PM','MON_EVE','TUE_AM','TUE_PM','TUE_EVE',
        'WED_AM','WED_PM','WED_EVE','THU_AM','THU_PM','THU_EVE',
        'FRI_AM','FRI_PM','FRI_EVE','SAT_AM','SAT_PM','SAT_EVE'))
);

CREATE INDEX IF NOT EXISTS idx_elective_availability_slot ON elective_availability (slot);


-- --------------------------------------------------------------------------
-- ผลการจัด: วิชานี้ลงคาบไหน ห้องไหน (date + classroom เดิม)
--
-- หนึ่งแถว = หนึ่งคาบต่อสัปดาห์ วิชาที่สอนสัปดาห์ละสองคาบก็มีสองแถว
--
-- term_id ซ้ำกับของ electives โดยตั้งใจ: กฎ "ห้องหนึ่งคาบหนึ่งมีคลาสเดียว"
-- เป็นจริงภายในเทอมเดียวกันเท่านั้น (คนละเทอมคือคนละเวลาจริง) การบังคับด้วย
-- UNIQUE จึงต้องมี term อยู่ในคีย์ และ FK คู่ข้างล่างกันไม่ให้ term_id ตรงนี้
-- หลุดจาก term ของวิชา
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elective_sessions (
    id BIGSERIAL PRIMARY KEY,
    elective_id BIGINT NOT NULL REFERENCES electives(id) ON DELETE CASCADE,
    term_id BIGINT NOT NULL,
    slot TEXT NOT NULL,
    -- NULL = วิชาออนไลน์ (ไม่กินห้อง) หรือคาบที่ยังไม่ได้ห้อง
    room_id BIGINT NULL REFERENCES elective_rooms(id) ON DELETE SET NULL,
    -- เวลาจริงในคาบ ตั้งต้นตามขอบคาบ (เช้า 09:00-12:00) ขยับได้ในขอบเขต
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    -- true = คนยืนยันแล้ว ตัวจัดตารางอัตโนมัติห้ามย้ายหรือทิ้ง
    is_locked BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_elective_sessions_term FOREIGN KEY (elective_id, term_id)
        REFERENCES electives (id, term_id) ON DELETE CASCADE,
    -- วิชาเดียวลงคาบเดียวกันสองครั้งไม่ได้ (หน้าเว็บก็ปฏิเสธอยู่แล้ว)
    CONSTRAINT uq_elective_sessions_course_slot UNIQUE (elective_id, slot),
    CONSTRAINT ck_elective_sessions_slot CHECK (slot IN (
        'MON_AM','MON_PM','MON_EVE','TUE_AM','TUE_PM','TUE_EVE',
        'WED_AM','WED_PM','WED_EVE','THU_AM','THU_PM','THU_EVE',
        'FRI_AM','FRI_PM','FRI_EVE','SAT_AM','SAT_PM','SAT_EVE')),
    CONSTRAINT ck_elective_sessions_time CHECK (start_time < end_time),
    CONSTRAINT ck_elective_sessions_source CHECK (source IN ('auto', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_elective_sessions_elective ON elective_sessions (elective_id);
CREATE INDEX IF NOT EXISTS idx_elective_sessions_room ON elective_sessions (room_id) WHERE room_id IS NOT NULL;

-- "ห้องหนึ่ง คาบหนึ่ง ในเทอมหนึ่ง มีได้คลาสเดียว" - บังคับเฉพาะคาบที่ยืนยันแล้ว
--
-- ตั้งใจไม่บังคับกับคาบที่ยังไม่ยืนยัน เพราะหน้าจอยอมให้ลากวิชาทับห้องที่มีคน
-- อยู่ได้ แล้วขึ้นเป็นรายการชนให้เห็นและกดแก้ (ดู detectConflicts) ถ้า DB ห้าม
-- ตั้งแต่แรก การลากนั้นจะกลายเป็น error ตอนบันทึกแทนที่จะเป็นสิ่งที่มองเห็น
-- และแก้ได้ - แต่สองคาบที่คนกดยืนยันแล้วห้ามทับกันเด็ดขาด
CREATE UNIQUE INDEX IF NOT EXISTS uq_elective_sessions_locked_room_slot
    ON elective_sessions (term_id, room_id, slot) WHERE is_locked;


-- --------------------------------------------------------------------------
-- เช็กลิสต์งานเอกสารของวิชา (หน้า "เช็กลิสต์งานเอกสาร")
--
-- ลูกถือ FK ของพ่อแบบเดียวกับ mous: วิชาหนึ่งมีเช็กลิสต์ได้แถวเดียว ลบวิชา
-- แล้วเช็กลิสต์ตามไป และไม่มีทางเกิดวิชาที่ชี้ไปเช็กลิสต์ของวิชาอื่น
--
-- สองแบบคำตอบ: จดหมายเป็นของที่ "รอ" (มีสถานะกำลังดำเนินการ) ส่วนงาน MCV
-- เจ้าหน้าที่ทำเอง จบหรือไม่จบเท่านั้น
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elective_checklists (
    elective_id BIGINT PRIMARY KEY REFERENCES electives(id) ON DELETE CASCADE,

    invite_letter TEXT NOT NULL DEFAULT 'NOT_RECEIVED',        -- ทำจดหมายเชิญ
    instruction_letter TEXT NOT NULL DEFAULT 'NOT_RECEIVED',   -- จดหมาย + แจ้งจำนวนชั่วโมงสอน

    inform_lecturer TEXT NOT NULL DEFAULT 'NOT_DONE',          -- แจ้ง อ.พิเศษ ขอสิทธิ์ instructor
    create_mcv TEXT NOT NULL DEFAULT 'NOT_DONE',               -- สร้างคอร์สใน MCV
    invite_mentor TEXT NOT NULL DEFAULT 'NOT_DONE',            -- ดึงอาจารย์พี่เลี้ยง
    invite_lecturer TEXT NOT NULL DEFAULT 'NOT_DONE',          -- ดึงอาจารย์พิเศษ
    invite_students TEXT NOT NULL DEFAULT 'NOT_DONE',          -- ดึงนิสิตเข้า MCV

    -- รหัสสำหรับนิสิตกด join ไม่ใช่รหัสผ่านของใคร จึงไม่ถูกซ่อนหรือ hash
    mcv_join_code TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_elective_checklists_letters CHECK (
        invite_letter IN ('NOT_RECEIVED', 'IN_PROGRESS', 'RECEIVED')
        AND instruction_letter IN ('NOT_RECEIVED', 'IN_PROGRESS', 'RECEIVED')),
    CONSTRAINT ck_elective_checklists_tasks CHECK (
        inform_lecturer IN ('NOT_DONE', 'DONE')
        AND create_mcv IN ('NOT_DONE', 'DONE')
        AND invite_mentor IN ('NOT_DONE', 'DONE')
        AND invite_lecturer IN ('NOT_DONE', 'DONE')
        AND invite_students IN ('NOT_DONE', 'DONE'))
);

COMMIT;
