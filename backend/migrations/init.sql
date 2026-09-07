-- ==========================================================================
-- NextLink - PostgreSQL schema
--
-- ไฟล์นี้มีแต่ CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- ไม่มี ALTER TABLE, ไม่มี function, ไม่มี trigger
--
-- แปลว่ามันสร้างของที่ยังไม่มีได้ แต่ "ไม่แก้" ตารางที่มีอยู่แล้ว
-- ถ้าโครงตารางในฐานข้อมูลไม่ตรงกับไฟล์นี้ ต้องลบแล้วสร้างใหม่:
--
--   pg_dump "$DATABASE_PUBLIC_URL" > backup.sql          # สำรองก่อน
--   psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f migrations/delete.sql
--   psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f migrations/init.sql
--
-- ไม่มี trigger updated_at (trigger ต้องมี function) ทุก UPDATE จึงต้องเขียน
-- `updated_at = now()` ในคำสั่ง SQL เอง เหมือนที่ services/*.py ทำอยู่
-- ==========================================================================


-- ==========================================================================
-- ตารางของฝั่ง LINE webhook
--
-- line_* ทั้ง 9 ตารางมีเจ้าของเป็นบริการฝั่ง LINE ไม่ใช่ backend ตัวนี้
-- ไฟล์นี้จึงไม่ประกาศมันไว้ ยกเว้น line_groups ตัวเดียว เพราะเป็นปลายทาง
-- ของ FK จาก 4 ตารางข้างล่าง - บล็อกนี้มีไว้ให้ DB เปล่า ๆ (dev/test) รันไฟล์
-- นี้ผ่านได้เท่านั้น กับ DB จริงที่มีตารางอยู่แล้ว บล็อกนี้จะถูกข้าม
-- ==========================================================================

CREATE TABLE IF NOT EXISTS line_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NULL,
    picture_url TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at TIMESTAMPTZ NULL,
    left_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ==========================================================================
-- ผู้ใช้ console
-- ==========================================================================

CREATE TABLE IF NOT EXISTS users (
    -- BIGSERIAL: ทุกตารางที่เก็บ user_id เป็น BIGINT ถ้าฝั่งนี้เป็น int4
    -- การ join u.id = l.user_id จะข้ามชนิดกันตลอด
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NULL,
    password TEXT NOT NULL,               -- bcrypt hash
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ==========================================================================
-- บริษัท ผูกกับกลุ่ม LINE หนึ่งกลุ่ม
-- ==========================================================================

CREATE TABLE IF NOT EXISTS companies (
    id BIGSERIAL PRIMARY KEY,
    -- UNIQUE: หนึ่งกลุ่ม LINE ต่อหนึ่งบริษัท
    -- ON DELETE SET NULL: กลุ่มหายไปแต่บริษัทยังอยู่ แค่ไม่ผูกกับกลุ่มไหน
    group_id TEXT NULL UNIQUE REFERENCES line_groups(group_id) ON DELETE SET NULL,
    company_th TEXT NULL,
    company_en TEXT NULL,
    -- NULL ได้ ไม่ใช่ '{}' บังคับ: UPDATE ใช้ COALESCE บนคอลัมน์นี้
    aliases TEXT[] NULL DEFAULT '{}'::text[],
    is_linked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- create_company_pg / update_company_pg เช็คเงื่อนไขนี้ใน Python อยู่แล้ว
    CONSTRAINT ck_companies_has_name
        CHECK (company_th IS NOT NULL OR company_en IS NOT NULL)
);


-- ==========================================================================
-- ผู้ประสานงานที่ AI สรุปมาจากแชท LINE รอคนอนุมัติ
-- ==========================================================================

CREATE TABLE IF NOT EXISTS coordinators (
    id BIGSERIAL PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES line_groups(group_id) ON DELETE CASCADE,
    -- NULL = ยังไม่มีใครอนุมัติ (approve_pg เติม user_id ตอนกดอนุมัติ)
    -- ห้ามใช้เลข 0 แทนความหมายนี้ 0 ไม่ใช่ id ที่มีอยู่จริงใน users
    user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    name_th TEXT NULL,
    name_en TEXT NULL,
    nickname TEXT NULL,
    job_title TEXT NULL,
    phone TEXT NULL,
    email TEXT NULL,
    relevant TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_coordinators_status
        CHECK (status IN ('pending', 'approved', 'declined')),
    CONSTRAINT ck_coordinators_relevant
        CHECK (relevant IS NULL
               OR relevant IN ('mou', 'elective', 'internship', 'coop', 'friday')),
    -- แถวที่ไม่มีทั้งสามชื่อ อ่านไม่ออกว่าเป็นใคร
    CONSTRAINT ck_coordinators_has_name
        CHECK (name_th IS NOT NULL OR name_en IS NOT NULL OR nickname IS NOT NULL)
);


-- ==========================================================================
-- ผู้ติดต่อที่คนกรอกเข้ามาเอง (คนละเรื่องกับ coordinators)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS contacts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nickname TEXT NULL,
    role TEXT NOT NULL DEFAULT 'instructor',
    status TEXT NOT NULL DEFAULT 'active',
    -- TEXT ไม่ใช่ VARCHAR(20): "081-234-5678, 02-123-4567" ยาวเกิน 20 แล้ว
    phone TEXT NULL,
    email TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_contacts_role
        CHECK (role IN ('instructor', 'senior', 'alumni', 'insider')),
    CONSTRAINT ck_contacts_status
        CHECK (status IN ('active', 'resigned', 'transferred', 'inactive')),
    CONSTRAINT ck_contacts_name_not_blank CHECK (btrim(name) <> '')
);


-- ==========================================================================
-- สถานะ MOU หนึ่งบริษัทหนึ่งแถว
-- ==========================================================================

CREATE TABLE IF NOT EXISTS mous (
    id BIGSERIAL PRIMARY KEY,
    -- UNIQUE เพราะ get_mou_status ทำ db_map[company_id] = row
    -- ถ้าบริษัทเดียวมี 2 แถว แถวหลังจะทับแถวแรกแบบไม่มีใครรู้
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_status TEXT NOT NULL,
    is_authorized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_mous_company_id UNIQUE (company_id),
    CONSTRAINT ck_mous_document_status CHECK (
        document_status IN (
            'legal_revision_chula',
            'company_legal_review',
            'authorization',
            'pending_signature',
            'signed',
            'signed_with_university',
            'signed_subsidiary',
            'chula_department_review',
            'rejected',
            'unsigned'
        )
    )
);


-- ==========================================================================
-- โน้ต ผูกกับบริษัท (ผ่าน group_id) หรือกับผู้ประสานงานหนึ่งคน
-- ==========================================================================

CREATE TABLE IF NOT EXISTS notes (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    -- RESTRICT ไม่ใช่ CASCADE: โน้ตเป็นของที่คนพิมพ์เอง การลบกลุ่ม LINE
    -- ไม่ควรกินโน้ตหายไปเงียบ ๆ ให้ error ออกมาให้เห็นดีกว่า
    group_id TEXT NOT NULL REFERENCES line_groups(group_id) ON DELETE RESTRICT,
    person_id BIGINT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'mou',
    sentiment TEXT NOT NULL DEFAULT 'neutral',
    source TEXT NOT NULL DEFAULT 'external',
    academic_year INTEGER NOT NULL,
    term INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_notes_type CHECK (
        type IN ('mou', 'elective', 'internship', 'coop', 'friday',
                 'hr', 'coordinator', 'instructor')
    ),
    CONSTRAINT ck_notes_sentiment
        CHECK (sentiment IN ('positive', 'neutral', 'warning', 'negative')),
    CONSTRAINT ck_notes_source
        CHECK (source IN ('internal', 'external')),
    CONSTRAINT ck_notes_term CHECK (term IN (1, 2, 3)),
    -- ปี ค.ศ. (utils/academic_year.py คืน dt.year)
    CONSTRAINT ck_notes_academic_year CHECK (academic_year BETWEEN 2000 AND 2100),
    CONSTRAINT ck_notes_content_not_blank CHECK (btrim(content) <> ''),
    -- กฎเดียวกับ services/note.py::_validate:
    -- โน้ตของคน (hr/coordinator/instructor) ต้องมี person_id
    -- โน้ตของบริษัทต้องไม่มี
    CONSTRAINT ck_notes_person_binding CHECK (
        (type IN ('hr', 'coordinator', 'instructor') AND person_id IS NOT NULL)
        OR
        (type NOT IN ('hr', 'coordinator', 'instructor') AND person_id IS NULL)
    )
);


-- ==========================================================================
-- ประวัติแชทกับ agent
-- ==========================================================================

CREATE TABLE IF NOT EXISTS chat_histories (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_chat_histories_role CHECK (role IN ('user', 'ai'))
);


-- ==========================================================================
-- log การใช้ token ของ LLM
-- ==========================================================================

CREATE TABLE IF NOT EXISTS token_logs (
    -- BIGSERIAL: ตารางนี้โตเร็วที่สุดในระบบ (1 แถวต่อ 1 การเรียก LLM)
    id BIGSERIAL PRIMARY KEY,
    log_type TEXT NOT NULL,
    step_name TEXT NOT NULL,
    group_id TEXT NULL REFERENCES line_groups(group_id) ON DELETE SET NULL,
    -- NULL ได้: TokenTrackerHandler มี default user_id=0 สำหรับงานที่ระบบ
    -- ทำเอง ไม่ได้มีคนสั่ง
    user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_token_logs_log_type CHECK (log_type IN ('line_group', 'chat')),
    CONSTRAINT ck_token_logs_counts CHECK (
        input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0
    )
);


-- ==========================================================================
-- ประวัติการกดปุ่ม "อัปเดตข้อมูล"
-- ==========================================================================

CREATE TABLE IF NOT EXISTS update_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ไม่ null ตอนอ่านออกไป: get_update_logs ใช้ COALESCE ให้เป็น '{}'
    error_groups TEXT[] NULL DEFAULT '{}'::text[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ==========================================================================
-- index
--
-- ทุกตัวมาจาก query ที่ backend ยิงจริง เขียนชื่อฟังก์ชันกำกับไว้
-- PK / UNIQUE มี index ให้แล้วโดยปริยาย ไม่ต้องสร้างซ้ำที่
-- users.username, companies.group_id, mous.company_id
-- ==========================================================================

-- services/chat_history.py::get_chat_histories
--   WHERE user_id = %s ORDER BY created_at DESC LIMIT 20
-- user_id ใช้กรอง created_at ใช้เรียง -> อ่าน 20 แถวแรกของ index ได้เลย
-- ไม่ต้อง sort ประวัติทั้งหมดของคนนั้น
CREATE INDEX IF NOT EXISTS idx_chat_histories_user_created
    ON chat_histories (user_id, created_at DESC);

-- services/contact.py::get_contacts (WHERE company_id = %s) + รองรับ FK
CREATE INDEX IF NOT EXISTS idx_contacts_company_id
    ON contacts (company_id);

-- services/note.py::SELECT_NOTES
--   LEFT JOIN companies ON c.group_id = n.group_id
--   LEFT JOIN coordinators ON p.id = n.person_id
CREATE INDEX IF NOT EXISTS idx_notes_group_id
    ON notes (group_id);
CREATE INDEX IF NOT EXISTS idx_notes_person_id
    ON notes (person_id) WHERE person_id IS NOT NULL;

-- services/note.py::get_notes
--   ORDER BY academic_year DESC NULLS LAST, term DESC NULLS LAST, updated_at DESC
-- ต้องใส่ NULLS LAST ให้ตรงกับ ORDER BY เป๊ะ ไม่งั้น planner ใช้เรียงไม่ได้
CREATE INDEX IF NOT EXISTS idx_notes_listing
    ON notes (academic_year DESC NULLS LAST, term DESC NULLS LAST, updated_at DESC);

-- FK ของ coordinators + ใช้หาว่ากลุ่มนี้มีใครบ้าง
CREATE INDEX IF NOT EXISTS idx_coordinators_group_id
    ON coordinators (group_id);
CREATE INDEX IF NOT EXISTS idx_coordinators_user_id
    ON coordinators (user_id) WHERE user_id IS NOT NULL;
-- partial: หน้ารออนุมัติเปิดบ่อย และ pending เป็นส่วนน้อยของตาราง
CREATE INDEX IF NOT EXISTS idx_coordinators_pending
    ON coordinators (created_at DESC) WHERE status = 'pending';

-- services/line.py::get_update_logs - ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_update_logs_created
    ON update_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_update_logs_user_id
    ON update_logs (user_id);

-- token_logs: ตารางรายงาน อ่านเป็นช่วงเวลา / รายคน / รายกลุ่ม
CREATE INDEX IF NOT EXISTS idx_token_logs_created
    ON token_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_logs_user_created
    ON token_logs (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_token_logs_group_created
    ON token_logs (group_id, created_at DESC) WHERE group_id IS NOT NULL;

-- line_messages เป็นตารางของฝั่ง LINE webhook แต่
-- services/line.py::get_group_messages ยิง query หนักใส่มันทุกครั้งที่กด
-- "อัปเดตข้อมูล":
--   WHERE group_id IS NOT NULL AND is_read = false
--   ORDER BY group_id, created_at ASC FOR UPDATE SKIP LOCKED
-- partial index บนแถวที่ยังไม่ได้อ่านคือของที่ต้องมี เพราะแถว is_read = true
-- จะกองสะสมไปเรื่อย ๆ แต่ query นี้ไม่เคยแตะมันเลย
--
-- เปิดบรรทัดนี้เมื่อรันกับ DB จริงที่มีตาราง line_messages อยู่
-- (ปิดไว้เพราะไฟล์นี้ไม่มี DO block ไว้เช็คว่าตารางมีอยู่ไหม จะพังกับ DB เปล่า)
-- CREATE INDEX IF NOT EXISTS idx_line_messages_unread
--     ON line_messages (group_id, created_at) WHERE is_read = false;
